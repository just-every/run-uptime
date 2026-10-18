import type {Bindings} from './control.server.ts'

// Bound the slot set first. The existing slot/observation indexes serve the
// ordered join inside D1, replacing one remote request per history slot.
export async function history(env:Bindings,id:string){
 const rows=await env.DB.prepare(`WITH recent AS (
  SELECT rowid AS history_order,* FROM slots WHERE monitor_id=?
  ORDER BY due_at DESC,rowid DESC LIMIT 100
 ) SELECT recent.*,
  (SELECT json_group_array(json(evidence)) FROM (
   SELECT CASE WHEN f.snapshot IS NULL THEN evidence ELSE json_set(evidence,'$.failureSnapshot',json(f.snapshot)) END AS evidence FROM observations o LEFT JOIN failure_snapshots f ON f.observation_id=o.id AND f.expires_at>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) WHERE o.slot_id=recent.id ORDER BY o.probe,o.attempt
  )) AS observations
 FROM recent ORDER BY due_at DESC,history_order DESC`).bind(id).all<any>()
 return rows.results.map(({history_order,...row})=>({...row,definition:JSON.parse(row.definition),observations:JSON.parse(row.observations)}))
}
