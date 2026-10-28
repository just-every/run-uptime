import type {Bindings} from '../control.server.ts'
import {mutationGuard} from '../audit.server.ts'
import {sourceInstant,refuse} from './model.ts'
import {historyCutover,union} from './segments.server.ts'
export async function setHistoryCutover(env:Bindings,id:string,input:any){
 const at=sourceInstant(input?.cutoverAt,'cutoverAt'),current=await historyCutover(env,id)
 const batches=(await env.DB.prepare('SELECT coverage_from,coverage_to FROM source_history_batches WHERE monitor_id=?').bind(id).all<{coverage_from:number;coverage_to:number}>()).results
 const coverage=union(batches.map(b=>[b.coverage_from,b.coverage_to]))
 if(current.firstSlotAt===null||current.lastSlotTo===null||at<current.firstSlotAt||at>current.lastSlotTo||!coverage.some(([a,b])=>a<=at&&at<=b))refuse('cutoverAt must be within the side-by-side overlap of source coverage and scheduled Uptime slots')
 await env.DB.batch([mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=?)',[id]),env.DB.prepare('INSERT INTO source_history_cutovers(monitor_id,cutover_at) VALUES(?,?) ON CONFLICT(monitor_id) DO UPDATE SET cutover_at=excluded.cutover_at').bind(id,at)])
 return historyCutover(env,id)
}
