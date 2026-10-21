/** Daily local-time quiet windows. UTC minute boundaries also cover repeated and
 * missing wall-clock minutes at daylight-saving transitions. */
export interface ContactQuietHours {timeZone:string;start:string;end:string}
const clock=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const minute=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
const formatter=(timeZone:string)=>new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function normalizeContactQuietHours(raw:any):ContactQuietHours{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['timeZone','start','end'].includes(key)))throw Error('Quiet hours need a time zone, start and end');
 if(typeof raw.timeZone!=='string'||!raw.timeZone||raw.timeZone.length>128||/^[+-]/.test(raw.timeZone))throw Error('Quiet hours need an IANA time zone');
 try{formatter(raw.timeZone)}catch{throw Error('Quiet hours need an IANA time zone')}
 if(typeof raw.start!=='string'||typeof raw.end!=='string'||!clock.test(raw.start)||!clock.test(raw.end)||raw.start===raw.end)throw Error('Quiet hours need distinct start and end times in HH:mm');
 return {timeZone:raw.timeZone,start:raw.start,end:raw.end};
}
export function contactQuietUntil(policy:ContactQuietHours,now:number):number|null{
 const format=formatter(policy.timeZone),start=minute(policy.start),end=minute(policy.end);
 const quiet=(at:number)=>{const parts=format.formatToParts(at),hour=Number(parts.find(p=>p.type==='hour')!.value),min=Number(parts.find(p=>p.type==='minute')!.value),local=hour*60+min;return start<end?local>=start&&local<end:local>=start||local<end};
 if(!quiet(now))return null;
 // Check each real minute, not a guessed UTC offset: a repeated hour can end
 // this window at the clock change itself, and a skipped end ends at the jump.
 // The bound also covers a whole skipped calendar day in the IANA database.
 for(let at=Math.floor(now/60000)*60000+60000;at<=now+72*3600000;at+=60000)if(!quiet(at))return at;
 throw Error('Quiet hours have no end within three days');
}
