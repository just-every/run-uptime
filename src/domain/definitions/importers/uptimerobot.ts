// @ts-ignore Shared read-only saved-contact guidance.
import {CONTACT_EXPORT_GUIDANCE} from '../../webhook-contact-import.mjs'
import {DEFINITION_MONITORS,DefinitionFileError,boundEntries,jsonValues} from '../format.ts'
import type {Importer,Mapping,SourceEntry} from './types.ts'
import {thirdPartyService} from './third-party.ts'

// UptimeRobot API v3 `GET /monitors` responses: {"data": [monitor, ...], "nextLink": string|null}, one page or several
// pages saved one after another (or as one JSON array of pages). Field names follow UptimeRobot's published OpenAPI
// document (https://cdn.uptimerobot.com/api/openapi.yaml, loaded by https://uptimerobot.com/api/v3/). Nothing here
// calls UptimeRobot; the owner supplies the saved responses.
const MIN_INTERVAL_S=5,MAX_INTERVAL_S=86400,MAX_TIMEOUT_MS=10000,MIN_TIMEOUT_MS=50
const isPage=(value:any)=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&Array.isArray(value.data)&&Object.hasOwn(value,'nextLink')
function pages(text:string){
 const values=jsonValues(text,'UptimeRobot file'),flat=values.length===1&&Array.isArray(values[0])?values[0] as unknown[]:values
 if(!flat.length||!flat.every(isPage))throw new DefinitionFileError('This is not an UptimeRobot v3 monitor list: expected one or more saved GET /monitors pages, each {"data": [...], "nextLink": ...}.')
 return flat as {data:unknown[]}[]
}
const seconds=(ms:number)=>`${(ms/1000).toLocaleString('en-US')} s`
const list=(values:string[])=>values.join(', ')
const present=(value:unknown)=>value!==null&&value!==undefined&&value!==''&&!(Array.isArray(value)&&!value.length)&&!(typeof value==='object'&&!Array.isArray(value)&&!Object.keys(value as object).length)

// Preserve the whole accepted set: exact codes, status classes and inclusive ranges. Missing/empty lists use
// UptimeRobot's default 2xx/3xx set; an unrecognised value must never silently narrow or broaden that set.
function expectedStatus(codes:unknown):{status:number|(number|string)[]}|{unsupported:string}{
 if(codes!==undefined&&codes!==null&&!Array.isArray(codes))return {unsupported:'Expected status codes must be a list of exact HTTP codes, classes such as 2xx or ranges such as 200-299.'}
 const values=Array.isArray(codes)&&codes.length?codes:['2xx','3xx'],accepted:(number|string)[]=[]
 for(const value of values){
  if(typeof value==='number'&&Number.isInteger(value)&&value>=100&&value<=599){accepted.push(value);continue}
  if(typeof value==='string'){
   if(/^[1-5][0-9]{2}$/.test(value)){accepted.push(Number(value));continue}
   if(/^[1-5]xx$/.test(value)){accepted.push(value);continue}
   const range=/^([1-5][0-9]{2})-([1-5][0-9]{2})$/.exec(value)
   if(range&&Number(range[1])<=Number(range[2])){accepted.push(value);continue}
  }
  return {unsupported:'Expected status codes include an unsupported value; use exact HTTP codes, classes such as 2xx or ranges such as 200-299.'}
 }
 return {status:accepted.length===1&&typeof accepted[0]==='number'?accepted[0]:accepted}
}

