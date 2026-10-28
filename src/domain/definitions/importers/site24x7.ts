import {DefinitionFileError,boundEntries,jsonValues} from '../format.ts'
import type {Importer} from './types.ts'
import {statusIqComponent,thirdPartyService} from './third-party.ts'
// Saved Site24x7 monitor lists and StatusIQ components, documented at
// https://www.site24x7.com/help/api/ and https://www.site24x7.com/help/statusiq/api/.
// Provider status addresses retain DEPENDENCY-002's existing catalog mapping.
const monitor=(value:any)=>value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.display_name==='string'&&typeof (value.monitor_type??value.type)==='string'
const components=(data:any)=>data&&typeof data==='object'&&!Array.isArray(data)&&Number.isSafeInteger(data.thirdparty_service_id)&&typeof data.thirdparty_service_display_name==='string'&&Array.isArray(data.thirdparty_components)&&
 data.thirdparty_components.every((c:any)=>c&&typeof c.thirdparty_component_id==='string'&&typeof c.thirdparty_component_display_name==='string'&&c.thirdparty_component_display_name.trim())
const NOT_CONVERTED=['Site24x7 locations, notification profiles, thresholds and history are not transferred. Reconnect them before cutover.']
function records(text:string){
 const values=jsonValues(text,'Site24x7 file'),pages=values.length===1&&Array.isArray(values[0])?values[0] as any[]:values
 if(!pages.length||pages.some((p:any)=>!p||p.code!==0||typeof p.message!=='string'||!(Array.isArray(p.data)?p.data.length&&p.data.every(monitor):components(p.data))))
  throw new DefinitionFileError('Use saved Site24x7 responses: monitor lists ({"code": 0, "message": "success", "data": [monitors with display_name and type]}) or StatusIQ third-party components ({"code": 0, "data": {"thirdparty_service_id": ..., "thirdparty_components": [...]}}).')
 return pages.flatMap((p:any)=>Array.isArray(p.data)?p.data.map((value:any)=>({kind:'monitor',value})):p.data.thirdparty_components.map((value:any)=>({kind:'component',service:p.data,value})))
}
// Saved GET /monitors: monitor_type is the response field; type is the documented
// monitor-parameter spelling also accepted by the existing reader. Parameters,
// method/lookup constants and interval units: https://www.site24x7.com/help/api/
// (read 23 October 2026). No account or live extraction is used.
const present=(value:any)=>value!==undefined&&value!==null&&value!==''&&value!==false&&!(Array.isArray(value)&&!value.length)
const methods:Record<string,string>={G:'GET',H:'HEAD',P:'POST',U:'PUT',D:'DELETE',A:'PATCH',OPTIONS:'OPTIONS'}
const handoffs:Record<string,string>={REALBROWSER:'browser transactions need reviewed FLOW-001/FLOW-002 conversion', 'URL-SEQ':'transaction steps need reviewed FLOW-002 conversion',HOMEPAGE:'browser page-speed settings need PERF-001 conversion',SSL_CERT:'expiry reminders need TLS-001 conversion',DOMAINEXPIRY:'expiry reminders need DOMAIN-001 conversion',HEARTBEAT:'period and threshold review belongs to HEARTBEAT-004',UDP:'datagram payload and response criteria need UDP-001 conversion','PORT-POP':'mail protocol settings need MAIL-001 conversion','PORT-SMTP':'mail protocol settings need MAIL-001 conversion',SMTP:'mail transactions need MAIL-001 conversion'}
function savedMonitor(value:any){
 const kind=value.type as string
 if(!['URL','RESTAPI','PORT','PING','DNS'].includes(kind))return {unsupported:`Site24x7 ${kind}: ${handoffs[kind]??'this monitor has no saved-definition conversion in MIGRATE-004; retain the export and review infrastructure/APM records with Porthole or your observability system'}.`}
 if(value.check_frequency===undefined||value.timeout===undefined)return {unsupported:`Site24x7 ${kind}: the saved record lacks check_frequency or timeout. Save its complete monitor settings before conversion.`}
 for(const field of ['use_ipv6','use_ssl','invert_port_check','ignore_cert_err','dnssec'])if(value[field]!==undefined&&typeof value[field]!=='boolean')return {refused:`Site24x7 ${field} must be a boolean.`}
 const frequency=typeof value.check_frequency==='string'&&/^\d+(?:\.\d+)?$/.test(value.check_frequency)?Number(value.check_frequency):NaN
 if(!Number.isFinite(frequency)||frequency<=0||!Number.isSafeInteger(frequency*60000)||frequency>1440)return {refused:'Site24x7 check_frequency must be a documented interval in minutes, at most one day.'}
 if(!Number.isInteger(value.timeout)||value.timeout<1||value.timeout>45)return {refused:'Site24x7 timeout must be a whole number of seconds from 1 to 45.'}
 const timeoutMs=Math.max(kind==='PING'?8000:50,Math.min(10000,value.timeout*1000))
 const differences=[`Site24x7 ${kind} is imported paused; check_frequency ${value.check_frequency} minutes becomes ${frequency*60000} ms.`, `Source timeout ${value.timeout*1000} ms becomes ${timeoutMs} ms.`, 'Checks use local-a on your own runner; Site24x7 locations are not reproduced. Review local confirmation/recovery (two scheduled results) and retry policy (no retries) before enabling.',...NOT_CONVERTED]
 const common={name:value.display_name,enabled:false,intervalMs:frequency*60000,timeoutMs,probes:['local-a'],failureQuorum:1,retries:0,confirmSlots:2,recoverSlots:2,freshnessMs:Math.min(86400000,Math.max(180000,frequency*180000))}
 const mapped=new Set(['display_name','type','monitor_type','monitor_id','check_frequency','timeout'])
 const done=(definition:Record<string,unknown>,fields:string[])=>{
  for(const field of fields)mapped.add(field)
  for(const field of Object.keys(value))if(!mapped.has(field)&&present(value[field]))differences.push(`Source field ${field} is not converted; retain it and review it before cutover.`)
  return {definition:{...common,...definition},differences}
 }
 if(kind==='URL'||kind==='RESTAPI'){
  const blocked=['request_param','custom_headers','credential_profile_id','oauth2_provider','jwt_id','client_certificate_password','graphql','matching_keyword','unmatching_keyword','match_regex','response_headers_check','json_schema','json_schema_check'].filter(field=>present(value[field]))
  if(present(value.auth_method))blocked.push('auth_method')
  if(blocked.length)return {unsupported:`Site24x7 ${kind}: ${blocked.join(', ')} require reviewed HTTP-001/API-002 conversion; no request values are copied.`}
  if(value.ignore_cert_err===true)return {unsupported:'Site24x7 ignore_cert_err needs an explicit NETWORK-002 trust review; this slice does not grant an exception.'}
  if(typeof value.http_method!=='string'||!methods[value.http_method])return {unsupported:`Site24x7 ${kind}: http_method ${String(value.http_method??'not supplied')} has no supported HTTP-001 mapping.`}
  if(typeof value.up_status_codes!=='string'||!value.up_status_codes.trim())return {unsupported:`Site24x7 ${kind}: save explicit up_status_codes; success criteria are not guessed.`}
  const codes=value.up_status_codes.split(',').map((code:string)=>code.trim()),status:(number|string)[]=[]
  for(const code of codes){
   if(/^[1-5]\d{2}$/.test(code))status.push(Number(code))
   else{const range=/^([1-5]\d{2}):([1-5]\d{2})$/.exec(code);if(!range||Number(range[1])>Number(range[2]))return {refused:'Site24x7 up_status_codes contains an invalid code or inclusive range.'};status.push(`${range[1]}-${range[2]}`)}
  }
  differences.push(`http_method ${value.http_method} becomes ${methods[value.http_method]}; up_status_codes ${value.up_status_codes} preserves its complete accepted set.`, 'Redirects use Uptime public-target validation; source redirect and cookie settings require review.')
  return done({type:'http',url:value.website,method:methods[value.http_method],assertions:{status:status.length===1&&typeof status[0]==='number'?status[0]:status}},['website','http_method','up_status_codes','ignore_cert_err'])
 }
 if(kind==='PORT'){
  const blocked=['use_ssl','invert_port_check','command','matching_keyword','unmatching_keyword'].filter(field=>present(value[field]))
  if(blocked.length)return {unsupported:`Site24x7 PORT: ${blocked.join(', ')} cannot be reduced to an open TCP port check; review TCP-001/MAIL-001 conversion.`}
  differences.push('host_name and port become a TCP connection check; no command is sent and no banner is asserted.')
  return done({type:'tcp',tcp:{host:value.host_name,port:value.port},assertions:{}},['host_name','port','use_ssl','invert_port_check'])
 }
 if(kind==='PING'){
  differences.push('host_name becomes ICMP ping on a private runner: three packets, zero allowed loss and 1000 ms RTT; source threshold profiles and packet policy need explicit review (PING-001).')
  return done({type:'ping',ping:{host:value.host_name,family:value.use_ipv6===true?6:4},assertions:{}},['host_name','use_ipv6'])
 }
 const resolver:Record<string,string>={'1.1.1.1':'cloudflare','8.8.8.8':'google'},types:Record<number,string>={1:'A',28:'AAAA',2:'NS',15:'MX',5:'CNAME',33:'SRV',16:'TXT',257:'CAA'}
 if(!resolver[value.dns_host]||Number(value.dns_port??53)!==53)return {unsupported:`Site24x7 DNS: resolver ${String(value.dns_host)} on port ${String(value.dns_port??53)} has no matching installed DNS-001 resolver choice; it is not replaced silently.`}
 if(!types[value.lookup_type])return {unsupported:`Site24x7 DNS: lookup_type ${String(value.lookup_type)} has no closed DNS-001 record-type mapping.`}
 if(value.dnssec===true||present(value.search_config))return {unsupported:'Site24x7 DNS: DNSSEC or search_config value/TTL criteria require reviewed DNS-001 conversion; they are not dropped.'}
 differences.push(`domain_name and lookup_type become ${types[value.lookup_type]} through ${resolver[value.dns_host]}; transport becomes DNS-over-HTTPS instead of the source UDP/TCP resolver connection. No answer-value or TTL assertion was supplied.`)
 return done({type:'dns',dns:{name:value.domain_name,recordType:types[value.lookup_type],resolvers:[resolver[value.dns_host]]},assertions:{}},['dns_host','dns_port','domain_name','lookup_type','protocol','dnssec'])
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
  const value={...record.value,type:record.value.monitor_type??record.value.type}
  if(value.type==='AWSHEALTH')return {refused:'A Site24x7 AWS Health monitor counts your own AWS account’s health events through your AWS credentials; it reads no public status source, so it is not converted. Follow AWS from the service catalog to watch AWS’s public status.'}
  if(value.type==='OFFICE365')return {refused:'A Site24x7 Office 365 monitor reads your own tenant’s usage through your Microsoft credentials; it reads no public status source, so it is not converted. Microsoft 365 is in the service catalog as a status page you can add by address.'}
  if(value.type==='URL'&&typeof value.website==='string'&&value.display_name.trim()){
   const third=thirdPartyService(value.website,value.display_name)
   if(third&&'definition' in third)return {definition:third.definition,differences:[...third.differences,...NOT_CONVERTED]}
  }
  return savedMonitor(value)
 },
}
