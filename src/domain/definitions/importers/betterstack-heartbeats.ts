import {DefinitionFileError,boundEntries,jsonValues} from '../format.ts'
import type {Importer} from './types.ts'
// Saved https://betterstack.com/docs/uptime/listing-heartbeats-in-heartbeat-group/
// Only documented heartbeat period/grace are mapped; source capabilities never travel.
function records(text:string){
 const values=jsonValues(text,'Better Stack heartbeat file'),pages=values.length===1&&Array.isArray(values[0])?values[0] as any[]:values;
 if(!pages.length||pages.some((p:any)=>!p||!Array.isArray(p.data)||p.data.some((r:any)=>r?.type!=='heartbeat')))throw new DefinitionFileError('Use saved Better Stack heartbeat pages with data entries of type heartbeat.');
 return pages.flatMap((p:any)=>p.data);
}
export const betterStackHeartbeatImporter:Importer={
 source:'betterstack-heartbeats',label:'Better Stack saved heartbeat pages',
 detect(text){try{records(text);return true}catch{return false}},
 entries(text){return boundEntries(records(text)).map((value,index)=>({index,label:`Better Stack heartbeat ${index+1}`,value}))},
 map({value}){
  const a=value.attributes;
  if(!a||typeof a.name!=='string'||!a.name.trim()||!Number.isInteger(a.period)||a.period<30||a.period>2678400||!Number.isInteger(a.grace)||a.grace<0||a.grace>86400)return {refused:'Heartbeat requires a name, period of 30 seconds to 31 days and grace of 0 to 24 hours.'};
  const differences=['Imported paused. Issue a new Uptime URL and repoint the job; source URL and credentials are discarded. Contacts, teams, maintenance, history and source paging require separate reviewed migration.'];
  if(a.cron||a.cron_expression||a.timezone||a.time_zone)differences.push('Source calendar fields are not part of this documented period/grace mapping. Review and configure an explicit local cron/time zone before activation.');
  return {definition:{name:a.name,type:'heartbeat',heartbeat:{maxAgeMs:a.period*1000,graceMs:a.grace*1000},intervalMs:30000,enabled:false,probes:['local-a'],assertions:{status:200}},differences};
 }
};
