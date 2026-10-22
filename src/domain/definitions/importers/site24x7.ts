import {DefinitionFileError,boundEntries,jsonValues} from '../format.ts'
import type {Importer} from './types.ts'
import {statusIqComponent,thirdPartyService} from './third-party.ts'
// Saved Site24x7 API responses ({"code":0,"message":"success","data":...}), read for DEPENDENCY-002's third-party service monitors
// only; MIGRATE-004's own conversion is not built here. Two documented shapes (https://www.site24x7.com/help/api/ and
// https://www.site24x7.com/help/statusiq/api/):
// - a monitor list: Website monitors carry display_name, type "URL" and website. A Website monitor of a provider's status address
//   maps onto its catalog entry. AWSHEALTH reads the account's own AWS Health events and OFFICE365 the tenant's usage, through the
//   account's credentials, never a public status source, so both are refused conversion. Any other monitor is unsupported here.
// - StatusIQ third-party components a status page subscribes to: data names thirdparty_service_id, from StatusIQ's published id
//   list, and thirdparty_components, each with thirdparty_component_display_name. Each component maps onto the catalog.
const monitor=(value:any)=>value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.display_name==='string'&&typeof value.type==='string'
const components=(data:any)=>data&&typeof data==='object'&&!Array.isArray(data)&&Number.isSafeInteger(data.thirdparty_service_id)&&typeof data.thirdparty_service_display_name==='string'&&Array.isArray(data.thirdparty_components)&&
 data.thirdparty_components.every((c:any)=>c&&typeof c.thirdparty_component_id==='string'&&typeof c.thirdparty_component_display_name==='string'&&c.thirdparty_component_display_name.trim())
const NOT_CONVERTED=['Site24x7 locations, notification profiles, thresholds and history are not transferred. Reconnect them before cutover.']
function records(text:string){
 const values=jsonValues(text,'Site24x7 file'),pages=values.length===1&&Array.isArray(values[0])?values[0] as any[]:values
 if(!pages.length||pages.some((p:any)=>!p||p.code!==0||typeof p.message!=='string'||!(Array.isArray(p.data)?p.data.length&&p.data.every(monitor):components(p.data))))
  throw new DefinitionFileError('Use saved Site24x7 responses: monitor lists ({"code": 0, "message": "success", "data": [monitors with display_name and type]}) or StatusIQ third-party components ({"code": 0, "data": {"thirdparty_service_id": ..., "thirdparty_components": [...]}}).')
 return pages.flatMap((p:any)=>Array.isArray(p.data)?p.data.map((value:any)=>({kind:'monitor',value})):p.data.thirdparty_components.map((value:any)=>({kind:'component',service:p.data,value})))
}
export const site24x7Importer:Importer={
 source:'site24x7',label:'Site24x7 saved monitor lists and StatusIQ third-party components',
 detect(text){try{records(text);return true}catch{return false}},
 entries(text){return boundEntries(records(text)).map((record,index)=>({index,value:record,
  label:record.kind==='monitor'?`Site24x7 monitor ${index+1} (“${record.value.display_name.trim().slice(0,100)}”)`:`Site24x7 third-party component ${index+1} (“${record.service.thirdparty_service_display_name.trim().slice(0,60)} ${record.value.thirdparty_component_display_name.trim().slice(0,60)}”)`}))},
 map({value:record}){
  if(record.kind==='component'){
   const service=record.service,component=record.value
   return statusIqComponent(service.thirdparty_service_id,component.thirdparty_component_display_name,`${service.thirdparty_service_display_name.trim()} ${component.thirdparty_component_display_name.trim()}`,NOT_CONVERTED)
  }
  const value=record.value
  if(value.type==='AWSHEALTH')return {refused:'A Site24x7 AWS Health monitor counts your own AWS account’s health events through your AWS credentials; it reads no public status source, so it is not converted. Follow AWS from the service catalog to watch AWS’s public status.'}
  if(value.type==='OFFICE365')return {refused:'A Site24x7 Office 365 monitor reads your own tenant’s usage through your Microsoft credentials; it reads no public status source, so it is not converted. Microsoft 365 is in the service catalog as a status page you can add by address.'}
  if(value.type==='URL'&&typeof value.website==='string'&&value.display_name.trim()){
   const third=thirdPartyService(value.website,value.display_name)
   if(third&&'definition' in third)return {definition:third.definition,differences:[...third.differences,...NOT_CONVERTED]}
  }
  return {unsupported:`This Site24x7 ${String(value.type).slice(0,40)} monitor is not a monitor of a provider status address in the catalog, and converting other Site24x7 monitors is not built.`}
 },
}
