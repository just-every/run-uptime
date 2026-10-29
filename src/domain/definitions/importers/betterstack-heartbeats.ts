import {DefinitionFileError,boundEntries,jsonValues} from '../format.ts'
import type {Importer} from './types.ts'
import {thirdPartyService} from './third-party.ts'
// Saved https://betterstack.com/docs/uptime/listing-heartbeats-in-heartbeat-group/ pages.
// Only documented heartbeat period/grace are mapped; source capabilities never travel.
// DEPENDENCY-002 also reads two more saved Better Stack pages, for third-party services only:
// - monitor pages (https://betterstack.com/docs/uptime/api/list-all-existing-monitors/): Better Stack's monitor_type values name no
//   third-party type, so a monitor whose url is a provider's status address maps onto that catalog entry; other monitors are
//   unsupported here.
// - status page resource pages: a vendor followed on a status page is a ThirdPartyService row
//   (https://betterstack.com/docs/uptime/api/get-a-single-status-page-resource/) whose documented fields name no vendor, region or
//   service, only the public name the owner typed. Converting it would guess what it follows, so each one is refused with that reason.
const KINDS=['heartbeat','monitor','status_page_resource']
const RESOURCE_DOC='https://betterstack.com/docs/uptime/api/get-a-single-status-page-resource/'
const NOT_CONVERTED='Better Stack regions, escalation policy, contacts, maintenance and history are not transferred. Reconnect them before cutover.'
function records(text:string){
 const values=jsonValues(text,'Better Stack file'),pages=values.length===1&&Array.isArray(values[0])?values[0] as any[]:values;
 if(!pages.length||pages.some((p:any)=>!p||!Array.isArray(p.data)||p.data.some((r:any)=>!KINDS.includes(r?.type))))throw new DefinitionFileError('Use saved Better Stack heartbeat, monitor or status page resource pages.');
 return pages.flatMap((p:any)=>p.data);
}
function monitor(a:any){
 if(!a||typeof a.url!=='string'||typeof a.pronounceable_name!=='string'||!a.pronounceable_name.trim())return {refused:'A Better Stack monitor needs a url and a pronounceable_name.'};
 const third=thirdPartyService(a.url,a.pronounceable_name);
 if(third&&'definition' in third)return {definition:third.definition,differences:[...third.differences,NOT_CONVERTED]};
 return {unsupported:`This Better Stack ${typeof a.monitor_type==='string'?`${a.monitor_type.slice(0,40)} `:''}monitor is not a monitor of a provider status address in the catalog, and converting other Better Stack monitors is not built.`};
}
function resource(a:any){
 if(a?.resource_type!=='ThirdPartyService')return {unsupported:'Only third-party service rows of a Better Stack status page are read here; status pages themselves move to Lamp.'};
 const name=typeof a.public_name==='string'&&a.public_name.trim()?`“${a.public_name.trim().slice(0,100)}” `:'';
 return {refused:`This Better Stack status page row ${name}follows a third-party service, but Better Stack’s public API names no vendor, region or service for it (${RESOURCE_DOC}), so Uptime cannot tell what it follows and does not convert it. Follow that provider from the service catalog instead.`};
}
export const betterStackHeartbeatImporter:Importer={
 source:'betterstack-heartbeats',label:'Better Stack saved heartbeat, monitor and status page resource pages',
 detect(text){try{records(text);return true}catch{return false}},
 entries(text){return boundEntries(records(text)).map((value,index)=>({index,label:`Better Stack ${value.type==='status_page_resource'?'status page row':value.type} ${index+1}`,value}))},
 map({value}){
  const a=value.attributes;
  if(value.type==='monitor')return monitor(a);
  if(value.type==='status_page_resource')return resource(a);
  if(!a||typeof a.name!=='string'||!a.name.trim()||!Number.isInteger(a.period)||a.period<30||a.period>2678400||!Number.isInteger(a.grace)||a.grace<0||a.grace>86400)return {refused:'Heartbeat requires a name, period of 30 seconds to 31 days and grace of 0 to 24 hours.'};
  const differences=['Imported paused. Issue a new Uptime URL and repoint the job; source URL and credentials are discarded. Contacts, teams, maintenance, history and source paging require separate reviewed migration.'];
  differences.push('Local heartbeat policy: one scheduled missed-deadline result confirms failure and one scheduled success confirms recovery. Source alert delays, repeats and escalation settings are not converted; review them separately before activation.');
  differences.push(`Heartbeat schedule: expected period ${a.period} seconds plus ${a.grace} seconds grace. Missing that deadline is a missed run.`);
  if(a.cron||a.cron_expression||a.timezone||a.time_zone)differences.push('Source calendar fields are not part of this documented period/grace mapping. Review and configure an explicit local cron/time zone before activation.');
  return {definition:{name:a.name,type:'heartbeat',heartbeat:{maxAgeMs:a.period*1000,graceMs:a.grace*1000},intervalMs:30000,confirmSlots:1,recoverSlots:1,enabled:false,probes:['local-a'],assertions:{status:200}},differences};
 }
};
