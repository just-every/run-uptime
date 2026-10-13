import type {Bindings} from '../control.server.ts'
import type {AuditActor} from '../audit.server.ts'
import {DefinitionFileError,boundDefinitionText,jsonValues} from './format.ts'
import {recogniseHistory} from './history.ts'
import {HISTORY_SOURCE,selectImporter,type Importer} from './importers/index.ts'
import {planDefinitions} from './plan.server.ts'
import {applyPlan} from './apply.server.ts'
export {undoBatch,listBatches} from './apply.server.ts'
export {exportDefinitions} from './export.server.ts'

// One engine behind the console route and the local command: bound, recognise, map, validate, plan.
async function planText(env:Bindings,text:string,source='auto'){
 boundDefinitionText(text)
 const importer=selectImporter(text,source)
 if(!importer){
  if(source==='auto'||source===HISTORY_SOURCE){const history=recogniseHistory(text);if(history)return {history}}
  // A JSON file no importer recognises: name the JSON error first, if there is one.
  if(source==='auto'&&/^\s*[[{]/.test(text))jsonValues(text,'file')
  throw new DefinitionFileError(source===HISTORY_SOURCE?'This is not a recognised UptimeRobot log export (CSV with a date or time column and an event column).':'Unrecognised file. Use an Uptime definition file (uptime.monitors.json), saved UptimeRobot v3 GET /monitors pages, or an UptimeRobot log export (CSV).')
 }
 const items=importer.entries(text).map(entry=>({...entry,mapping:importer.map(entry)}))
 return {importer,plan:await planDefinitions(env,importer.source,items)}
}
const outcomeCounts=(entries:{action:string;differences:string[]}[])=>({
 importable:entries.filter(e=>['create','unchanged','change'].includes(e.action)&&!e.differences.length).length,
 withDifferences:entries.filter(e=>['create','unchanged','change'].includes(e.action)&&e.differences.length).length,
 unsupported:entries.filter(e=>e.action==='unsupported').length,
 refused:entries.filter(e=>e.action==='refused').length,
})
function view(importer:Importer,plan:Awaited<ReturnType<typeof planDefinitions>>){
 return {kind:'definitions' as const,source:importer.source,sourceLabel:importer.label,digest:plan.digest,counts:plan.counts,outcomes:outcomeCounts(plan.entries),
  entries:plan.entries.map(({definition,...entry})=>({...entry,...(definition?{target:{type:definition.type,url:definition.url||null,intervalMs:definition.intervalMs,probes:definition.probes,credentialRef:definition.request?.credentialRef??null,...(definition.flow?{flow:{intent:definition.flow.intent,steps:definition.flow.steps.length,outcomes:definition.flow.outcomes.length}}:{})}}:{})}))}
}
// Writes nothing.
export async function previewDefinitions(env:Bindings,text:string,source?:string){
 const result=await planText(env,text,source)
 return 'history' in result?result.history:view(result.importer,result.plan)
}
export async function applyDefinitions(env:Bindings,text:string,source:string|undefined,digest:unknown,actor:AuditActor){
 if(typeof digest!=='string'||!/^[0-9a-f]{64}$/.test(digest))throw new DefinitionFileError('Apply needs the plan digest shown by the preview.')
 const result=await planText(env,text,source)
 if('history' in result)throw new DefinitionFileError('A log export is history only; there is nothing to apply.')
 return {...await applyPlan(env,result.plan,digest,actor),preview:view(result.importer,result.plan)}
}
