import {DEFINITION_FORMAT,DEFINITION_VERSION,DEFINITION_READ_VERSIONS,DefinitionFileError,FILE_FIELDS,boundEntries,entryLabel,parseJson} from '../format.ts'
import type {Importer} from './types.ts'

// Uptime's own definition file: {"format":"uptime.monitors","version":4,"monitors":[...]} (versions 1–3 are still read).
function document(text:string){
 const value=parseJson(text,'file')
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['format','version','monitors'].includes(k))||value.format!==DEFINITION_FORMAT||!DEFINITION_READ_VERSIONS.includes(value.version)||!Array.isArray(value.monitors))
  throw new DefinitionFileError(`This is not an Uptime definition file: expected {"format": "${DEFINITION_FORMAT}", "version": ${DEFINITION_VERSION}, "monitors": [...]} (versions 1–3 also read) and no other top-level fields.`)
 return value
}
export const nativeImporter:Importer={
 source:DEFINITION_FORMAT,label:'Uptime definition file',
 detect(text){try{return JSON.parse(text)?.format===DEFINITION_FORMAT}catch{return false}},
 entries(text){const doc=document(text);return boundEntries(doc.monitors).map((value:any,index:number)=>({index,label:entryLabel(index,value),value,version:doc.version}))},
 map({label,value,version}){
  if(!value||typeof value!=='object'||Array.isArray(value))return {refused:`${label} is not a monitor object.`}
  const unknown=Object.keys(value).filter(k=>!FILE_FIELDS.includes(k))
  if(value.type==='flow'&&version===1)return {refused:`${label}: a flow monitor needs a version 2 file; this file says version 1.`}
  if(['tcp','dns','tls','domain'].includes(value.type)&&(version??1)<3)return {refused:`${label}: a ${String(value.type).toUpperCase()} monitor needs a version 3 file; this file says version ${version}.`}
  if(value.type==='udp'&&(version??1)<4)return {refused:`${label}: a UDP monitor needs a version 4 file; this file says version ${version}.`}
  if(unknown.length)return {refused:`${label}: unknown field${unknown.length>1?'s':''} ${unknown.map(k=>`“${k.slice(0,60)}”`).join(', ')}. Secrets and installation settings never belong in this file.`}
  return {definition:value,differences:[]}
 },
}
