import assert from 'node:assert/strict';
import {mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {availabilityOverview} from '../src/domain/availability.server.ts';
import {startLocalWorker} from '../scripts/local-worker.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {migrate} from './probe-native-support.mjs';

const root=resolve(fileURLToPath(new URL('../',import.meta.url))),scratch=resolve(root,'..','scratch/tmp'),persist=join(scratch,`availability-${process.pid}-${Date.now()}`);
const port=15519,day=86400000,week=7*day;
await mkdir(scratch,{recursive:true});
let worker;
try{
 await migrate(persist);
 worker=await startLocalWorker({root,persist,port,assets:false,bindings:testAuthBindings});
 const db=await worker.getD1Database('DB'),now=Date.now(),definitions=new Map();
 const makeDefinition=({intervalMs=60000,freshnessMs=120000,probes=['local-a'],type='http',heartbeat,retries=2}={})=>({name:'Availability fixture',type,network:'synthetic',url:'http://127.0.0.1:15516/health',intervalMs,freshnessMs,timeoutMs:2000,retries,failureQuorum:probes.length,confirmSlots:2,recoverSlots:2,probes,assertions:{status:200},enabled:true,maintenanceUntil:0,...(heartbeat?{heartbeat}:{})});
 async function addMonitor(key,definition,revision=1){
  const id=`availability-${key}-${now}`,body=JSON.stringify(definition);
  await db.prepare('INSERT INTO monitors(id,revision,definition,next_due,state) VALUES(?,?,?,?,?)').bind(id,revision,body,now+definition.intervalMs,JSON.stringify({state:'Unknown'})).run();
  await db.prepare('INSERT INTO revisions(monitor_id,revision,definition,created_at) VALUES(?,?,?,?)').bind(id,revision,body,now-2*week).run();
  definitions.set(id,{id,revision,definition});return id;
 }
 async function addSlot(monitorId,revision,definition,{id,dueAt,status='complete',manual=0,missedCount=0,observations=[]}){
  const slotId=id??`${monitorId}:${revision}:${dueAt}:${manual}`;
  await db.prepare(`INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual)
    VALUES(?,?,?,?,?,?,'fixture',0,?,?)`).bind(slotId,monitorId,revision,dueAt,status,JSON.stringify(definition),missedCount,manual).run();
  for(const observation of observations)await db.prepare('INSERT INTO observations(id,slot_id,probe,attempt,evidence) VALUES(?,?,?,?,?)')
    .bind(observation.id,slotId,observation.probe,observation.attempt,JSON.stringify(observation)).run();
  return slotId;
 }
 function observation(slotId,probe,attempt,dueAt,outcome='pass',changes={}){
  const startedAt=dueAt,completedAt=dueAt+100,durationMs=100;
  return {id:`${slotId}:${probe}:${attempt}`,probe,attempt,outcome,startedAt,completedAt,durationMs,runnerVersion:'uptime-node/0.1.0',status:200,bytes:2,checks:[{assertion:'status',pass:outcome==='pass',reason:'Fixture result'}],...changes};
 }
 const emptyId=await addMonitor('empty',makeDefinition());
 const partialDefinition=makeDefinition({probes:['local-a','local-b']});
 const partialId=await addMonitor('partial',partialDefinition),partialDue=now-5000,partialSlot=`${partialId}:1:${partialDue}`;
 await addSlot(partialId,1,partialDefinition,{id:partialSlot,dueAt:partialDue,observations:[
  observation(partialSlot,'local-a',0,partialDue),
 ]});
 const runnerErrorDefinition=makeDefinition({retries:0});
 const runnerErrorId=await addMonitor('runner-error',runnerErrorDefinition),runnerErrorDue=now-5000,runnerErrorSlot=`${runnerErrorId}:1:${runnerErrorDue}`;
 await addSlot(runnerErrorId,1,runnerErrorDefinition,{id:runnerErrorSlot,dueAt:runnerErrorDue,observations:[
  observation(runnerErrorSlot,'local-a',0,runnerErrorDue,'runner_error'),
 ]});
 const gappedDefinition=makeDefinition({intervalMs:60000,freshnessMs:120000,probes:['local-a','local-b'],retries:1});
 const gappedId=await addMonitor('gapped',gappedDefinition);
 const firstDue=now-130000,secondDue=now-60000;
 const firstSlot=`${gappedId}:1:${firstDue}`,secondSlot=`${gappedId}:1:${secondDue}`;
 await addSlot(gappedId,1,gappedDefinition,{id:firstSlot,dueAt:firstDue,observations:[
  observation(firstSlot,'local-a',0,firstDue),observation(firstSlot,'local-b',0,firstDue),
 ]});
 await addSlot(gappedId,1,gappedDefinition,{id:secondSlot,dueAt:secondDue,missedCount:1,observations:[
  observation(secondSlot,'local-a',0,secondDue),observation(secondSlot,'local-b',0,secondDue),
 ]});

 const steadyDefinition=makeDefinition({intervalMs:60000,freshnessMs:120000});
 const steadyId=await addMonitor('steady',steadyDefinition),steadyFirstDue=now-600000;
 for(let due=steadyFirstDue;due<now;due+=60000){const slot=`${steadyId}:1:${due}`;await addSlot(steadyId,1,steadyDefinition,{id:slot,dueAt:due,observations:[observation(slot,'local-a',0,due)]})}

 const retryDefinition=makeDefinition({intervalMs:10000,freshnessMs:60000,retries:1});
 const retryId=await addMonitor('retry',retryDefinition),retryDue=now-6000,retrySlot=`${retryId}:1:${retryDue}`;
 await addSlot(retryId,1,retryDefinition,{id:retrySlot,dueAt:retryDue,observations:[
  observation(retrySlot,'local-a',0,retryDue,'target_failure'),
  observation(retrySlot,'local-a',1,retryDue,'pass',{startedAt:retryDue+110,completedAt:retryDue+120,durationMs:10}),
 ]});
 const manualSlot=`${retryId}:1:manual`;
 await addSlot(retryId,1,retryDefinition,{id:manualSlot,dueAt:now-1000,manual:1,observations:[observation(manualSlot,'local-a',0,now-1000)]});

 const slowDefinition=makeDefinition({intervalMs:day,freshnessMs:5000});
 const slowId=await addMonitor('freshness',slowDefinition),slowDue=now-60000,slowSlot=`${slowId}:1:${slowDue}`;
 await addSlot(slowId,1,slowDefinition,{id:slowSlot,dueAt:slowDue,observations:[observation(slowSlot,'local-a',0,slowDue)]});

 const heartbeatDefinition=makeDefinition({intervalMs:day,freshnessMs:day,type:'heartbeat',heartbeat:{maxAgeMs:5000}});
 const heartbeatId=await addMonitor('heartbeat',heartbeatDefinition),heartbeatDue=now-10000,heartbeatSlot=`${heartbeatId}:1:${heartbeatDue}`;
 await addSlot(heartbeatId,1,heartbeatDefinition,{id:heartbeatSlot,dueAt:heartbeatDue,observations:[
  observation(heartbeatSlot,'local-a',0,heartbeatDue,'pass',{heartbeatReceivedAt:heartbeatDue}),
 ]});

 const revisionDefinition=makeDefinition();
 const revisionId=await addMonitor('revision',makeDefinition({probes:['local-b']}),2);
 await db.prepare('UPDATE revisions SET created_at=? WHERE monitor_id=? AND revision=2').bind(now-500,revisionId).run();
 const priorSlot=`${revisionId}:1:${now-1000}`;
 await db.prepare('INSERT INTO revisions(monitor_id,revision,definition,created_at) VALUES(?,?,?,?)')
  .bind(revisionId,1,JSON.stringify(revisionDefinition),now-3*week).run();
 await addSlot(revisionId,1,revisionDefinition,{id:priorSlot,dueAt:now-1000,observations:[observation(priorSlot,'local-a',0,now-1000)]});

 const futureId=await addMonitor('future',makeDefinition());
 const futureDue=now-2000,futureSlot=`${futureId}:1:${futureDue}`;
 await addSlot(futureId,1,definitions.get(futureId).definition,{id:futureSlot,dueAt:futureDue,observations:[
  observation(futureSlot,'local-a',0,futureDue,'pass',{startedAt:futureDue,completedAt:now+1,durationMs:now+1-futureDue}),
 ]});

 const monitors=[...definitions.values()];
 const report=await availabilityOverview(db,monitors,now);
 assert.equal(report.get(emptyId).last24h.uptimePercent,null,'empty monitor has no observed uptime denominator');
 assert.equal(report.get(emptyId).last24h.unknownPercent,100,'empty monitor is wholly Unknown');
 assert.equal(report.get(emptyId).last24h.unknownMs,day);
 assert.equal(report.get(emptyId).last7d.unknownMs,week);

 const partial=report.get(partialId);
 assert.equal(partial.last24h.uptimePercent,null,'a completed slot missing a selected check has no known uptime denominator');
 assert.equal(partial.last24h.unknownPercent,100,'a missing selected check leaves the full window Unknown');
 assert.equal(partial.last24h.notPassingMs,0,'missing evidence is not counted as target downtime');
 assert.equal(partial.responseDurationMs,null,'a partial check cannot produce a response duration');
 const runnerError=report.get(runnerErrorId);
 assert.equal(runnerError.last24h.uptimePercent,null,'runner failure has no target-result denominator');
 assert.equal(runnerError.last24h.unknownPercent,100,'runner failure remains Unknown, not healthy or target downtime');
 assert.equal(runnerError.last24h.notPassingMs,0);

 const gapped=report.get(gappedId),expectedKnown=60000+(60000-100);
 assert.equal(gapped.last24h.upMs,expectedKnown,'each complete scheduled slot covers at most one interval after both probes finish, ending at now');
 assert.equal(gapped.last24h.unknownMs,day-expectedKnown,'time between scheduled results remains Unknown');
 assert.equal(gapped.last24h.uptimePercent,100);
 assert.equal(gapped.last24h.unknownPercent,99.86,'percentage precision keeps small but real coverage visible');
 assert.equal(gapped.responseDurationMs,100,'response duration uses the slowest final selected probe in the latest scheduled slot');
 assert.equal(gapped.lastCheckAt,secondDue+100);

 const steady=report.get(steadyId),steadySpan=now-(steadyFirstDue+100);
 assert.equal(steady.last24h.upMs,steadySpan,'healthy checks exactly one interval apart leave no Unknown time after the first result');
 assert.equal(steady.last24h.unknownMs,day-steadySpan,'only time before the first result remains Unknown in the full window');

 const retry=report.get(retryId);
 assert.equal(retry.last24h.upMs,0,'a successful retry does not erase the failed attempt');
 assert.equal(retry.last24h.notPassingMs,now-(retryDue+120),'one scheduled failed interval counts once, not once per attempt');
 assert.equal(retry.last24h.uptimePercent,0);
 assert.equal(retry.lastCheckAt,retryDue+120,'a newer manual pass cannot replace scheduled last-check evidence');

 const freshness=report.get(slowId);
 assert.equal(freshness.last24h.upMs,5000,'long cadence cannot project a passing result beyond its freshness expiry');
 assert.equal(freshness.last24h.unknownPercent,99.99,'two-decimal share keeps a short real result visible inside a long no-result interval');

 const heartbeat=report.get(heartbeatId);
 assert.equal(heartbeat.last24h.upMs,4900,'heartbeat pass coverage ends when the frozen receipt expires');
 assert.equal(heartbeat.last24h.unknownMs,day-4900);

 const revised=report.get(revisionId);
 assert.equal(revised.last24h.upMs,400,'historical coverage uses its own selected probes and ends at the next revision');
 assert.equal(revised.last24h.unknownMs,day-400);
 assert.equal(revised.lastCheckAt,now-900,'last completed check survives revision changes');

 const future=report.get(futureId);
 assert.equal(future.last24h.uptimePercent,null,'future completion time remains Unknown');
 assert.equal(future.last24h.unknownPercent,100);
 assert.equal(future.lastCheckAt,null,'future completion is not shown as a last check');
 assert.equal(future.responseDurationMs,null);
 console.log('AVAILABILITY-001 passed: empty/missing/runner-error Unknown time, full windows, scheduled gaps, selected-probe/retry/manual/revision boundaries, stale and future evidence, heartbeat expiry, and response duration.');
}finally{
 await worker?.dispose();
 await rm(persist,{recursive:true,force:true});
}
