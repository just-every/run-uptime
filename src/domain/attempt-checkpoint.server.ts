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
const evidenceClock=`SELECT g.generation,m.hosted_generation AS hostedGeneration FROM evidence_generation g
 JOIN monitors m ON m.id=g.monitor_id WHERE g.monitor_id=?`;
type EvidenceClock={generation:number;hostedGeneration:number};
const sameClock=(a:EvidenceClock,b:EvidenceClock|undefined)=>a.generation===b?.generation&&a.hostedGeneration===b.hostedGeneration;
const tail=`WITH t AS (
 SELECT id,due_at,manual,lease_until,monitor_id,hosted,status FROM slots INDEXED BY slots_projection
 WHERE monitor_id=?1 AND revision=?2 AND manual=0 AND hosted IS NULL AND due_at>=?3 AND (due_at,id)>(?3,?4)
 UNION ALL
 SELECT id,due_at,manual,lease_until,monitor_id,hosted,status FROM slots INDEXED BY slots_monitor
 WHERE monitor_id=?1 AND revision=?2 AND manual=0 AND hosted IS NOT NULL AND (due_at,id)>(?3,?4)
   AND due_at>=MAX(?3,COALESCE((SELECT created_at FROM revisions WHERE monitor_id=?1 AND revision=?2),0))
   AND due_at<=COALESCE((SELECT MIN(created_at) FROM revisions WHERE monitor_id=?1 AND revision>?2),9223372036854775807)
 ORDER BY due_at,id LIMIT ${PAGE}
 ) SELECT t.id,t.due_at,t.manual,t.lease_until,(t.hosted IS NOT NULL AND t.status='complete') AS sealed,
 CASE WHEN t.hosted IS NOT NULL THEN (
   SELECT json_group_array(json_object('probe',a.key,'delivered_at',json_extract(t.hosted,'$.deliveredAt'),
    'received_times',COALESCE(json_extract(t.hosted,'$.receivedTimes."'||a.key||'"'),'{}')||''))
   FROM json_each(t.hosted,'$.assignments') a
 ) ELSE (
   SELECT json_group_array(json_object('probe',a.probe,'delivered_at',a.delivered_at,'received_times',a.received_times,
    'advanced_at',CASE WHEN a.delivered_at IS NULL THEN (
     SELECT MIN(CASE WHEN n.hosted IS NOT NULL THEN
       CASE WHEN json_extract(n.hosted,'$.runnerId')=a.runner_id THEN json_extract(n.hosted,'$.deliveredAt') END
      ELSE (SELECT MIN(na.delivered_at) FROM runner_assignments na WHERE na.slot_id=n.id AND na.runner_id=a.runner_id) END)
     FROM slots n INDEXED BY slots_monitor WHERE n.monitor_id=t.monitor_id AND n.manual=0 AND n.due_at>t.due_at
      AND n.due_at<t.lease_until+${CONTACT_FRESHNESS_MS}
    ) END))
   FROM runner_assignments a WHERE a.slot_id=t.id
 ) END assignments,
 CASE WHEN t.hosted IS NOT NULL THEN (
   SELECT json_group_array(json_object('id',json_extract(o.value,'$.id'),'slot_id',t.id,
    'probe',json_extract(o.value,'$.probe'),'attempt',json_extract(o.value,'$.attempt'),'evidence',o.value||''))
   FROM json_each(t.hosted,'$.attempts') o
 ) ELSE (
   SELECT json_group_array(json_object('id',o.id,'slot_id',t.id,'probe',o.probe,'attempt',o.attempt,'evidence',o.evidence))
   FROM observations o WHERE o.slot_id=t.id
 ) END observations
 FROM t ORDER BY t.due_at,t.id`;
const received=`SELECT o.*,json_extract(a.received_times,'$."'||o.attempt||'"') received_at
 FROM observations o LEFT JOIN runner_assignments a ON a.slot_id=o.slot_id AND a.probe=o.probe WHERE o.slot_id=?1
 UNION ALL
 SELECT json_extract(o.value,'$.id'),s.id,json_extract(o.value,'$.probe'),json_extract(o.value,'$.attempt'),o.value,
  json_extract(s.hosted,'$.receivedTimes."'||json_extract(o.value,'$.probe')||'"."'||json_extract(o.value,'$.attempt')||'"')
 FROM slots s CROSS JOIN json_each(s.hosted,'$.attempts') o WHERE s.id=?1`;
