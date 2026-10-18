import type {Bindings} from '../control.server.ts'
import {grants,MONITOR_LIMIT} from '../control.server.ts'
import {uptimeRobotImporter} from '../definitions/importers/uptimerobot.ts'
import type {Importer} from '../definitions/importers/types.ts'
import {keptAssignments} from '../definitions/plan.server.ts'
import {assignRunners,type Runner} from '../runner-registration.server.ts'
import {externalCheckUrl} from '../external-check.server.ts'
// @ts-ignore Shared product policy used by the ordinary definitions importer.
import {validateDefinition} from '../policy.mjs'
import {sha256} from '../../base/modules/import-kit/src/provenance/identity.ts'
import type {ImportMapping,Json,ParsedRecord} from '../../base/modules/import-kit/src/types.ts'
import type {ImportDoorSource} from '../../base/modules/import-kit/src/door/types.ts'
import {DOOR_KEY} from './context.server.ts'

/** The server-owned allow-list of door namespaces: one per source, each reusing
 * Uptime's own reader for that source. Any other namespace is refused. */
const SOURCES:Record<string,{importer:Importer;mapping:string;label:string}>={
 uptimerobot:{importer:uptimeRobotImporter,mapping:'uptime-uptimerobot-definitions-v1',label:'Saved UptimeRobot monitor'},
}
// Business and the owner's door transport saved source pages as NDJSON. No source fetch runs here.
function parser(importer:Importer){
 return (value:Json,index:number):ParsedRecord[]=>importer.entries(JSON.stringify(value)).map(entry=>{
  const id=entry.value?.id
  if(!(typeof id==='string'&&id.trim()&&id.length<=256)&&!(typeof id==='number'&&Number.isSafeInteger(id)&&id>=0))throw Error('Each saved monitor needs its source id')
  return {kind:'monitor',sourceId:String(id),payload:entry.value,pointer:`/${index}/data/${entry.index}`}
 })
}
async function sourceMapping(env:Bindings,namespace:string,source:(typeof SOURCES)[string]):Promise<ImportMapping>{
 const [stored,runners,external]=await Promise.all([
  env.DB.prepare('SELECT id,definition FROM monitors').all<{id:string;definition:string}>(),
  env.DB.prepare('SELECT * FROM runners ORDER BY registered_at,runner_id').all<Runner>(),externalCheckUrl(env),
 ])
 const monitors=stored.results.map(row=>({...row,definition:JSON.parse(row.definition)}))
 const first=(runners.results.find(row=>row.legacy_key)??runners.results[0])?.runner_id
 // The kit may map one source record more than once (a catch-up compares replacements), so
 // a name or a new monitor counts once per source record, never once per call.
 const names=new Map<string,string>(),creates=new Set<string>()
 return {version:source.mapping,map(record){
  const entry={index:0,label:source.label,value:record.payload},mapped=source.importer.map(entry)
  if(!('definition' in mapped))return {effects:[],rejection:'unsupported' in mapped?mapped.unsupported:mapped.refused}
  const unmapped=mapped.differences.map(reason=>({reason}))
  try{
   if(!first)throw Error('Open Runner / archive to establish this installation’s runner before importing.')
   const id=`${namespace}-`+sha256(JSON.stringify([DOOR_KEY,namespace,record.sourceId]))
   const old=monitors.find(row=>row.id===id),name=String(mapped.definition.name)
   if((names.get(name)??record.sourceId)!==record.sourceId)throw Error('Duplicate monitor name in this export.')
   names.set(name,record.sourceId)
   if(monitors.some(row=>row.id!==id&&row.definition.name===name))throw Error('A monitor with this name already exists. Review it in Definitions before importing a separate source.')
   if(!old&&monitors.length+creates.add(id).size>MONITOR_LIMIT)throw Error('The installation monitor limit would be exceeded.')
   const definition=validateDefinition({...mapped.definition,enabled:old?.definition.enabled??false,
    maintenanceUntil:old?.definition.maintenanceUntil??0,...(old?.definition.maintenanceWindows?{maintenanceWindows:old.definition.maintenanceWindows}:{})},grants(env))
   const assigned=assignRunners(runners.results,first,definition,old?{assignments:keptAssignments(old.definition,definition)}:{},external,env.RER_DEMO!=='1',env.UPTIME_ORIGIN)
   return {effects:[{targetKind:'monitor',targetId:id,value:assigned}],unmapped}
  }catch(error){return {effects:[],rejection:error instanceof Error?error.message:'Invalid monitor definition',unmapped}}
 }}
}
/** A fresh parser and mapping for a listed namespace, or null. Shared by the grant
 * mount and the owner-session mount. */
export async function importSource(env:Bindings,namespace:string):Promise<ImportDoorSource|null>{
 if(!Object.hasOwn(SOURCES,namespace))return null
 const source=SOURCES[namespace]
 return {parse:parser(source.importer),mapping:await sourceMapping(env,namespace,source)}
}
