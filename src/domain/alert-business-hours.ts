import {normalizeContactQuietHours} from './contact-quiet.ts'
export type RouteBusinessHours={timeZone:string;weekdays:number[];start:string;end:string;selection:'inside'|'outside'|'always'}
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const minute=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
export function normalizeBusinessHours(raw:any):RouteBusinessHours|null{
 if(raw==null)return null;
 if(typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['timeZone','weekdays','start','end','selection'].includes(k)))throw Error('Business hours need a weekly IANA-zone window and inside, outside or always selection');
 const window=normalizeContactQuietHours({timeZone:raw.timeZone,start:raw.start,end:raw.end});
 if(!Array.isArray(raw.weekdays)||!raw.weekdays.length||raw.weekdays.length>7||raw.weekdays.some((day:any)=>!Number.isInteger(day)||day<0||day>6)||new Set(raw.weekdays).size!==raw.weekdays.length||!['inside','outside','always'].includes(raw.selection))throw Error('Use distinct business weekdays 0 (Sunday) to 6 (Saturday), and inside, outside or always selection');
 return {...window,weekdays:[...raw.weekdays].sort(),selection:raw.selection};
}
/** Evaluate real local wall time, including both copies of a repeated hour.
 * An overnight window belongs to the weekday on which it starts. */
export function businessHoursSelected(policy:RouteBusinessHours|null,at:number){
 if(!policy||policy.selection==='always')return true;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:policy.timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);
 const value=(key:string)=>parts.find(p=>p.type===key)!.value,day=days.indexOf(value('weekday')),local=Number(value('hour'))*60+Number(value('minute')),start=minute(policy.start),end=minute(policy.end);
 const inside=start<end?policy.weekdays.includes(day)&&local>=start&&local<end:
  policy.weekdays.includes(day)&&local>=start||policy.weekdays.includes((day+6)%7)&&local<end;
 return policy.selection==='inside'?inside:!inside;
}
