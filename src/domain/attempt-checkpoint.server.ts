import type {Bindings} from './control.server.ts'
import {foldAttempts,type ProjectionCheckpoint} from './attempt-projection.ts'

// An upgraded installation catches up once in bounded pages. Thereafter only
// expired windows since the checkpoint and still-mutable windows are read.
const PAGE=512;
// `skipped`: a vantage's part of the slot was never delivered because its runner, behind, took a newer scheduled slot of the
// monitor instead (the newest-slot rule in attempts.server.ts). A runner that took nothing newer leaves its part as missing evidence.
const tail=`SELECT t.id,t.due_at,t.manual,t.lease_until,EXISTS(SELECT 1 FROM runner_assignments a JOIN slots n ON n.monitor_id=t.monitor_id
 AND n.manual=0 AND n.due_at>t.due_at JOIN runner_assignments na ON na.slot_id=n.id AND na.runner_id=a.runner_id AND na.delivered_at IS NOT NULL
 WHERE a.slot_id=t.id AND a.delivered_at IS NULL) skipped FROM slots t
 WHERE t.monitor_id=? AND t.revision=? AND t.manual=0 AND (t.due_at,t.id)>(?,?)
 ORDER BY t.due_at,t.id LIMIT ${PAGE}`;
type Update={dueAt:number;slotId:string;checkpoint:ProjectionCheckpoint};
export function checkpointStatement(env:Bindings,monitorId:string,revision:number,update:Update,generation:number,token:string){
 return env.DB.prepare(`INSERT INTO attempt_checkpoints(monitor_id,revision,due_at,slot_id,state,last_observations)
  SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM evidence_generation WHERE monitor_id=? AND generation=? AND projection_id=?)
  ON CONFLICT(monitor_id,revision) DO UPDATE SET due_at=excluded.due_at,slot_id=excluded.slot_id,state=excluded.state,last_observations=excluded.last_observations`)
  .bind(monitorId,revision,update.dueAt,update.slotId,JSON.stringify(update.checkpoint.state),JSON.stringify(update.checkpoint.last),monitorId,generation,token)
}
export async function attemptSnapshot(env:Bindings,monitorId:string,revision:number,definition:any,now:number,extraSlot?:string){
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
    env.DB.prepare(`SELECT o.* FROM observations o JOIN (${tail}) s ON s.id=o.slot_id`).bind(monitorId,revision,dueAt,slotId),
    ...(extraSlot?[env.DB.prepare('SELECT * FROM observations WHERE slot_id=?').bind(extraSlot)]:[])
   ]);
   if((snapshot[0].results[0] as any)?.generation!==generation)continue restart;
   const slots=snapshot[1].results as any[],observations=snapshot[2].results as any[];
   // Complete slots still accept late attempts (including failed canaries).
   // Freeze only a contiguous prefix whose acceptance authority has expired.
   const boundary=slots.findIndex(s=>s.lease_until>now);
   const expired=boundary<0?slots:slots.slice(0,boundary);
   if(!expired.length){
    if(slots.length===PAGE)throw Error('Mutable scheduled window exceeds projection page');
    const extra=(snapshot[3]?.results??[]) as any[];
    return {generation,checkpoint,checkpointUpdate,slots,observations:extraSlot?[...observations.filter(o=>o.slot_id!==extraSlot),...extra]:observations}
   }
   const end=expired[expired.length-1];checkpoint=foldAttempts(definition,expired,observations,checkpoint);dueAt=end.due_at;slotId=end.id;
   checkpointUpdate={dueAt,slotId,checkpoint};
   // Submission catch-up is read-only. Its checkpoint is committed by the
   // result transaction's runner/acceptance guard, so refused results write
   // neither derived state nor generation. Owner reads can checkpoint now.
   if(extraSlot)continue;
   const token=crypto.randomUUID();
   await env.DB.batch([
    env.DB.prepare('UPDATE evidence_generation SET generation=generation+1,projection_id=? WHERE monitor_id=? AND generation=?').bind(token,monitorId,generation),
    checkpointStatement(env,monitorId,revision,checkpointUpdate,generation+1,token)
   ]);
   continue restart;
  }
 }
}