function map(entry:SourceEntry):Mapping{
 const m=entry.value,label=entry.label
 if(!m||typeof m!=='object'||Array.isArray(m))return {refused:`${label} is not a monitor object.`}
 const type=String(m.type??'').toUpperCase(),differences:string[]=[]
 if(!['HTTP','KEYWORD','HEARTBEAT'].includes(type))return {unsupported:type==='API'?'API monitors with response assertions are not supported; Uptime runs HTTP(S), keyword and heartbeat checks.':`${type||'Untyped'} monitors are not supported; Uptime runs HTTP(S), keyword and heartbeat checks.`}
 if(typeof m.friendlyName!=='string'||!m.friendlyName.trim())return {refused:`${label} has no friendlyName.`}
 if(typeof m.interval!=='number'||!Number.isFinite(m.interval)||m.interval<=0)return {refused:`${label} has no usable interval.`}
 if(m.interval<MIN_INTERVAL_S)return {unsupported:`Interval ${m.interval} s is below Uptime's ${MIN_INTERVAL_S} s floor.`}
 if(m.interval>MAX_INTERVAL_S)return {unsupported:`Interval ${m.interval.toLocaleString('en-US')} s is above Uptime's one-day ceiling (${MAX_INTERVAL_S.toLocaleString('en-US')} s).`}
 const intervalMs=Math.round(m.interval*1000)
 if(intervalMs!==m.interval*1000)differences.push(`Cadence change: UptimeRobot checked every ${m.interval} s; Uptime checks every ${seconds(intervalMs)}.`)
 const freshnessMs=Math.min(86400000,Math.max(180000,3*intervalMs))
 const common={name:m.friendlyName,intervalMs,freshnessMs,retries:1,confirmSlots:2,recoverSlots:2,enabled:false}
 const contacts=Array.isArray(m.assignedAlertContacts)?m.assignedAlertContacts.length:present(m.assignedAlertContacts)?1:0
 for(const [present_,text] of [
  [contacts>0,`${contacts} alert contact${contacts===1?'':'s'} not imported: reconnect destinations locally. Nothing is sent from import.`],
  [present(m.psps),'Status pages are not imported: a public status page is a different product (Lamp).'],
  [present(m.maintenanceWindows),'Maintenance windows are not imported: schedule maintenance on the monitor in Uptime.'],
  [present(m.tags)||present(m.groupId),'Tags and groups are not imported.'],
 ] as [boolean,string][])if(present_)differences.push(text)
 if(type==='HEARTBEAT'){
  if(m.gracePeriod!==undefined&&(typeof m.gracePeriod!=='number'||!Number.isFinite(m.gracePeriod)||m.gracePeriod<0))return {refused:'Heartbeat grace must be from 0 to 86400 seconds.'}
  const graceMs=Math.round((m.gracePeriod??0)*1000)
  differences.push(`Heartbeat jobs must be repointed: ${typeof m.heartbeatUrl==='string'&&m.heartbeatUrl?m.heartbeatUrl:'the UptimeRobot heartbeat URL'} stops being used. Issue a new Uptime heartbeat token on the monitor page after import; the old URL and token are not imported.`)
  differences.push('Local heartbeat policy: one scheduled missed-deadline result confirms failure and one scheduled success confirms recovery. Source alert delays, repeats and escalation settings are not converted; review them separately before activation.')
  if(!Number.isSafeInteger(graceMs)||graceMs>86400000)return {refused:'Heartbeat grace must be from 0 to 86400 seconds.'}
  differences.push(`Heartbeat schedule: expected period ${intervalMs/1000} seconds plus ${graceMs/1000} seconds grace. Missing that deadline is a missed run.`)
  return {definition:{...common,type:'heartbeat',heartbeat:{maxAgeMs:intervalMs,graceMs},confirmSlots:1,recoverSlots:1,assertions:{status:200},probes:['local-a'],failureQuorum:1},differences}
 }
 if(contacts)differences.push(CONTACT_EXPORT_GUIDANCE)
 if(typeof m.url!=='string'||!m.url)return {refused:`${label} has no URL.`}
 // DEPENDENCY-002: a monitor of a provider's status address maps onto its catalog entry.
 const third=thirdPartyService(m.url,m.friendlyName)
 if(third&&'definition' in third)return {definition:third.definition,differences:[...third.differences,...differences]}
 let method=String(m.httpMethodType??'HEAD').toUpperCase()
 if(!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(method))return {unsupported:`HTTP method ${method} is not supported.`}
 if(type==='KEYWORD'&&method==='HEAD'){method='GET';differences.push('Keyword checks need the page body: Uptime uses GET where UptimeRobot used HEAD.')}
 const status=expectedStatus(m.successHttpResponseCodes)
 if('unsupported' in status)return {unsupported:status.unsupported}
 const assertions:Record<string,unknown>={status:status.status}
 if(type==='KEYWORD'){
  // ALERT_NOT_EXISTS requires the keyword; ALERT_EXISTS requires its absence.
  const keywordType=String(m.keywordType??'').toUpperCase()
  if(!['ALERT_NOT_EXISTS','ALERT_EXISTS'].includes(keywordType))return {refused:`${label} has no recognised keywordType.`}
  if(typeof m.keywordValue!=='string'||!m.keywordValue)return {refused:`${label} has no keyword.`}
  assertions[keywordType==='ALERT_EXISTS'?'bodyExcludes':'bodyIncludes']=m.keywordValue
  const keywordCase=String(m.keywordCaseType??'').toLowerCase()
  if(['0','caseinsensitive'].includes(keywordCase))differences.push('UptimeRobot matched the keyword ignoring case; Uptime matches it exactly.')
  else if(!['1','casesensitive'].includes(keywordCase))differences.push('UptimeRobot did not specify a recognised keyword case-sensitivity setting; Uptime matches the text exactly. Check the condition before enabling it.')
 }
 const timeoutMs=typeof m.timeout==='number'&&m.timeout>0?Math.round(m.timeout*1000):null
 const chosenTimeout=Math.min(MAX_TIMEOUT_MS,Math.max(MIN_TIMEOUT_MS,timeoutMs??MAX_TIMEOUT_MS))
 if(timeoutMs===null)differences.push(`No timeout was set; Uptime uses ${seconds(chosenTimeout)}.`)
 else if(chosenTimeout!==timeoutMs)differences.push(`Timeout ${seconds(timeoutMs)} becomes ${seconds(chosenTimeout)}, Uptime's ${chosenTimeout===MAX_TIMEOUT_MS?'longest':'shortest'}.`)
 const secrets=[...(present(m.authType)&&String(m.authType).toUpperCase()!=='NONE'||present(m.httpUsername)||present(m.httpPassword)?['authentication']:[]),...(present(m.customHttpHeaders)?['custom request headers']:[]),...(present(m.postValueData)?['the request body']:[])]
 const request=secrets.length?{credentialRef:`uptimerobot-${String(m.id??entry.index+1).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)||entry.index+1}`}:undefined
 if(request)differences.push(`Needs a local credential reference “${request.credentialRef}”: ${list(secrets)} ${secrets.length===1?'was':'were'} not imported.`)
 if(m.checkSSLErrors===false&&/^https:/i.test(m.url))differences.push('Certificate errors were ignored in UptimeRobot. The reviewed exception is preserved for the initial HTTPS origin only, requires a private runner and grants no credential authority.')
 if(m.followRedirections===false)differences.push('UptimeRobot did not follow redirects; Uptime follows them, validating each hop.')
 if(m.sslExpirationReminder===true||m.domainExpirationReminder===true)differences.push('Certificate and domain expiry reminders are not reproduced.')
 const regions=Array.isArray(m.regionalData?.REGION)?m.regionalData.REGION.map(String):[]
 differences.push(`UptimeRobot's ${regions.length?`${list(regions)} region`:'own'} vantage is not reproduced. Uptime checks from probe local-a on your own runner; add a second runner network or a canary URL before enabling it.`)
 if(third&&'notes' in third)differences.push(...third.notes)
 return {definition:{...common,type:type==='KEYWORD'?'keyword':'http',url:m.url,method,assertions,timeoutMs:chosenTimeout,probes:['local-a'],failureQuorum:1,...(request?{request}:{}),...(m.checkSSLErrors===false&&/^https:/i.test(m.url)?{tlsTrust:{mode:'ignore',acknowledged:true}}:{})},differences}
}

export const uptimeRobotImporter:Importer={
 source:'uptimerobot',label:'UptimeRobot v3 monitor list',
 detect(text){try{pages(text);return true}catch{return false}},
 entries(text){
  const monitors=pages(text).flatMap(page=>page.data)
  if(monitors.length>DEFINITION_MONITORS)boundEntries(monitors)
  return monitors.map((value:any,index)=>({index,label:`Monitor ${index+1}${typeof value?.friendlyName==='string'&&value.friendlyName.trim()?` (“${value.friendlyName.trim().slice(0,100)}”)`:typeof value?.id==='number'?` (id ${value.id})`:''}`,value}))
 },
 map,
}
