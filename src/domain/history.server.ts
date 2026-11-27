import {openSnapshot} from './failure-page-custody.server.ts'
import {snapshotMembers} from './failure-snapshot-sets.ts'
import type {Bindings} from './control.server.ts'
import {withQuietSlots} from './quiet-checks.ts'

// Packed Worker slots already carry their own attempts and assignments. Only
// signed, manual and pre-upgrade slots need lookups in the native tables.
// A quiet check has no slot row and reads as one (quiet-checks.ts).
export async function history(env:Bindings,id:string){
 const [rows,snapshotRows]=await env.DB.batch<any>([env.DB.prepare(`WITH recent AS (
  SELECT rowid AS history_order,* FROM slots WHERE monitor_id=?
  ORDER BY due_at DESC,rowid DESC LIMIT 100
 ) SELECT recent.*,
  CASE WHEN recent.hosted IS NULL THEN (SELECT json_group_array(json(evidence)) FROM (
   SELECT evidence FROM observations WHERE slot_id=recent.id ORDER BY probe,attempt
  )) END AS observations,
  CASE WHEN recent.hosted IS NULL THEN (SELECT json_group_object(probe,external_check_url)
   FROM runner_assignments WHERE slot_id=recent.id AND external_check_url IS NOT NULL) END AS external_checks
 FROM recent ORDER BY due_at DESC,history_order DESC`).bind(id),
 env.DB.prepare("SELECT observation_id,monitor_id,captured_at,expires_at,json_remove(snapshot,'$.screenshot','$.artifacts') AS snapshot FROM failure_snapshots WHERE monitor_id=? AND expires_at>? AND slot_id IN(SELECT id FROM slots WHERE monitor_id=? ORDER BY due_at DESC,rowid DESC LIMIT 100)").bind(id,Date.now(),id)]);
 // History shows a snapshot's text, never its screenshot or flow artifacts, whichever row stores it.
 const snapshots=snapshotRows.results.flatMap(row=>{
  const members=snapshotMembers(row);
  return members[0]===row?members:members.map(member=>{const {screenshot,artifacts,...text}=JSON.parse(member.snapshot);return {...member,snapshot:JSON.stringify(text)}});
 });
 // externalChecks: the external check URL each delivered probe was handed, which for a monitor following Settings can differ
 // from the copy in the slot's definition. A slot whose parts were handed none (or delivered before URLs were recorded) has none.
 const recent=await withQuietSlots<any>(env.DB,id,rows.results,100);
 const selected=recent.map(({history_order,external_checks,hosted,observations,...row}:any)=>{
  const packed=hosted===null?null:JSON.parse(hosted);
  const handed=packed?Object.fromEntries(Object.entries(packed.assignments).flatMap(([probe,assignment]:[string,any])=>
   assignment.canaryUrl==null?[]:[[probe,assignment.canaryUrl]])):JSON.parse(external_checks);
  const attempts=packed?(packed.attempts??[]).sort((a:any,b:any)=>a.probe===b.probe?a.attempt-b.attempt:a.probe<b.probe?-1:1):JSON.parse(observations);
  return {...row,definition:JSON.parse(row.definition),observations:attempts,...(packed?.cronNextDueAt!=null?{cronNextDueAt:packed.cronNextDueAt}:{}),...(Object.keys(handed).length?{externalChecks:handed}:{})};
 });
 const wanted=new Set(selected.flatMap(row=>row.observations.map((o:any)=>o.id)));const byId=new Map(await Promise.all(snapshots.filter(row=>wanted.has(row.observation_id)).map(async row=>[row.observation_id,await openSnapshot(env,row)] as const)));
 return selected.map(row=>({...row,observations:row.observations.map((o:any)=>byId.has(o.id)?{...o,failureSnapshot:byId.get(o.id)}:o)}))
}
