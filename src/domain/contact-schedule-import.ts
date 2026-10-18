import {normalizeContactSettings} from './contact-schedule.ts'
/** Saved settings only. Source IDs never become local recipient authority. */
export function importContactSchedule(input:any){
 if(!input||!['uptimerobot','pingdom'].includes(input.source)||typeof input.document!=='string'||new TextEncoder().encode(input.document).length>262144)throw Error('Choose a saved UptimeRobot or Pingdom monitor JSON file (at most 256 KiB)');
 if(!input.contactMap||typeof input.contactMap!=='object'||Array.isArray(input.contactMap))throw Error('Map each source contact ID to a local destination');
 const parsed=JSON.parse(input.document),settings:Record<string,any>={},source=input.source;
 let contacts:any[]=[];
 if(source==='uptimerobot'){
  const m=parsed.data?(parsed.data.length===1?parsed.data[0]:null):parsed;
  if(!m||!Array.isArray(m.assignedAlertContacts))throw Error('Use one saved UptimeRobot monitor with assignedAlertContacts');
  contacts=m.assignedAlertContacts.map((c:any)=>{if(!Number.isSafeInteger(c?.alertContactId)||c.alertContactId<1||!Number.isInteger(c.threshold)||!Number.isInteger(c.recurrence))throw Error('Each UptimeRobot contact needs its ID, threshold and recurrence');return {id:String(c.alertContactId),delayMinutes:c.threshold,repeatMinutes:c.recurrence,recovery:true}});
 }else{
  const check=parsed.check;
  if(!check||!Array.isArray(check.integrationids)||!Number.isInteger(check.resolution)||check.resolution<1)throw Error('Use one saved Pingdom check detail with integrationids and resolution');
  if(!Number.isInteger(check.sendnotificationwhendown)||!Number.isInteger(check.notifyagainevery)||typeof check.notifywhenbackup!=='boolean')throw Error('Pingdom detail must explicitly include delay, repeat and recovery preferences');
  contacts=check.integrationids.map((id:any)=>({id:String(id),delayMinutes:check.sendnotificationwhendown*check.resolution,repeatMinutes:check.notifyagainevery*check.resolution,recovery:check.notifywhenbackup!==false}));
 }
 if(!contacts.length||contacts.length>100)throw Error('Saved monitor must contain 1 to 100 contacts');
 for(const c of contacts){
  const id=input.contactMap[c.id];if(typeof id!=='string'||!id||Object.hasOwn(settings,id))throw Error(`Map source contact ${c.id} to a distinct local destination`);
  settings[id]={delayMinutes:c.delayMinutes,repeatMinutes:c.repeatMinutes,maxRepeats:null,recovery:c.recovery,stopOnAck:false};
 }
 if(Object.keys(input.contactMap).some(id=>!contacts.some(c=>c.id===id)))throw Error('A mapped contact ID is not present in the saved monitor');
 const destinationIds=Object.keys(settings).sort();
 return {scope:input.scope??'monitor',mode:'selected',expectedRevision:input.expectedRevision,destinationIds,contactSettings:normalizeContactSettings(settings,destinationIds)};
}
