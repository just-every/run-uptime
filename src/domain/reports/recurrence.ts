import {ReportInputError} from './period.ts'
const day=86400000
function parts(at:number,zone:string){const p=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at);return ['year','month','day','hour','minute','second'].map(type=>Number(p.find(p=>p.type===type)!.value))}
export function recurrenceZone(zone:unknown){if(typeof zone!=='string'||/^[+-]/.test(zone))throw new ReportInputError('Choose an IANA recurrence time zone');try{return new Intl.DateTimeFormat('en-US',{timeZone:zone}).resolvedOptions().timeZone}catch{throw new ReportInputError('Choose an IANA recurrence time zone')}}
// Round-trip both offsets: skip nonexistent local times and use the first
// instant of repeated times. Month-end clamps without moving the anchor day.
function localInstant(p:number[],zone:string,ms:number){const desired=Date.UTC(p[0],p[1]-1,p[2],p[3],p[4],p[5],ms),offsets=new Set<number>();for(let hour=-36;hour<=36;hour+=12){const at=desired+hour*3600000,q=parts(at,zone);offsets.add(Date.UTC(q[0],q[1]-1,q[2],q[3],q[4],q[5])-Math.floor(at/1000)*1000)}const candidates=[...offsets].map(offset=>desired-offset).filter(at=>parts(at,zone).every((n,i)=>n===p[i]));return candidates.length?Math.min(...candidates):null}
export function nextReportOccurrence(anchor:number,frequency:string,zone:string,after:number){
 if(!['daily','weekly','monthly'].includes(frequency))throw new ReportInputError('Choose daily, weekly or monthly recurrence')
 if(after<anchor)return anchor
 const p=parts(anchor,zone),start=Date.UTC(p[0],p[1]-1,p[2]),ms=anchor%1000
 // Jump close to the relevant date; a bounded scan covers transitions and gaps.
 const q=parts(after,zone),base=frequency==='monthly'?Math.max(0,(q[0]-p[0])*12+q[1]-p[1]-1):Math.max(0,Math.floor((Date.UTC(q[0],q[1]-1,q[2])-start)/(frequency==='weekly'?7*day:day))-1)
 for(let index=base;index<base+400;index++){
  let date:Date
  if(frequency==='monthly'){date=new Date(Date.UTC(p[0],p[1]-1+index,1));date.setUTCDate(Math.min(p[2],new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()))}else date=new Date(start+index*(frequency==='weekly'?7*day:day))
  const at=localInstant([date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate(),...p.slice(3)],zone,ms)
  if(at!==null&&at>after&&at>=anchor)return at
 }
 throw new ReportInputError('Recurrence is outside the supported calendar range')
}
