import assert from 'node:assert/strict';

// Continue the existing owner journey using only native maintenance, history,
// overview and report routes, plus real signed runner processes at a fixed clock.
export async function proveRecurringMaintenance(c){
 const {good,create,preview,apply,cancel,monitor,history,runner,advance}=c;
 await c.idle();
 const id=(await create('synthetic-uptime-503','recurring')).id;
 const window={id:'synthetic-uptime-504',name:'New York Sunday maintenance',timeZone:'America/New_York',mode:'suppress',
  weekly:{weekdays:[0],localTime:'01:30',durationMinutes:120,fromDate:'2030-10-27',untilDate:'2030-11-10'}};
 const input={monitorIds:[id],window},review=await preview(input);
 assert.deepEqual(review.occurrences.map(({localDate,status,startsAt,endsAt,repeatedStartsAt})=>({localDate,status,startsAt,endsAt,repeatedStartsAt})),[
  {localDate:'2030-10-27',status:'scheduled',startsAt:Date.parse('2030-10-27T05:30:00Z'),endsAt:Date.parse('2030-10-27T07:30:00Z'),repeatedStartsAt:undefined},
  {localDate:'2030-11-03',status:'first-repeat',startsAt:Date.parse('2030-11-03T05:30:00Z'),endsAt:Date.parse('2030-11-03T07:30:00Z'),repeatedStartsAt:Date.parse('2030-11-03T06:30:00Z')},
  {localDate:'2030-11-10',status:'scheduled',startsAt:Date.parse('2030-11-10T06:30:00Z'),endsAt:Date.parse('2030-11-10T08:30:00Z'),repeatedStartsAt:undefined},
 ],'review retains New York local time while UTC offsets change across fall-back');
 const applied=await apply(input);
 assert.equal(applied.digest,review.digest);
 assert.deepEqual((await monitor(id)).definition.maintenanceWindows,[review.window],'the reviewed recurrence is actually saved');
 const alertEvents=async()=>(await good(`/api/overview?monitor=${id}`)).alerts.filter(event=>event.monitor_id===id||event.event?.monitorId===id);
 const retained=async old=>{
  const current=await history(id);
  for(const slot of old)assert.deepEqual(current.find(row=>row.id===slot.id),slot,'scheduled evidence and immutable definitions survive restart, expiry and cancellation');
 };
 const failing=async()=>{
  await runner();
  const current=await monitor(id);
  assert.equal(current.state.maintenance,true);assert.equal(current.state.targetState,'Failing');
  assert.equal(current.state.denominator,1);assert.equal(current.maintenanceEndsAt,Date.parse('2030-11-03T07:30:00Z'));
  const completed=(await history(id)).filter(slot=>slot.status==='complete');
  const latest=completed[0];assert.ok(latest);
  assert.equal(latest.manual,0);assert.equal(latest.observations.length,1);
  assert.equal(latest.observations[0].outcome,'target_failure');assert.equal(latest.observations[0].status,503);
  assert.deepEqual(latest.definition.maintenanceWindows,[review.window]);
  assert.deepEqual(await alertEvents(),[],'recurring suppression executes failures without sending trigger or recovery');
  return latest;
 };
 c.mode(503);advance(Date.parse('2030-11-03T05:30:00Z'));
 const daylight=await failing();
 assert.equal(daylight.due_at,Date.parse('2030-11-03T05:30:00Z'));
 await c.capture(id,'recurring-active',window.id,true);
 const saved=await history(id);
 await c.restart();
 await retained(saved);
 assert.deepEqual((await monitor(id)).definition.maintenanceWindows,[review.window]);
 assert.equal((await monitor(id)).state.maintenance,true);
 // The repeated 01:30 is inside the same elapsed two-hour window, not a
 // second occurrence. A new signed runner still checks the failing target.
 advance(Date.parse('2030-11-03T06:30:00Z'));
 const standard=await failing();
 assert.equal(standard.observations[0].startedAt,Date.parse('2030-11-03T06:30:00Z'));
 const failed=await history(id);
 assert.ok(failed.some(slot=>slot.id===daylight.id));assert.notEqual(standard.id,daylight.id);

 // Merely ending maintenance cannot manufacture a recovery. The first actual
 // healthy scheduled evidence after expiry also has no suppressed trigger to close.
 advance(Date.parse('2030-11-03T07:30:00Z'));
 assert.equal((await monitor(id)).state.maintenance,false);
 assert.notEqual((await monitor(id)).state.targetState,'Healthy');
 assert.deepEqual(await alertEvents(),[]);
 const reportPath=()=>`/api/v1/monitors/${id}/report?`+new URLSearchParams({period:'custom',from:String(Date.parse('2030-11-03T05:30:00Z')),to:String(Date.parse('2030-11-03T07:30:00Z')),timeZone:'America/New_York',bucket:'raw'});
 const report=await good(reportPath());
 assert.equal(report.availability.windowMs,7200000);assert.equal(report.availability.maintenanceMs,7200000);
 assert.equal(report.availability.observedMs,0);assert.equal(report.availability.unknownMs,0);
 assert.equal(report.availability.pausedMs,0);assert.equal(report.availability.uptimePercent,null);
 assert.ok((await good(reportPath()+'&format=csv')).includes(',maintenanceMs,7200000,ms,'));
 c.mode(200);await runner();
 assert.equal((await monitor(id)).state.targetState,'Healthy');assert.deepEqual(await alertEvents(),[]);
 await retained(failed);

 // Cancel a second live recurrence after a real failure. Only its elapsed
 // minute remains maintenance; its original observations and first calendar persist.
 const cancelled={id:'synthetic-uptime-505',name:'New York cancellation',timeZone:'America/New_York',mode:'suppress',
  weekly:{weekdays:[0],localTime:'02:30',durationMinutes:60,fromDate:'2030-11-03',untilDate:'2030-11-10'}};
 await apply({monitorIds:[id],window:cancelled});
 advance((await monitor(id)).nextDue);c.mode(503);await runner();
 assert.equal((await monitor(id)).state.maintenance,true);assert.equal((await monitor(id)).state.targetState,'Failing');
 assert.deepEqual(await alertEvents(),[]);
 const beforeCancel=await history(id),cancelAt=Date.parse('2030-11-03T07:31:00Z');
 advance(cancelAt);await cancel([id],cancelled.id);
 assert.equal((await monitor(id)).state.maintenance,false);
 assert.deepEqual((await monitor(id)).definition.maintenanceWindows,[review.window]);
 assert.deepEqual(await alertEvents(),[]);
 c.mode(200);await runner();
 assert.equal((await monitor(id)).state.targetState,'Healthy');assert.deepEqual(await alertEvents(),[]);
 await retained(beforeCancel);
 assert.deepEqual((await good(reportPath())).availability,report.availability,'historical maintenance denominator survives calendar cancellation');
 const cancellationReport=await good(`/api/v1/monitors/${id}/report?`+new URLSearchParams({period:'custom',from:String(Date.parse('2030-11-03T07:30:00Z')),to:String(cancelAt),timeZone:'America/New_York',bucket:'raw'}));
 assert.equal(cancellationReport.availability.maintenanceMs,60000);assert.equal(cancellationReport.availability.observedMs,0);
 await c.capture(id,'recurring-ended',window.id);
 console.log('PROBE MAINT-001 point 1: native preview and apply, signed 503 checks on both sides of New York fall-back, restart, expiry and cancellation -> retained failed history, no orphan recovery, 7200000 ms recurring maintenance plus 60000 ms before cancellation; observed denominator 0.');
}
