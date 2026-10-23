import {DefinitionFileError,boundEntries,jsonValues} from '../format.ts'
import type {Importer,Mapping} from './types.ts'
import {thirdPartyService} from './third-party.ts'
// Saved monitor resources: https://betterstack.com/docs/uptime/api/list-all-existing-monitors/
// Field semantics/defaults: https://betterstack.com/docs/uptime/api/create-a-new-monitor/
// Read 23 October 2026. This reader never calls a provider or carries source request secrets.
const present=(v:any)=>v!==undefined&&v!==null&&v!==''&&v!==false&&!(Array.isArray(v)&&!v.length)
function records(text:string){
 const values=jsonValues(text,'Better Stack monitor file'),pages=values.length===1&&Array.isArray(values[0])?values[0] as any[]:values
 if(!pages.length||pages.some((p:any)=>!p||!Array.isArray(p.data)||!p.data.length||p.data.some((r:any)=>r?.type!=='monitor'||!r.attributes)))throw new DefinitionFileError('Use saved Better Stack pages containing monitor resources. Save heartbeat and status-page resources separately.')
 return pages.flatMap((p:any)=>p.data)
}
function map(value:any):Mapping{
 const a=value.attributes,kind=a.monitor_type
 if(typeof a.url!=='string'||typeof a.pronounceable_name!=='string'||!a.pronounceable_name.trim())return {refused:'Better Stack monitor requires url and pronounceable_name.'}
 const third=thirdPartyService(a.url,a.pronounceable_name)
 if(third&&'definition' in third)return {definition:third.definition,differences:[...third.differences,'Better Stack regions, groups, contacts, maintenance and history require separate review.']}
 const handoffs:Record<string,string>={playwright:'FLOW-001/FLOW-002 browser steps',udp:'UDP-001 payload and response bytes',dns:'DNS-001 resolver and answer criteria',smtp:'MAIL-001 protocol and credentials',pop:'MAIL-001 protocol and credentials',imap:'MAIL-001 protocol and credentials'}
 if(!['status','expected_status_code','keyword','keyword_absence','ping','tcp'].includes(kind))return {unsupported:`Better Stack ${String(kind)} needs reviewed ${handoffs[kind]??'MIGRATE-003 monitor-type'} conversion; it is not reduced to an HTTP check.`}
 if(!Number.isInteger(a.check_frequency)||a.check_frequency<5||a.check_frequency>86400)return {refused:'Better Stack check_frequency must be whole seconds from 5 to 86400.'}
 const protocol=['ping','tcp'].includes(kind),sourceTimeout=a.request_timeout??(protocol?5000:30)
 if(!Number.isInteger(sourceTimeout)||sourceTimeout<=0)return {refused:'Better Stack request_timeout must be a positive whole number.'}
 const timeoutMs=Math.max(kind==='ping'?8000:50,Math.min(10000,sourceTimeout*(protocol?1:1000)))
 const blocked=['auth_username','auth_password','request_headers','request_body','proxy_url','proxy_username','proxy_password'].filter(key=>present(a[key]))
 if(blocked.length)return {unsupported:`Better Stack ${kind}: ${blocked.join(', ')} need local API-002 credential review; no request values are copied.`}
 if(a.verify_ssl!==undefined&&typeof a.verify_ssl!=='boolean')return {refused:'Better Stack verify_ssl must be a boolean.'}
 const regions=a.regions==null||Array.isArray(a.regions)&&!a.regions.length?['us','eu','as','au']:a.regions
 if(!Array.isArray(regions)||regions.some((r:any)=>!['us','eu','as','au'].includes(r))||new Set(regions).size!==regions.length)return {refused:'Better Stack regions must name distinct documented us, eu, as or au regions.'}
 const group=a.monitor_group_id
 if(group!=null&&!(typeof group==='string'&&/^\d+$/.test(group)||Number.isSafeInteger(group)&&group>0))return {refused:'Better Stack monitor_group_id must be a group identifier.'}
 const differences=[`Imported paused. check_frequency ${a.check_frequency} seconds becomes ${a.check_frequency*1000} ms; request_timeout ${sourceTimeout} ${protocol?'milliseconds':'seconds'} becomes ${timeoutMs} ms.`,...regions.map((r:string)=>`Region ${r} is retained as a label; no installed geographic location matches it. Assign and verify your own runner location before enabling.`), 'Confirmation and recovery use two scheduled results, with no retries; source time-based confirmation, escalation, contacts, maintenance and history are not transferred. Oncall/Lamp handoffs and side-by-side cutover remain separate.',...(third&&'notes' in third?third.notes:[])]
 if(group!=null)differences.push(`Group ${group} becomes a label; the saved monitor page supplies its identifier, not its name or membership settings.`)
 if(present(a.ssl_expiration))differences.push('ssl_expiration requires a separate reviewed TLS-001 expiry monitor.')
 if(present(a.domain_expiration))differences.push('domain_expiration requires a separate reviewed DOMAIN-001 expiry monitor.')
 if(a.effective_check_frequency!==undefined&&a.effective_check_frequency!==a.check_frequency)differences.push(`effective_check_frequency is ${a.effective_check_frequency}; the saved requested frequency is ${a.check_frequency}. Review the source frequency reason before enabling.`)
 const mapped=new Set(['url','pronounceable_name','monitor_type','check_frequency','request_timeout','regions','monitor_group_id','verify_ssl','http_method','required_keyword','expected_status_codes','port'])
 if(kind==='ping')mapped.add('ip_version')
 for(const key of Object.keys(a))if(!mapped.has(key)&&present(a[key]))differences.push(`Source field ${key} is not converted; retain it for review before cutover.`)
 const common={name:a.pronounceable_name,enabled:false,intervalMs:a.check_frequency*1000,timeoutMs,probes:['local-a'],failureQuorum:1,retries:0,confirmSlots:2,recoverSlots:2,freshnessMs:Math.min(86400000,Math.max(180000,a.check_frequency*3000)),tags:regions.map((r:string)=>`betterstack-region:${r}`),...(group==null?{}:{group:`Better Stack group ${group}`})}
 if(kind==='ping'){
  if(a.ip_version!=null&&!['ipv4','ipv6'].includes(a.ip_version))return {refused:'Better Stack ip_version must be ipv4, ipv6 or null.'}
  differences.push('Ping uses one family, three packets, zero allowed loss and 1000 ms RTT; review this against the source ping policy. An unspecified source family becomes IPv4, not dual-stack.')
  return {definition:{...common,type:'ping',ping:{host:a.url,family:a.ip_version==='ipv6'?6:4},assertions:{}},differences}
 }
 if(kind==='tcp'){
  if(typeof a.port!=='string'||!/^\d+$/.test(a.port))return {unsupported:'Better Stack TCP requires one explicit port; multi-port checks need separate TCP-001 monitors.'}
  differences.push('TCP performs one connection check and sends no payload; source banner criteria are not inferred.')
  return {definition:{...common,type:'tcp',tcp:{host:a.url,port:Number(a.port)},assertions:{}},differences}
 }
 const method=typeof a.http_method==='string'?a.http_method.toUpperCase():'GET'
 if(!['GET','HEAD','POST','PUT','PATCH','OPTIONS'].includes(method))return {refused:'Better Stack http_method has no supported HTTP-001 mapping.'}
 const assertions:Record<string,unknown>={status:['2xx']}
 if(kind==='expected_status_code'){
  if(!Array.isArray(a.expected_status_codes)||!a.expected_status_codes.length||a.expected_status_codes.some((n:any)=>!Number.isInteger(n)||n<100||n>599))return {refused:'Better Stack expected_status_codes must contain explicit HTTP status codes.'}
  assertions.status=a.expected_status_codes
 }
 if(kind==='keyword'||kind==='keyword_absence'){
  if(method==='HEAD')return {refused:'Better Stack keyword checks require a response body; HEAD is not a valid keyword method.'}
  differences.push('The required keyword becomes a literal, case-sensitive Uptime body assertion and also requires a 2xx response; review source matching and status behavior before enabling.')
  if(typeof a.required_keyword!=='string'||!a.required_keyword)return {refused:'Better Stack keyword checks require required_keyword.'}
  assertions[kind==='keyword'?'bodyIncludes':'bodyExcludes']=a.required_keyword
 }
 if(a.verify_ssl===false)differences.push('The explicit source SSL verification exception applies only to the initial HTTPS origin and requires a private runner; it grants no credential authority.')
 return {definition:{...common,type:kind.startsWith('keyword')?'keyword':'http',url:a.url,method,assertions,...(a.verify_ssl===false?{tlsTrust:{mode:'ignore',acknowledged:true}}:{})},differences}
}
export const betterStackMonitorImporter:Importer={source:'betterstack-monitors',label:'Better Stack saved monitor pages',detect(text){try{records(text);return true}catch{return false}},entries(text){return boundEntries(records(text)).map((value,index)=>({index,label:`Better Stack monitor ${index+1}`,value}))},map:({value})=>map(value)}
