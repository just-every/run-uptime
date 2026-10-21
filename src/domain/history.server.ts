import {openSnapshot} from './failure-page-custody.server.ts'
import type {Bindings} from './control.server.ts'

// Bound the slot set first. The existing slot/observation indexes serve the
// ordered join inside D1, replacing one remote request per history slot.
export async function history(env:Bindings,id:string){
 const rows=await env.DB.prepare(`WITH recent AS (
  SELECT rowid AS history_order,* FROM slots WHERE monitor_id=?
  ORDER BY due_at DESC,rowid DESC LIMIT 100
 ) SELECT recent.*,
  (SELECT json_group_array(json(evidence)) FROM (
   SELECT evidence FROM observations o WHERE o.slot_id=recent.id ORDER BY o.probe,o.attempt
  )) AS observations,
  (SELECT json_group_object(probe,external_check_url) FROM runner_assignments a WHERE a.slot_id=recent.id AND a.external_check_url IS NOT NULL) AS external_checks
 FROM recent ORDER BY due_at DESC,history_order DESC`).bind(id).all<any>()
 const snapshots=(await env.DB.prepare("SELECT observation_id,monitor_id,captured_at,json_remove(snapshot,'$.screenshot','$.artifacts') AS snapshot FROM failure_snapshots WHERE monitor_id=? AND expires_at>? AND slot_id IN(SELECT id FROM slots WHERE monitor_id=? ORDER BY due_at DESC,rowid DESC LIMIT 100)").bind(id,Date.now(),id).all<any>()).results;
 // externalChecks: the external check URL each delivered probe was handed, which for a monitor following Settings can differ
 // from the copy in the slot's definition. A slot whose parts were handed none (or delivered before URLs were recorded) has none.
 const selected=rows.results.map(({history_order,external_checks,...row})=>{const handed=JSON.parse(external_checks);return {...row,definition:JSON.parse(row.definition),observations:JSON.parse(row.observations),...(Object.keys(handed).length?{externalChecks:handed}:{})}});
 const wanted=new Set(selected.flatMap(row=>row.observations.map((o:any)=>o.id)));const byId=new Map(await Promise.all(snapshots.filter(row=>wanted.has(row.observation_id)).map(async row=>[row.observation_id,await openSnapshot(env,row)] as const)));
 return selected.map(row=>({...row,observations:row.observations.map((o:any)=>byId.has(o.id)?{...o,failureSnapshot:byId.get(o.id)}:o)}))
}
