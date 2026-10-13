// An incumbent's log export is history, not configuration. It is recognised and counted in a preview only: no row
// becomes a slot, observation, state or incident, so imported history can never meet quorum, recovery or the
// 24-hour and 7-day figures. UptimeRobot does not publish its CSV columns; recognition needs a header with a time
// column and an event column, which the owner's own export is expected to carry.
function csvRecords(text:string){
 const records:string[][]=[];let field='',record:string[]=[],quoted=false
 for(let i=0;i<text.length;i++){const c=text[i]
  if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c;continue}
  if(c==='"')quoted=true;else if(c===',')(record.push(field),field='');else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;record.push(field);field='';if(record.some(v=>v.trim()))records.push(record);record=[]}else field+=c
 }
 record.push(field);if(record.some(v=>v.trim()))records.push(record)
 return quoted?null:records
}
export function recogniseHistory(text:string){
 if(/^\s*[[{]/.test(text))return null
 const records=csvRecords(text.replace(/^﻿/,''))
 if(!records||!records.length)return null
 const header=records[0].map(v=>v.trim())
 if(header.length<3||!header.some(v=>/date|time/i.test(v))||!header.some(v=>/event|status|type/i.test(v)))return null
 return {kind:'history' as const,provenance:'UptimeRobot log export',rows:records.length-1,columns:header.slice(0,20),stored:false,
  note:`${(records.length-1).toLocaleString('en-US')} rows, provenance: UptimeRobot log export, not stored as evidence. History never becomes Uptime checks, incidents or uptime figures.`}
}
