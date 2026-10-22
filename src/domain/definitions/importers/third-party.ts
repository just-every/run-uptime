// @ts-ignore Shared catalog matching; edition JavaScript.
import {catalogMapping,looksLikeStatusAddress,statusIqMapping} from '../../service-catalog/match.mjs'
// @ts-ignore
import {CATALOG_VERSION} from '../../service-catalog/index.mjs'
import type {Mapping} from './types.ts'
// DEPENDENCY-002: every importer that reads incumbent monitors maps a third-party service monitor onto its catalog entry with
// these functions. A mapped monitor becomes the monitor following that entry would save (a dependency monitor, attributed to the
// provider, raising dependency notices and no incident) and arrives paused like every import; the owner checks its status source
// live before enabling it. A status address the catalog does not know, or knows but cannot follow, stays the ordinary monitor
// the importer already proposed, with a note saying so.
const mappedText=(entry:any,target:any)=>{
 const part=target.scope==='component'?`${entry.name} ${target.component.name}${target.component.region?` (${target.component.region})`:''}`:`${entry.name} (whole provider)`
 return `Mapped onto the catalog entry ${part}, catalog version ${CATALOG_VERSION}. It reads ${entry.name}'s own status source and raises dependency notices through your alert route; it opens no Uptime incident and never changes an application monitor. Its cadence and checks are the catalog's. Check its status source from the monitor page before enabling it.`
}
const named=(definition:any,name:string)=>({...definition,name:name.trim().slice(0,100)||definition.name})
export function thirdPartyService(url:string,name:string):{definition:Record<string,unknown>;differences:string[]}|{notes:string[]}|null{
 const mapped=catalogMapping(url)
 if(mapped?.definition)return {definition:named(mapped.definition,name),differences:[mappedText(mapped.entry,mapped.target)]}
 if(mapped)return {notes:[`${mapped.entry.name} is in the catalog, but this address is not one it can follow (${mapped.entry.note??'it publishes no status Uptime can read'}). This stays an ordinary monitor of the address.`]}
 if(looksLikeStatusAddress(url))return {notes:['This looks like a third-party status page that is not in the catalog. It stays an ordinary monitor proposal; to follow a provider, add its status page address in the new-monitor panel.']}
 return null
}
// A Site24x7 StatusIQ third-party component: mapped by the service id StatusIQ publishes and the component's name, or refused.
export function statusIqComponent(serviceId:number,componentName:string,name:string,extra:string[]):Mapping{
 const mapped=statusIqMapping(serviceId,componentName)
 if('refused' in mapped)return {refused:mapped.refused}
 return {definition:named(mapped.definition,name),differences:[mappedText(mapped.entry,mapped.target),...extra]}
}
