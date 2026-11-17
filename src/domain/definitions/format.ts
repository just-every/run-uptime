// The reviewed monitor definition file (default name uptime.monitors.json): versioned, bounded and secret-free.
// It uses only fields the editor's validateDefinition accepts; installation-local authority (runner assignments,
// canaries, heartbeat tokens and credentials) never appears in it. Slow policies may name local destination IDs; a file never creates delivery credentials.
export const DEFINITION_FORMAT='uptime.monitors'
// Version 2 adds the flow type (FLOW-001); version 3 adds the tcp, dns, tls and domain types. Earlier files are still
// read; they just cannot hold the types added after them. Version 4 adds UDP; version 5 adds private scope and local grant references; version 6 adds ICMP ping;
// version 7 adds a followed service's catalog part (DEPENDENCY-002), without which its checks would not read the provider's claim;
// version 8 adds the page-speed type and its device, network and budgets (PERF-001).
export const DEFINITION_VERSION=8
export const DEFINITION_READ_VERSIONS=[1,2,3,4,5,6,7,8]
export const DEFINITION_BYTES=2*1024*1024
export const DEFINITION_MONITORS=500
export const FILE_FIELDS=['name','type','network','privateGrantRef','url','method','request','tlsTrust','heartbeat','assertions','slow','intervalMs','timeoutMs','retries','probes','failureQuorum','confirmSlots','recoverSlots','freshnessMs','enabled','maintenanceUntil','maintenanceWindows','api','mail','flow','pagespeed','tcp','ping','udp','dns','tls','domain','catalog','project','environment','service','group','tags','owner','outcome','dependencies']
// Compared to decide unchanged or change. `enabled` and `maintenanceUntil` stay with the installation: a file never
// enables a monitor or changes its maintenance.
export const COMPARED_FIELDS=['name','type','network','privateGrantRef','url','method','request','tlsTrust','heartbeat','probes','assertions','slow','intervalMs','timeoutMs','retries','failureQuorum','confirmSlots','recoverSlots','freshnessMs','api','mail','flow','pagespeed','tcp','ping','udp','dns','tls','domain','catalog','project','environment','service','group','tags','owner','outcome','dependencies']

export class DefinitionFileError extends Error {status=400}
const fileError=(message:string)=>new DefinitionFileError(message)

// One shared size and UTF-8 bound for the console route and the local command.
export function decodeDefinitionBytes(bytes:Uint8Array){
 if(bytes.byteLength>DEFINITION_BYTES)throw fileError(`The file is ${bytes.byteLength.toLocaleString('en-US')} bytes; files are limited to 2 MiB (${DEFINITION_BYTES.toLocaleString('en-US')} bytes).`)
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw fileError('The file is not UTF-8 text.')}
}
export function boundDefinitionText(text:string){decodeDefinitionBytes(new TextEncoder().encode(text));return text}

export function parseJson(text:string,what:string){
 let value:any;try{value=JSON.parse(text)}catch{throw fileError(`The ${what} is not valid JSON`)}
 const queue:[any,number][]=[[value,0]]
 while(queue.length){const [item,depth]=queue.pop()!;if(depth>64)throw fileError('JSON nesting exceeds 64 levels.');if(item&&typeof item==='object')for(const [key,child] of Object.entries(item)){if(['__proto__','constructor','prototype'].includes(key))throw fileError('Prototype-related JSON keys are not accepted.');queue.push([child,depth+1])}}
 return value
}
export function boundEntries<T>(entries:T[]){if(entries.length>DEFINITION_MONITORS)throw fileError(`The file lists ${entries.length} monitors; at most ${DEFINITION_MONITORS} are accepted in one file.`);return entries}
export const entryLabel=(index:number,value:any)=>`Entry ${index+1}${typeof value?.name==='string'&&value.name.trim()?` (“${value.name.trim().slice(0,100)}”)`:''}`

// Several JSON values written one after another (for example API pages saved in sequence), or one value.
export function jsonValues(text:string,what:string){
 const values:unknown[]=[];let i=0
 while(i<text.length){
  while(i<text.length&&/\s/.test(text[i]))i++;if(i>=text.length)break
  const start=i;let depth=0,quoted=false,escaped=false
  if(!'{['.includes(text[i]))throw fileError(`The ${what} is not valid JSON: unexpected text at character ${i+1}.`)
  for(;i<text.length;i++){const c=text[i]
   if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
   if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if((c==='}'||c===']')&&--depth===0){i++;break}
  }
  values.push(parseJson(text.slice(start,i),what))
 }
 if(!values.length)throw fileError(`The ${what} is empty.`)
 return values
}