type Update={dueAt:number;slotId:string;checkpoint:ProjectionCheckpoint};
export function checkpointStatement(env:Bindings,monitorId:string,revision:number,update:Update,guard?:{generation:number;token:string}){
 return env.DB.prepare(`INSERT INTO attempt_checkpoints(monitor_id,revision,due_at,slot_id,state,last_observations)
  SELECT ?,?,?,?,?,? WHERE ${guard?'EXISTS(SELECT 1 FROM evidence_generation WHERE monitor_id=? AND generation=? AND projection_id=?)':'1'}
  ON CONFLICT(monitor_id,revision) DO UPDATE SET due_at=excluded.due_at,slot_id=excluded.slot_id,state=excluded.state,last_observations=excluded.last_observations`)
  .bind(monitorId,revision,update.dueAt,update.slotId,JSON.stringify(update.checkpoint.state),JSON.stringify(update.checkpoint.last),...(guard?[monitorId,guard.generation,guard.token]:[]))
}
export async function attemptSnapshot(env:Bindings,monitorId:string,revision:number,definition:any,now:number,extraSlot?:string,readOnly=false,guardedHosted=false){
 restart:for(;;){
  const clock=await env.DB.prepare(`SELECT g.generation,m.hosted_generation AS hostedGeneration,
    native.due_at,native.slot_id,native.state,native.last_observations,
    CASE WHEN json_extract(m.hosted_checkpoint,'$.revision')=?2 THEN m.hosted_checkpoint END AS hosted_checkpoint
    FROM evidence_generation g JOIN monitors m ON m.id=g.monitor_id
    LEFT JOIN attempt_checkpoints native ON native.monitor_id=g.monitor_id AND native.revision=?2
    WHERE g.monitor_id=?1`).bind(monitorId,revision).first<EvidenceClock&{
      due_at:number|null;slot_id:string|null;state:string|null;last_observations:string|null;hosted_checkpoint:string|null;
    }>();
  if(!clock)throw Error('Monitor absent');
  const {generation,hostedGeneration}=clock;
  const native=clock.due_at===null?undefined:{
   dueAt:clock.due_at,slotId:clock.slot_id!,checkpoint:{state:JSON.parse(clock.state!),last:JSON.parse(clock.last_observations!)}
  };
  const packed=clock.hosted_checkpoint===null?undefined:JSON.parse(clock.hosted_checkpoint) as Update;
  const row=packed&&(!native||packed.dueAt>native.dueAt||packed.dueAt===native.dueAt&&packed.slotId>native.slotId)?packed:native;
  let checkpoint:ProjectionCheckpoint=row?.checkpoint??{state:{},last:[]};
  let dueAt=row?.dueAt??-1,slotId=row?.slotId??'',checkpointUpdate:Update|undefined;
  for(;;){
   const [pageResult,...checks]=await env.DB.batch([
    env.DB.prepare(tail).bind(monitorId,revision,dueAt,slotId),
    ...(!guardedHosted?[env.DB.prepare(evidenceClock).bind(monitorId)]:[]),
    ...(extraSlot?[env.DB.prepare(received).bind(extraSlot)]:[]),
   ]);
   // The hosted commit rechecks both clocks inside its slot UPDATE. Reads
   // and signed submissions still verify the snapshot before returning it.
   if(!guardedHosted&&!sameClock(clock,checks[0].results[0] as EvidenceClock|undefined))continue restart;
   const page=pageResult.results as any[];
   const observations=page.flatMap(slot=>{
    const receipts=new Map<string,Record<string,number>>(JSON.parse(slot.assignments).map((a:any)=>[a.probe,JSON.parse(a.received_times)]));
    return JSON.parse(slot.observations).map((o:any)=>({...o,received_at:receipts.get(o.probe)?.[o.attempt]??null}));
   });
   const slots=classifyAttempts(definition,page,observations,now);
   // Signed complete slots can still accept late attempts. Hosted terminal
   // rows have already received the Worker's entire batch and are sealed.
   // Freeze only a contiguous prefix whose acceptance authority and skip
   // classification have both settled. Fresh contact is never target evidence.
   const boundary=slots.findIndex(s=>s.lease_until>now&&!s.sealed||s.pending);
   const expired=boundary<0?slots:slots.slice(0,boundary);
   if(expired.length){
    const end=expired[expired.length-1];
    checkpoint=foldAttempts(definition,expired,observations,checkpoint);dueAt=end.due_at;slotId=end.id;
    checkpointUpdate={dueAt,slotId,checkpoint};
    // Only an owner read can publish a checkpoint here. Submission includes
    // its checkpoint in the guarded acceptance transaction.
    if(!extraSlot&&!readOnly&&(!hostedGeneration||page.length===PAGE)){
     const token=crypto.randomUUID();
     await env.DB.batch([
      env.DB.prepare(`UPDATE evidence_generation SET generation=generation+1,projection_id=?
       WHERE monitor_id=? AND generation=? AND EXISTS(SELECT 1 FROM monitors WHERE id=monitor_id AND hosted_generation=?)`)
       .bind(token,monitorId,generation,hostedGeneration),
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
   return {generation,hostedGeneration,checkpoint,checkpointUpdate,slots:remaining,observations:[...retained,...(extraSlot?checks.at(-1)!.results as any[]:[])]}
  }
 }
}
