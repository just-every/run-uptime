import {boundDefinitionText,DefinitionFileError} from '../definitions/format.ts'
// @ts-ignore Shared definition metadata vocabulary.
import {MONITOR_METADATA_FIELDS,validateMonitorMetadata} from '../monitor-metadata.mjs'

export const fail=(message:string):never=>{throw new DefinitionFileError(message)}
export const object=(value:any,label:string)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(`${label} must be an object.`);return value}
export function fields(value:any,allowed:string[],label:string){object(value,label);if(Object.keys(value).some(key=>!allowed.includes(key)))fail(`Unsupported ${label} field.`);return value}
export function enabledFlag(input:any){if(input.enableAfterCreate!==undefined&&typeof input.enableAfterCreate!=='boolean')fail('enableAfterCreate must be true or false.');return input.enableAfterCreate===true}
const metadataFields=[...MONITOR_METADATA_FIELDS] as string[]
export const metadata=(input:any)=>validateMonitorMetadata(input)
export const tags=(value:string)=>value.split(/[|;,]/).map(tag=>tag.trim()).filter(Boolean)
export const csvInterval=(value:string)=>{if(!/^\d+(?:\.\d{1,3})?$/.test(value))fail('CSV interval must be a number of seconds.');return Number(value)*1000}
export function addInput(input:any){
 fields(input,['format','text','defaults','enableAfterCreate','alertRoute','selectedIndexes'],'catalog add')
 if(!['urls','csv'].includes(input.format)||typeof input.text!=='string')fail('Choose urls or csv and supply its text.')
 boundDefinitionText(input.text)
 // A JSON string can contain a lone surrogate, which is not a UTF-8 source character.
 if(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(new TextEncoder().encode(input.text))!==input.text)fail('The file is not UTF-8 text.')
 const defaults=fields(input.defaults??{},['type','intervalMs','locations','probes','assignments','keyword','alertRoute',...metadataFields],'shared default')
 if(input.alertRoute!==undefined&&defaults.alertRoute!==undefined)fail('Choose the shared alert route once, in defaults or at the top level.')
 const alertRoute=input.alertRoute!==undefined?input.alertRoute:defaults.alertRoute
 if(alertRoute!==undefined&&(typeof alertRoute!=='string'||!alertRoute||alertRoute.length>512||/[\x00-\x1f\x7f]/.test(alertRoute)))fail('Choose an existing named alert route ID.')
 if(defaults.locations!==undefined&&defaults.probes!==undefined)fail('Use locations or probes, not both.')
 // `assignments` names the runner of each probe (the console's Check from); without it the probes take runners in order.
 const base={...metadata(defaults),type:defaults.type??'http',intervalMs:defaults.intervalMs??60000,probes:defaults.locations??defaults.probes??['local-a'],...(defaults.assignments!==undefined?{assignments:defaults.assignments}:{}),...(defaults.keyword!==undefined?{keyword:defaults.keyword}:{})}
 const text=input.text.replace(/^\uFEFF/,'')
 const rows=input.format==='urls'?text.split(/\r?\n/).map((url:string)=>url.trim()).filter(Boolean).map((url:string)=>({url})):csvRows(text)
 if(!rows.length)fail('Add at least one URL.')
 if(rows.length>500)fail(`The input lists ${rows.length} rows; at most 500 rows are accepted. The installation monitor limit still applies.`)
 if(input.selectedIndexes!==undefined&&(!Array.isArray(input.selectedIndexes)||input.selectedIndexes.some((index:any)=>!Number.isInteger(index)||index<0||index>=rows.length)||new Set(input.selectedIndexes).size!==input.selectedIndexes.length))fail('selectedIndexes must list distinct row indexes from this input.')
 return {base,rows,alertRoute,selected:input.selectedIndexes===undefined?null:new Set<number>(input.selectedIndexes),enabled:enabledFlag(input),unsupported:[] as string[]}
}
export function bulkInput(input:any){
 fields(input,['monitorIds','action','changes','enableAfterCreate','alertRoute'],'catalog bulk')
 if(!Array.isArray(input.monitorIds)||!input.monitorIds.length||input.monitorIds.length>100||input.monitorIds.some((id:any)=>typeof id!=='string'||!id||id.length>512||/[\x00-\x1f\x7f]/.test(id))||new Set(input.monitorIds).size!==input.monitorIds.length)fail('Select between 1 and 100 distinct monitor IDs.')
 if(!['edit','pause','resume','clone'].includes(input.action))fail('Choose edit, pause, resume or clone.')
 const changes=fields(input.changes??{},metadataFields,'catalog change')
 if(!['edit','clone'].includes(input.action)&&Object.keys(changes).length)fail('Metadata changes require edit or clone.')
 if(input.action!=='clone'&&input.enableAfterCreate!==undefined)fail('enableAfterCreate applies only to newly created monitors.')
 return {ids:input.monitorIds as string[],action:input.action as 'edit'|'pause'|'resume'|'clone',changes:metadata(changes),enabled:enabledFlag(input),unsupported:input.alertRoute!==undefined?['Alert routes are unsupported. No notification route will be changed.']:[]}
}

/** RFC 4180 quoting, including embedded newlines; malformed records never silently shift columns. */
function csvRows(text:string):Record<string,string|number|string[]>[]{
 const records:string[][]=[];let row:string[]=[],value='',quoted=false,closed=false
 const cell=()=>{row.push(value);value='';closed=false}
 const record=()=>{cell();if(row.some(v=>v!==''))records.push(row);row=[];if(records.length>501)fail('CSV accepts at most 500 data rows.')}
 for(let i=0;i<text.length;i++){
  const c=text[i]
  if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++}else{quoted=false;closed=true}}else value+=c;continue}
  if(c==='"'){if(value||closed)fail('Malformed CSV quoting.');quoted=true;continue}
  if(c===','){cell();continue}
  if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;record();continue}
  if(closed)fail('Malformed CSV: characters follow a closing quote.')
  value+=c
 }
 if(quoted)fail('Malformed CSV: an opened quote is not closed.')
 if(value||row.length||closed)record()
 const headers=records.shift()?.map(h=>h.trim())??[]
 if(!headers.includes('url')||new Set(headers).size!==headers.length||headers.some(h=>!['url','name','type','keyword','interval','tags','group'].includes(h)))fail('CSV needs a url column; optional columns are name, type, keyword, interval, tags and group.')
 return records.map((cells,index)=>{
  if(cells.length!==headers.length)fail(`CSV row ${index+1} has a different number of columns from its header.`)
  const result:Record<string,string|number|string[]>={}
  headers.forEach((header,i)=>{const v=cells[i].trim();if(v)result[header]=header==='tags'?tags(v):v})
  return result
 })
}