// Canonical JSON (sorted object keys) for comparison and the plan digest.
export function canonical(value:any):any{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));return value}
export async function sha256(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('')}

// Capture envelopes package saved public responses. They never grant provider access or fetch references.
export const CAPTURE_FORMAT='uptime.incumbent-capture.v1'
export const CAPTURE_SOURCES=['pingdom','aws-synthetics','pingdom-pagespeed-transcription']
export const SCHEMA_NOTES=[
 'Pingdom GET check detail omits ping although list/create document it; ping summaries remain unsupported pending reviewed normalization.',
 'Pingdom GET responsetime_threshold says boolean but its example and write schema use integer milliseconds; the adapter requires integer milliseconds and maps it to non-outage Slow, not the source down alert.',
 'Pingdom contact examples use channel-keyed notification_targets while the schema uses arrays; both are retained as unsupported source fields.',
 'Pingdom TMS detail has no id; capture request/list identity is required. Steps are withheld, never executed.',
 'No native Pingdom Page Speed export schema is established; operator transcriptions are proposals only.',
 'AWS Canary Code output contains references, not script bytes; separate local code input/artifacts are withheld and never fetched or executed.',
]
export type CaptureRow={kind:string;sourceId:string;value:any;path:string;request:any}
export type Capture={source:string;scope:any;rows:CaptureRow[];document:any}
const object=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const pointer=(key:string)=>key.replace(/~/g,'~0').replace(/\//g,'~1')
/** Leaves include empty containers: no supplied field can disappear from the reconciliation. */
export function suppliedLeaves(value:any,path=''):string[]{
 if(value&&typeof value==='object'&&Object.keys(value).length)return Object.entries(value).flatMap(([key,child])=>suppliedLeaves(child,path+'/'+pointer(key)))
 return [path||'/']
}
const COLLECTIONS:Record<string,string[]>={
 'checks-list':['checks'],'probes':['probes'],'contacts':['contacts'],'teams':['teams'],'maintenance':['maintenance'],
 'maintenance-occurrences':['occurrences'],'results':['results'],'summary-outage':['summary','states'],
 'tms-list':['checks'],'tms-status-report':['report','states'],'tms-performance-report':['report','intervals'],
 'canaries-list':['Canaries'],
}
const SINGLE=new Set(['check-detail','tms-detail','summary-average','summary-performance','canary-detail','canary-code-input','canary-run-config-input','page-speed-transcription'])
export function captureOf(text:string,requested='auto'):Capture|null{
 if(!/^\s*[[{]/.test(text))return null
 const values=jsonValues(text,'file')
 if(values.length!==1||!object(values[0])||(values[0] as any).format!==CAPTURE_FORMAT)return null
 const doc:any=values[0],fail=(reason:string):never=>{throw fileError('Capture: '+reason)}
 if(!CAPTURE_SOURCES.includes(doc.source)||requested!=='auto'&&requested!==doc.source)fail('unknown or mismatched source.')
 if(doc.synthetic!==true||!object(doc.scope)||!Array.isArray(doc.records)||typeof doc.capturedAt!=='string'||!Number.isFinite(Date.parse(doc.capturedAt)))fail('requires synthetic=true, scope, capturedAt and records.')
 const rows:CaptureRow[]=[],pageOffsets=new Map<string,{offset:number;limit:number;length:number}[]>(),tokens=new Set<string>()
 for(const [index,record] of doc.records.entries()){
  const base=`/records/${index}`,kind=record?.kind
  if(!object(record)||typeof kind!=='string'||!object(record.request)||!['GET','POST','LOCAL'].includes(record.request.method)||typeof record.request.path!=='string'||!object(record.response))fail(`record ${index+1} needs kind, request method/path and an object response.`)
  if(doc.source==='aws-synthetics'&&!['canaries-list','canary-detail','canary-code-input','canary-run-config-input','alarms-list'].includes(kind)||doc.source==='pingdom-pagespeed-transcription'&&kind!=='page-speed-transcription'||doc.source==='pingdom'&&['canaries-list','canary-detail','canary-code-input','canary-run-config-input','alarms-list','page-speed-transcription'].includes(kind))fail(`record ${index+1} kind does not belong to this source.`)
  const query=record.request.query??{}
  if(query.offset!==undefined&&(!Number.isInteger(query.offset)||query.offset<0)||query.limit!==undefined&&(!Number.isInteger(query.limit)||query.limit<1))fail('page offset/limit must be nonnegative/positive integers.')
  if(['check-detail','tms-detail'].includes(kind)&&record.request.path.split('/').at(-1)!==String(record.sourceId))fail('detail request path does not match sourceId.')
  if(record.response.NextToken){if(typeof record.response.NextToken!=='string'||tokens.has(kind+':'+record.response.NextToken))fail('repeated or invalid continuation token.');tokens.add(kind+':'+record.response.NextToken)}
  const add=(value:any,path:string)=>{if(!object(value))fail(`${path} must be an object.`);
   const epochs=kind==='maintenance'||kind==='maintenance-occurrences'?['from','to']:kind==='results'?['time']:kind==='summary-outage'?['timefrom','timeto']:[]
   for(const field of epochs)if(value[field]!==undefined&&(!Number.isSafeInteger(value[field])||value[field]<0))fail(`${kind}.${field} must be an integer source epoch, not a parsed or guessed date.`)
   rows.push({kind,sourceId:String(record.sourceId??''),value,path,request:record.request})}
  if(kind==='alarms-list'){
   if(!Array.isArray(record.response.MetricAlarms)||!Array.isArray(record.response.CompositeAlarms))fail('DescribeAlarms needs MetricAlarms and CompositeAlarms arrays.')
   for(const key of ['MetricAlarms','CompositeAlarms'])record.response[key].forEach((row:any,i:number)=>add(row,`${base}/response/${key}/${i}`))
  }else if(COLLECTIONS[kind]){
   const keys=COLLECTIONS[kind],list=keys.reduce((v:any,k)=>v?.[k],record.response)
   if(!Array.isArray(list))fail(`${kind} needs ${keys.join('.')} array.`)
   if(query.offset!==undefined){const key=kind+':'+record.request.path;pageOffsets.set(key,[...(pageOffsets.get(key)??[]),{offset:query.offset,limit:query.limit,length:list.length}])}
   list.forEach((row:any,i:number)=>add(row,`${base}/response/${keys.join('/')}/${i}`))
  }else if(SINGLE.has(kind)){
   const value=kind==='check-detail'?record.response.check:kind==='canary-detail'?record.response.Canary:record.response
   if(['check-detail','tms-detail','canary-detail','canary-code-input'].includes(kind)&&!String(record.sourceId??'').trim())fail(`${kind} requires stable request/list sourceId.`)
   if(kind==='check-detail'){
    if(!object(value)||value.id===undefined||String(value.id)!==String(record.sourceId)||!object(value.type)||Object.keys(value.type).length!==1)fail('check detail requires matching id and one named type settings object.')
    const settings=Object.values(value.type)[0]
    if(!object(settings))fail('check type settings must be an object.')
    if(typeof value.name!=='string'||typeof value.hostname!=='string'||!Number.isInteger(value.resolution))fail('check detail requires name, hostname and integer resolution.')
    const http=value.type.http
    if(http?.requestheaders!==undefined&&!Array.isArray(http.requestheaders)&&!object(http.requestheaders)&&http.requestheaders!=='[withheld]')fail('HTTP requestheaders must be the documented string array (legacy object accepted with a difference).')
    if(Array.isArray(http?.requestheaders)&&http.requestheaders.some((h:any)=>typeof h!=='string'||!h.includes(':')))fail('HTTP requestheaders entries must be colon-separated strings.')
   }
   if(kind==='tms-detail'&&(!['script','recording'].includes(value?.type)||typeof value.name!=='string'||!Number.isInteger(value.interval)||!Array.isArray(value.steps)))fail('TMS detail requires type, name, interval and steps.')
   if(kind==='canary-detail'&&(!object(value)||typeof value.Name!=='string'||!object(value.Code)||!object(value.Schedule)))fail('GetCanary requires Canary.Name, Code and Schedule.')
   add(value,base+'/response'+(kind==='check-detail'?'/check':kind==='canary-detail'?'/Canary':''))
  }else fail(`unknown record kind ${String(kind).slice(0,60)}.`)
 }
 for(const pages of pageOffsets.values()){
  pages.sort((a,b)=>a.offset-b.offset)
  for(let i=1;i<pages.length;i++)if(pages[i].offset>pages[i-1].offset+pages[i-1].limit||pages[i].offset===pages[i-1].offset)fail('offset pages have a gap or repeated offset.')
 }
 const monitorEntries=rows.filter(row=>row.kind==='check-detail').reduce((n,row)=>n+1+(row.value.type?.http?.ssl_down_days_before?1:0),0)
 if(monitorEntries>DEFINITION_MONITORS)fail('expanded check details exceed the 500 monitor-entry bound, including TLS companions.')
 if(rows.length>10000)fail('at most 10,000 source records are accepted.')
 return {source:doc.source,scope:doc.scope,rows,document:doc}
}
