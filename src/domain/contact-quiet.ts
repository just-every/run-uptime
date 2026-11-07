/** Local-time hold windows. Without `businessDays` the window is a daily quiet window (an end before the start runs
 * overnight). With `businessDays` (0 Sunday to 6 Saturday) start and end are business hours on those local days and
 * everything outside them is quiet, so weekends and a Friday evening hold until the next business start. UTC minute
 * boundaries also cover repeated and missing wall-clock minutes at daylight-saving transitions. */
export interface ContactQuietHours {timeZone:string;start:string;end:string;businessDays?:number[]}
const clock=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const minute=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
const formatter=(timeZone:string)=>new Intl.DateTimeFormat('en-GB',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function normalizeContactQuietHours(raw:any):ContactQuietHours{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['timeZone','start','end','businessDays'].includes(key)))throw Error('Quiet hours need a time zone, start and end');
 if(typeof raw.timeZone!=='string'||!raw.timeZone||raw.timeZone.length>128||/^[+-]/.test(raw.timeZone))throw Error('Quiet hours need an IANA time zone');
 try{formatter(raw.timeZone)}catch{throw Error('Quiet hours need an IANA time zone')}
 if(typeof raw.start!=='string'||typeof raw.end!=='string'||!clock.test(raw.start)||!clock.test(raw.end)||raw.start===raw.end)throw Error('Quiet hours need distinct start and end times in HH:mm');
 const result:ContactQuietHours={timeZone:raw.timeZone,start:raw.start,end:raw.end};
 if(raw.businessDays!==undefined){
  const days=raw.businessDays;
  if(!Array.isArray(days)||!days.length||days.length>7||days.some((d:any)=>!Number.isInteger(d)||d<0||d>6)||new Set(days).size!==days.length)throw Error('Business days are 1 to 7 distinct weekdays, 0 (Sunday) to 6 (Saturday)');
  if(minute(raw.start)>=minute(raw.end))throw Error('Business hours must start before they end on the same day');
  result.businessDays=[...days].sort((a:number,b:number)=>a-b);
 }
 return result;
}
export function contactQuietUntil(policy:ContactQuietHours,now:number):number|null{
 const format=formatter(policy.timeZone),start=minute(policy.start),end=minute(policy.end),days=policy.businessDays;
 const quiet=(at:number)=>{
  const parts=format.formatToParts(at),hour=Number(parts.find(p=>p.type==='hour')!.value),min=Number(parts.find(p=>p.type==='minute')!.value),local=hour*60+min;
  if(days)return !(days.includes(weekdays.indexOf(parts.find(p=>p.type==='weekday')!.value))&&local>=start&&local<end);
  return start<end?local>=start&&local<end:local>=start||local<end;
 };
 if(!quiet(now))return null;
 // Check each real minute, not a guessed UTC offset: a repeated hour can end
 // this window at the clock change itself, and a skipped end ends at the jump.
 // The bound also covers a whole skipped calendar day in the IANA database.
 // Weekly business hours may hold for up to a week.
 const span=days?8*24:72;
 for(let at=Math.floor(now/60000)*60000+60000;at<=now+span*3600000;at+=60000)if(!quiet(at))return at;
 throw Error(days?'Business hours have no start within eight days':'Quiet hours have no end within three days');
}
