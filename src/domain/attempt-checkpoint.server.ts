import type {Bindings} from './control.server.ts'
import {foldAttempts,type ProjectionCheckpoint} from './attempt-projection.ts'
import {classifyAttempts} from './attempt-classification.ts'
import {CONTACT_FRESHNESS_MS} from './runner-contact.server.ts'

// An upgraded installation catches up once in bounded pages. Thereafter only
// expired windows since the checkpoint and still-mutable windows are read.
const PAGE=512;
// Read assignment progress alongside immutable slots, without manufacturing
// observations or changing their acceptance deadlines.
// A scheduled delivery cannot precede its due time, so the lookup is bounded
// by the same fixed classification window even during historical catch-up.
const tail=`SELECT t.id,t.due_at,t.manual,t.lease_until,
 (SELECT json_group_array(json_object('probe',a.probe,'delivered_at',a.delivered_at,'received_times',a.received_times,
 'advanced_at',CASE WHEN a.delivered_at IS NULL THEN (SELECT MIN(na.delivered_at) FROM slots n JOIN runner_assignments na ON na.slot_id=n.id
 WHERE n.monitor_id=t.monitor_id AND n.manual=0 AND n.due_at>t.due_at
 AND n.due_at<t.lease_until+${CONTACT_FRESHNESS_MS}
 AND na.runner_id=a.runner_id AND na.delivered_at IS NOT NULL) END))
 FROM runner_assignments a WHERE a.slot_id=t.id) assignments,
 (SELECT json_group_array(json_object('id',o.id,'slot_id',t.id,'probe',o.probe,'attempt',o.attempt,'evidence',o.evidence))
 FROM observations o WHERE o.slot_id=t.id) observations
 FROM slots t WHERE t.monitor_id=? AND t.revision=? AND t.manual=0 AND (t.due_at,t.id)>(?,?)
 ORDER BY t.due_at,t.id LIMIT ${PAGE}`;
const received=`SELECT o.*,json_extract(a.received_times,'$."'||o.attempt||'"') received_at
 FROM observations o LEFT JOIN runner_assignments a ON a.slot_id=o.slot_id AND a.probe=o.probe`;
type Update={dueAt:number;slotId:string;checkpoint:ProjectionCheckpoint};
export function checkpointStatement(env:Bindings,monitorId:string,revision:number,update:Update,guard?:{generation:number;token:string}){
 return env.DB.prepare(`INSERT INTO attempt_checkpoints(monitor_id,revision,due_at,slot_id,state,last_observations)
  SELECT ?,?,?,?,?,? WHERE ${guard?'EXISTS(SELECT 1 FROM evidence_generation WHERE monitor_id=? AND generation=? AND projection_id=?)':'1'}
  ON CONFLICT(monitor_id,revision) DO UPDATE SET due_at=excluded.due_at,slot_id=excluded.slot_id,state=excluded.state,last_observations=excluded.last_observations`)
  .bind(monitorId,revision,update.dueAt,update.slotId,JSON.stringify(update.checkpoint.state),JSON.stringify(update.checkpoint.last),...(guard?[monitorId,guard.generation,guard.token]:[]))
}
export async function attemptSnapshot(env:Bindings,monitorId:string,revision:number,definition:any,now:number,extraSlot?:string,readOnly=false){
 restart:for(;;){
  const initial=await env.DB.batch([
   env.DB.prepare('SELECT generation FROM evidence_generation WHERE monitor_id=?').bind(monitorId),
   env.DB.prepare('SELECT * FROM attempt_checkpoints WHERE monitor_id=? AND revision=?').bind(monitorId,revision)
  ]);
  const generation=(initial[0].results[0] as any)?.generation;
  if(generation===undefined)throw Error('Monitor absent');
  const row=initial[1].results[0] as any;
  let checkpoint:ProjectionCheckpoint=row?{state:JSON.parse(row.state),last:JSON.parse(row.last_observations)}:{state:{},last:[]};
  let dueAt=row?.due_at??-1,slotId=row?.slot_id??'',checkpointUpdate:Update|undefined;
  for(;;){
   const snapshot=await env.DB.batch([
    env.DB.prepare('SELECT generation FROM evidence_generation WHERE monitor_id=?').bind(monitorId),
    env.DB.prepare(tail).bind(monitorId,revision,dueAt,slotId),
    ...(extraSlot?[env.DB.prepare(`${received} WHERE o.slot_id=?`).bind(extraSlot)]:[])
   ]);
   if((snapshot[0].results[0] as any)?.generation!==generation)continue restart;
   const page=snapshot[1].results as any[];
   const observations=page.flatMap(slot=>{
    const receipts=new Map<string,Record<string,number>>(JSON.parse(slot.assignments).map((a:any)=>[a.probe,JSON.parse(a.received_times)]));
    return JSON.parse(slot.observations).map((o:any)=>({...o,received_at:receipts.get(o.probe)?.[o.attempt]??null}));
   });
   const slots=classifyAttempts(definition,page,observations,now);
   // Complete slots still accept late attempts (including failed canaries).
   // Freeze only a contiguous prefix whose acceptance authority and skip
   // classification have both settled. Fresh contact is never target evidence.
   const boundary=slots.findIndex(s=>s.lease_until>now||s.pending);
   const expired=boundary<0?slots:slots.slice(0,boundary);
   if(expired.length){
    const end=expired[expired.length-1];
    checkpoint=foldAttempts(definition,expired,observations,checkpoint);dueAt=end.due_at;slotId=end.id;
    checkpointUpdate={dueAt,slotId,checkpoint};
    // Only an owner read can publish a checkpoint here. Submission includes
    // its checkpoint in the guarded acceptance transaction.
    if(!extraSlot&&!readOnly){
     const token=crypto.randomUUID();
     await env.DB.batch([
      env.DB.prepare('UPDATE evidence_generation SET generation=generation+1,projection_id=? WHERE monitor_id=? AND generation=?').bind(token,monitorId,generation),
      checkpointStatement(env,monitorId,revision,checkpointUpdate,{generation:generation+1,token})
     ]);
     continue restart;
    }
   }
   if(page.length===PAGE){
    if(!expired.length)throw Error('Mutable scheduled window exceeds projection page');
    continue;
   }
   const remaining=slots.slice(expired.length),ids=new Set(remaining.map(s=>s.id));
   const retained=observations.filter(o=>ids.has(o.slot_id)&&o.slot_id!==extraSlot);
   return {generation,checkpoint,checkpointUpdate,slots:remaining,observations:[...retained,...(snapshot[2]?.results??[]) as any[]]}
  }
 }
}
