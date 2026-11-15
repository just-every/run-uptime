import {DefinitionFileError,boundEntries,jsonValues} from '../format.ts'
import type {Importer,SourceEntry,Mapping} from './types.ts'
import {pingdomHttp} from './pingdom-http.ts'
import {pingdomProtocol} from './pingdom-protocol.ts'
// Saved GET /api/3.1/checks/{id} and /tms/check/{cid} responses.
// Check/Tag/DetailedCheckAttributes and CheckWithoutIDGET:
// https://docs.pingdom.com/API_3.1.yaml (read 23 October 2026). No provider call.
const transaction=(v:any)=>v&&['script','recording'].includes(v.type)&&typeof v.name==='string'&&Number.isInteger(v.interval)&&(Array.isArray(v.steps)||v.steps==='[withheld]')
function records(text:string){
 const parsed=jsonValues(text,'Pingdom file'),values=parsed.length===1&&Array.isArray(parsed[0])?parsed[0] as any[]:parsed
 if(!values.length||values.some((value:any)=>!value||typeof value!=='object'||Array.isArray(value)||(!value.check||typeof value.check!=='object')&&!transaction(value)))throw new DefinitionFileError('Use saved Pingdom check details with a check object, or a documented TMS detail object with type, name, interval and steps. Summary lists do not contain complete settings.')
 return values.map((value:any)=>transaction(value)?value:value.check)
}
function map(entry:SourceEntry):Mapping{
 const check=entry.value,http=check.type?.http
 const kind=check.type&&typeof check.type==='object'&&!Array.isArray(check.type)&&Object.keys(check.type).length===1?Object.keys(check.type)[0]:String(check.type)
 if(!['http','tcp','smtp','ping','dns'].includes(kind))return {unsupported:`Pingdom ${kind}: settings need to be rebuilt as a browser or multi-step check and reviewed. Transaction steps are not reduced to a URL check.`}
 const settings=check.type[kind]
 if(!settings||typeof settings!=='object'||Array.isArray(settings))return {refused:'Pingdom check type needs its saved settings object.'}
 const filters=check.probe_filters
 if(filters!==undefined&&(!Array.isArray(filters)||filters.some((v:any)=>typeof v!=='string'||!v.trim())))return {refused:'Pingdom probe_filters must be a list of named probe filters.'}
 if(filters?.length)return {refused:`Pingdom probe filters ${filters.map((v:string)=>`“${v.slice(0,100)}”`).join(', ')} have no matching installed geographic location. Choose the locations to check from yourself; these filters are not silently replaced by your first location.`}
 let tags:string[]|undefined
 if(check.tags!==undefined){
  if(!Array.isArray(check.tags)||check.tags.some((tag:any)=>!tag||typeof tag.name!=='string'||!tag.name.trim()))return {refused:'Pingdom tags must be saved Tag objects with nonempty names.'}
  tags=check.tags.map((tag:any)=>tag.name)
 }

 if(typeof check.name!=='string'||!check.name.trim()||typeof check.hostname!=='string'||!check.hostname)return {refused:'Pingdom check needs a name and hostname.'}
 if(!Number.isInteger(check.resolution)||check.resolution<1||check.resolution>1440)return {refused:'Pingdom resolution must be a whole number of minutes from 1 to 1440.'}
 const differences=[`Source check is ${check.status==='paused'?'paused':'active'}. New imports arrive paused; existing monitors keep their local pause state.`, 'Pingdom probe regions, contacts, teams, maintenance, reports and history are not transferred. Review and reconnect them before cutover.']
 const common={name:check.name,...(tags===undefined?{}:{tags}),intervalMs:check.resolution*60000,freshnessMs:Math.min(86400000,Math.max(180000,check.resolution*180000)),retries:0,confirmSlots:check.sendnotificationwhendown??2,recoverSlots:2,probes:['local-a'],enabled:check.status!=='paused'}
 if(kind!=='http')return pingdomProtocol(kind,settings,check,common,differences)
 if(typeof http.encryption!=='boolean'||typeof http.verify_certificate!=='boolean')return {refused:'Pingdom HTTP detail must explicitly name encryption and verify_certificate; trust is never guessed.'}
 return pingdomHttp(entry,tags,differences)
}
// A certificate policy becomes its own native TLS check, visibly reviewed beside its HTTP check.
// Distinct stable source IDs make catch-up and undo use the ordinary import custody.
export const pingdomImporter:Importer={source:'pingdom',label:'Pingdom saved check details',detect(text){try{records(text);return true}catch{return false}},entries(text){
 const values=boundEntries(records(text)).flatMap((value:any,index:number)=>{
  const http=value.type?.http,base={...value,certificateSource:false};
  if(!http?.ssl_down_days_before)return [base];
  return [base,{...value,id:`${value.id??`#${index}`}:tls`,name:`${String(value.name).slice(0,86)} — certificate`,type:{http:{...http}},certificateSource:true}]
 });
 return boundEntries(values).map((value:any,index)=>({index,label:`Pingdom check ${index+1}${typeof value.name==='string'?` (“${value.name.trim().slice(0,100)}”)`:''}`,value}))
},map(entry){
 const mapped=map(entry);
 if(!entry.value.certificateSource||!('definition' in mapped))return mapped;
 const http=entry.value.type.http,days=http.ssl_down_days_before;
 if(!http.encryption)return {refused:'Pingdom certificate expiry requires an encrypted HTTP check.'};
 if(!Number.isInteger(days)||days<1||days>365)return {refused:'Pingdom ssl_down_days_before must be whole days from 1 to 365.'};
 const {url,method,request,tlsTrust,slow,assertions,...common}=mapped.definition;
 return {definition:{...common,type:'tls',timeoutMs:5000,tls:{host:entry.value.hostname,port:http.port??443,warnDays:[days],failBeforeDays:days},assertions:{}},differences:[...mapped.differences,'Separate native TLS check preserves the HTTP origin host/port and certificate downtime window. TLS checks verify certificate trust even when the HTTP source ignores it.']}
}}
