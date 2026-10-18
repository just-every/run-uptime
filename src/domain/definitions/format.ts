// The reviewed monitor definition file (default name uptime.monitors.json): versioned, bounded and secret-free.
// It uses only fields the editor's validateDefinition accepts; installation-local authority (runner assignments,
// canaries, heartbeat tokens and credentials) never appears in it. Slow policies may name local destination IDs; a file never creates delivery credentials.
export const DEFINITION_FORMAT='uptime.monitors'
// Version 2 adds the flow type (FLOW-001); version 3 adds the tcp, dns, tls and domain types. Earlier files are still
// read; they just cannot hold the types added after them. Version 4 adds UDP; version 5 adds private scope and local grant references.
export const DEFINITION_VERSION=5
export const DEFINITION_READ_VERSIONS=[1,2,3,4,5]
export const DEFINITION_BYTES=2*1024*1024
export const DEFINITION_MONITORS=500
export const FILE_FIELDS=['name','type','network','privateGrantRef','url','method','request','tlsTrust','heartbeat','assertions','slow','intervalMs','timeoutMs','retries','probes','failureQuorum','confirmSlots','recoverSlots','freshnessMs','enabled','maintenanceUntil','maintenanceWindows','flow','tcp','udp','dns','tls','domain','project','environment','service','group','tags','owner','outcome','dependencies']
// Compared to decide unchanged or change. `enabled` and `maintenanceUntil` stay with the installation: a file never
// enables a monitor or changes its maintenance.
export const COMPARED_FIELDS=['name','type','network','privateGrantRef','url','method','request','tlsTrust','heartbeat','probes','assertions','slow','intervalMs','timeoutMs','retries','failureQuorum','confirmSlots','recoverSlots','freshnessMs','flow','tcp','udp','dns','tls','domain','project','environment','service','group','tags','owner','outcome','dependencies']

export class DefinitionFileError extends Error {status=400}
const fileError=(message:string)=>new DefinitionFileError(message)

// One shared size and UTF-8 bound for the console route and the local command.
export function decodeDefinitionBytes(bytes:Uint8Array){
 if(bytes.byteLength>DEFINITION_BYTES)throw fileError(`The file is ${bytes.byteLength.toLocaleString('en-US')} bytes; files are limited to 2 MiB (${DEFINITION_BYTES.toLocaleString('en-US')} bytes).`)
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw fileError('The file is not UTF-8 text.')}
}
export function boundDefinitionText(text:string){decodeDefinitionBytes(new TextEncoder().encode(text));return text}

export function parseJson(text:string,what:string){try{return JSON.parse(text)}catch{throw fileError(`The ${what} is not valid JSON`)}}
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
