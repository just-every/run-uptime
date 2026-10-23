import {DefinitionFileError,boundEntries,jsonValues} from '../format.ts'
import type {Importer,SourceEntry,Mapping} from './types.ts'
// Saved GET /api/3.1/checks/{id} and /tms/check/{cid} responses.
// Check/Tag/DetailedCheckAttributes and CheckWithoutIDGET:
// https://docs.pingdom.com/API_3.1.yaml (read 23 October 2026). No provider call.
const transaction=(v:any)=>v&&['script','recording'].includes(v.type)&&typeof v.name==='string'&&Number.isInteger(v.interval)&&(Array.isArray(v.steps)||v.steps==='[withheld]')
function records(text:string){
 const parsed=jsonValues(text,'Pingdom file'),values=parsed.length===1&&Array.isArray(parsed[0])?parsed[0] as any[]:parsed
 if(!values.length||values.some((value:any)=>!value||typeof value!=='object'||Array.isArray(value)||(!value.check||typeof value.check!=='object')&&!transaction(value)))throw new DefinitionFileError('Use saved Pingdom HTTP check details with a check object, or a documented TMS detail object with type, name, interval and steps. Summary lists do not contain complete settings.')
 return values.map((value:any)=>transaction(value)?value:value.check)
}
function map(entry:SourceEntry):Mapping{
 const check=entry.value,http=check.type?.http
 if(!http||typeof http!=='object'||Array.isArray(http)){
  const kinds=typeof check.type==='string'?[check.type]:check.type&&typeof check.type==='object'?Object.keys(check.type):['unspecified']
  const owners:Record<string,string>={script:'FLOW-001/FLOW-002',recording:'FLOW-001/FLOW-002',tcp:'TCP-001',ping:'PING-001',dns:'DNS-001',udp:'UDP-001',smtp:'MAIL-001',pop3:'MAIL-001',imap:'MAIL-001'}
  return {unsupported:`Pingdom ${kinds.map((kind:string)=>`${kind}: ${Object.hasOwn(owners,kind)?owners[kind]:'MIGRATE-002'} settings require reviewed conversion`).join('; ')}. Transaction steps are not reduced to a URL check; retain the source for its owning clause.`}
 }
 const filters=check.probe_filters
 if(filters!==undefined&&(!Array.isArray(filters)||filters.some((v:any)=>typeof v!=='string'||!v.trim())))return {refused:'Pingdom probe_filters must be a list of named probe filters.'}
 if(filters?.length)return {refused:`Pingdom probe filters ${filters.map((v:string)=>`“${v.slice(0,100)}”`).join(', ')} have no matching installed geographic location. PROBE-001 location choices need owner review; these filters are not silently replaced by local-a.`}
 let tags:string[]|undefined
 if(check.tags!==undefined){
  if(!Array.isArray(check.tags)||check.tags.some((tag:any)=>!tag||typeof tag.name!=='string'||!tag.name.trim()))return {refused:'Pingdom tags must be saved Tag objects with nonempty names.'}
  tags=check.tags.map((tag:any)=>tag.name)
 }

 if(typeof check.name!=='string'||!check.name.trim()||typeof check.hostname!=='string'||!check.hostname)return {refused:'Pingdom check needs a name and hostname.'}
 if(typeof http.encryption!=='boolean'||typeof http.verify_certificate!=='boolean')return {refused:'Pingdom HTTP detail must explicitly name encryption and verify_certificate; trust is never guessed.'}
 if(!Number.isInteger(check.resolution)||check.resolution<1||check.resolution>1440)return {refused:'Pingdom resolution must be a whole number of minutes from 1 to 1440.'}
 const protocol=http.encryption?'https:':'http:',port=http.port??(http.encryption?443:80)
 if(!Number.isInteger(port)||port<1||port>65535)return {refused:'Pingdom HTTP port is invalid.'}
 const path=http.url??'/'
 if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))return {refused:'Pingdom HTTP URL must be an explicit path beginning with /.'}
 let url;try{url=new URL(`${protocol}//${check.hostname}:${port}${path}`);if(url.hostname.toLowerCase()!==check.hostname.toLowerCase()||url.username||url.password||url.hash)throw Error()}catch{return {refused:'Pingdom HTTP hostname or path is invalid.'}}
 const differences=['Imported paused. Pingdom probe regions, contacts, teams, maintenance, reports and history are not transferred by this definition-file import. Review and reconnect them before cutover.']
 const assertions:Record<string,unknown>={status:['2xx','3xx']}
 if(http.shouldcontain!==undefined&&http.shouldcontain!=='')assertions.bodyIncludes=http.shouldcontain
 if(http.shouldnotcontain!==undefined&&http.shouldnotcontain!=='')assertions.bodyExcludes=http.shouldnotcontain
 if(http.useRegularExpression) return {unsupported:'Pingdom regular-expression check semantics need a reviewed expression conversion; this check was not reduced to a literal keyword.'}
 const hasSecrets=Boolean(http.username||http.password||http.postdata||http.requestheaders&&(typeof http.requestheaders!=='object'||Object.keys(http.requestheaders).length)),credentialRef=`pingdom-${String(check.id??entry.index+1).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)}`
 if(hasSecrets)differences.push(`Authentication, headers and request body are not imported. Re-enter them in the monitor-bound local credential file ${credentialRef}.`)
 if(http.verify_certificate===false)differences.push(http.encryption?'Certificate errors were ignored in Pingdom. The reviewed trust exception is preserved for the initial HTTPS origin only, requires a private runner, and grants no credential authority.':'The source disabled certificate verification on plain HTTP; there is no TLS connection to exempt.')
 if(http.ssl_down_days_before)differences.push('Pingdom certificate-expiry downtime threshold is not an HTTP trust exception. Add and review a separate TLS certificate monitor.')
 const threshold=check.responsetime_threshold
 let slow
 if(threshold!==undefined&&threshold!==null&&threshold!==0){
  if(!Number.isInteger(threshold)||threshold<1)return {refused:'Pingdom responsetime_threshold must be a positive whole number of milliseconds, or 0 to disable it.'}
  if(threshold>=10000)return {refused:'Pingdom response-time threshold must be below the imported 10000 ms request timeout. Review the timeout and slow-response threshold before importing.'}
  slow={thresholdMs:threshold,mode:'consecutive',slots:1,percentile:95,locations:'all',destinationIds:null,contactSettings:{}}
 }
 if(check.notifyagainevery||check.notifywhenbackup===false)differences.push('Pingdom repeat and disabled recovery-notice settings are not carried into contact routing. Review the notification policy before enabling.')
 if(tags?.length)differences.push('Pingdom tag names become monitor labels; tag type and source usage count carry no local routing authority.')
 return {definition:{name:check.name,...(tags===undefined?{}:{tags}),type:assertions.bodyIncludes||assertions.bodyExcludes?'keyword':'http',url:url.href,method:http.postdata?'POST':'GET',intervalMs:check.resolution*60000,timeoutMs:10000,retries:0,confirmSlots:check.sendnotificationwhendown??2,recoverSlots:2,probes:['local-a'],enabled:false,assertions,...(slow?{slow}:{}),...(hasSecrets?{request:{credentialRef}}:{}),...(http.encryption&&http.verify_certificate===false?{tlsTrust:{mode:'ignore',acknowledged:true}}:{})},differences}
}
export const pingdomImporter:Importer={source:'pingdom',label:'Pingdom saved HTTP check details',detect(text){try{records(text);return true}catch{return false}},entries(text){return boundEntries(records(text)).map((value:any,index)=>({index,label:`Pingdom check ${index+1}${typeof value.name==='string'?` (“${value.name.trim().slice(0,100)}”)`:""}`,value}))},map}
