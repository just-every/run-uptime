import type {Bindings} from './control.server.ts'

// Bound the slot set first. The existing slot/observation indexes serve the
// ordered join inside D1, replacing one remote request per history slot.
export async function history(env:Bindings,id:string){
 const rows=await env.DB.prepare(`WITH recent AS (
  SELECT rowid AS history_order,* FROM slots WHERE monitor_id=?
  ORDER BY due_at DESC,rowid DESC LIMIT 100
 ) SELECT recent.*,
  (SELECT json_group_array(json(evidence)) FROM (
   SELECT evidence FROM observations WHERE slot_id=recent.id ORDER BY probe,attempt
  )) AS observations
 FROM recent ORDER BY due_at DESC,history_order DESC`).bind(id).all<any>()
 return rows.results.map(({history_order,...row})=>({...row,definition:JSON.parse(row.definition),observations:JSON.parse(row.observations)}))
}
