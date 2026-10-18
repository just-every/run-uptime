import {DefinitionFileError,boundDefinitionText,jsonValues} from './format.ts'
import {recogniseHistory} from './history.ts'
import {withholdText} from './withhold.ts'
import {HISTORY_SOURCE,selectImporter,type Importer} from './importers/index.ts'
import {planCounts,planDigest,type PlanEntry} from './plan.server.ts'
export {undoBatch,listBatches} from './apply.server.ts'
export {exportDefinitions} from './export.server.ts'

/** Which source a file is, refusing what no importer reads with the reason. Writes nothing.
 * The move-in screen and the local command name this source to the import door. */
export function recogniseSource(text:string,source='auto'):string{
 boundDefinitionText(text)
 const importer=selectImporter(text,source)
 if(!importer){
  if((source==='auto'||source===HISTORY_SOURCE)&&recogniseHistory(text))return HISTORY_SOURCE
  // A JSON file no importer recognises: name the JSON error first, if there is one.
  if(source==='auto'&&/^\s*[[{]/.test(text))jsonValues(text,'file')
  throw new DefinitionFileError(source===HISTORY_SOURCE?'This is not a recognised UptimeRobot log export (CSV with a date or time column and an event column).':'Unrecognised file. Use an Uptime definition file (uptime.monitors.json), saved UptimeRobot v3 GET /monitors pages, or an UptimeRobot log export (CSV).')
 }
 importer.entries(text)
 return importer.source
}
/** A chosen file's source and its text with request secrets withheld (see withhold.ts): the text the move-in screen and
 * the local command upload to the import door. Writes nothing. */
export function recogniseFile(file:string,source='auto'){
 const text=withholdText(boundDefinitionText(file))
 return {source:recogniseSource(text,source),text}
}
const outcomeCounts=(entries:{action:string;differences:string[]}[])=>({
 importable:entries.filter(e=>['create','unchanged','change'].includes(e.action)&&!e.differences.length).length,
 withDifferences:entries.filter(e=>['create','unchanged','change'].includes(e.action)&&e.differences.length).length,
 unsupported:entries.filter(e=>e.action==='unsupported').length,
 refused:entries.filter(e=>e.action==='refused').length,
})
/** The preview the move-in screen and the local command show: counts, then each entry. */
export async function definitionView(importer:Importer,entries:PlanEntry[],monitorCount:number,digest?:string){
 return {kind:'definitions' as const,source:importer.source,sourceLabel:importer.label,digest:digest??await planDigest(importer.source,monitorCount,entries),
  reviewDigest:await planDigest(importer.source,monitorCount,entries),counts:planCounts(entries),outcomes:outcomeCounts(entries),
  entries:entries.map(({definition,expectedRevision,...entry})=>({...entry,...(definition?{target:{type:definition.type,network:definition.network,privateGrantRef:definition.privateGrantRef??null,assertions:definition.assertions,url:definition.url||null,intervalMs:definition.intervalMs,probes:definition.probes,credentialRef:definition.request?.credentialRef??null,tlsTrust:definition.tlsTrust??null,...(definition.heartbeat?{heartbeat:definition.heartbeat}:{}),...(definition.flow?{flow:{intent:definition.flow.intent,browser:definition.flow.browser,device:definition.flow.device,steps:definition.flow.steps.length,outcomes:definition.flow.outcomes.length}}:{})}}:{})}))}
}
