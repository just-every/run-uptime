import assert from 'node:assert/strict';
import {definitionDoor} from './auth-test-support.mjs';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
import {heartbeatImports,importedHeartbeatSettings} from './heartbeat-import-fixture.mjs';

// The actual emitted Worker, migrated D1 and signed Node runner share a controlled clock.
// No product state is rewritten to simulate age, deadlines, receipts, slots or incidents.
export async function proveImportedHeartbeatJobs({api,runner,origin,cookie,advance}){
 const fetcher=async(url,init)=>{const target=new URL(url),response=await api(target.pathname+target.search,init.body===undefined?undefined:JSON.parse(init.body),init.headers,init.method);return new Response(JSON.stringify(response.data),{status:response.status})};
 const door=definitionDoor({origin,cookie,fetcher});
 for(const fixture of heartbeatImports){
  await completeApiSecondFactor(origin,cookie,api);
  const before=(await api('/api/overview')).data;
  const plan=await door.preview(fixture.document);assert.equal(plan.status,200);assert.equal(plan.body.source,fixture.source);
  const [entry]=plan.body.entries;assert.equal(entry.action,'create');assert.deepEqual(entry.target.heartbeat,importedHeartbeatSettings);
  assert.ok(entry.differences.some(text=>/one scheduled missed-deadline result confirms failure/.test(text)));
  assert.ok(entry.differences.some(text=>/delays, repeats and escalation settings are not converted/.test(text)));
  assert.equal((await api('/api/overview')).data.monitors.length,before.monitors.length,'preview writes no monitor');
  const applied=await door.apply(plan.body);assert.equal(applied.status,200);assert.equal(applied.body.report.ok,true);
  const [id]=applied.body.created;
  const read=async()=>{const overview=(await api('/api/overview')).data;return {monitor:overview.monitors.find(m=>m.id===id),alerts:overview.alerts.filter(a=>a.monitor_id===id)}};
  const history=async()=>{const result=await api(`/api/monitors/${id}/history`);assert.equal(result.status,200);return result.data};
  let view=await read();assert.equal(view.monitor.state.state,'Paused');assert.deepEqual(view.monitor.definition.heartbeat,importedHeartbeatSettings);
  assert.equal(view.monitor.definition.url,'');assert.ok(!JSON.stringify(view.monitor).includes(fixture.sourceToken));
  assert.deepEqual(view.alerts,[]);assert.deepEqual(await history(),[]);
  assert.deepEqual((await api(`/api/monitors/${id}/heartbeat-runs`)).data.runs,[]);
  assert.equal((await api(`/api/heartbeats/${id}`,{},{authorization:`Bearer ${fixture.sourceToken}`,'x-heartbeat-sequence':'1'})).status,400);
  const activated=await api(`/api/monitors/${id}`,{...view.monitor.definition,enabled:true,canaryUrl:'https://canary.runner-target.test/canary'},{},'PATCH');assert.equal(activated.status,200);
  assert.deepEqual(activated.data.definition.heartbeat,importedHeartbeatSettings);
  const issued=await api(`/api/monitors/${id}/heartbeat-key`,{});assert.equal(issued.status,200);
  assert.ok(!issued.data.capabilityPath.includes(fixture.sourceToken));
  const success=async()=>api(issued.data.capabilityPath+'/success',undefined,{},'GET');
  const initial=await success();assert.equal(initial.status,200);assert.equal(initial.data.late,false);
  assert.equal((await read()).monitor.state.state,'Unknown','receipt ingress cannot establish Healthy');
  await runner();view=await read();assert.equal(view.monitor.state.state,'Healthy');assert.deepEqual(view.alerts,[]);
  const anchor=initial.data.receivedAt;
  // The expected period elapses, then grace nearly elapses; only signed scheduled work can project an incident.
  advance(anchor+3600000);await runner();assert.notEqual((await read()).monitor.state.state,'Failing');assert.deepEqual((await read()).alerts,[]);
  advance(anchor+3899999);await runner();assert.notEqual((await read()).monitor.state.state,'Failing');assert.deepEqual((await read()).alerts,[]);
  const early=await history();assert.ok(early.length>=2);assert.ok(early.every(slot=>slot.manual===0&&slot.status==='complete'&&slot.observations.every(o=>o.outcome==='pass')));
  advance(anchor+3900000);await runner();view=await read();assert.equal(view.monitor.state.state,'Failing');
  assert.equal(view.alerts.length,1);const trigger=view.alerts[0];assert.equal(trigger.kind,'trigger');assert.match(trigger.event.explanation,/Job missed/);
  const failed=await history(),deadline=failed.find(slot=>slot.observations.some(o=>o.outcome==='target_failure'));
  assert.ok(deadline);assert.equal(deadline.due_at,anchor+3900000);assert.equal(deadline.manual,0);
  assert.ok(deadline.observations.every(o=>o.completedAt===anchor+3900000&&o.heartbeatJob.receivedAt===anchor));
  advance(anchor+3901000);const late=await success();assert.equal(late.status,200);assert.equal(late.data.late,true);
  assert.equal((await read()).monitor.state.state,'Failing','late receipt ingress cannot recover');assert.deepEqual((await read()).alerts,[trigger]);
  await runner();view=await read();assert.equal(view.monitor.state.state,'Healthy');assert.equal(view.alerts.length,2);
  const recovery=view.alerts.find(a=>a.kind==='recovery');assert.ok(recovery);assert.match(recovery.event.explanation,/Late job success/);
  assert.deepEqual(view.alerts.find(a=>a.kind==='trigger'),trigger,'the missed-job incident remains intact');
  const recovered=await history();for(const slot of failed)assert.deepEqual(recovered.find(row=>row.id===slot.id),slot,'scheduled history is immutable after recovery');
  assert.ok(recovered.some(slot=>slot.manual===0&&slot.observations.some(o=>o.outcome==='pass'&&o.heartbeatJob.late)));
  const runs=(await api(`/api/monitors/${id}/heartbeat-runs`)).data.runs;assert.equal(runs.length,2);assert.ok(runs.some(run=>run.state==='success'&&run.late));
  await completeApiSecondFactor(origin,cookie,api);
  const rotated=await api(`/api/monitors/${id}/heartbeat-key`,{});assert.equal(rotated.status,200);
  assert.equal((await success()).status,400,'revoked local URL cannot append a receipt');
  assert.equal((await api(`/api/heartbeats/${id}`,{},{authorization:`Bearer ${fixture.sourceToken}`,'x-heartbeat-sequence':'2'})).status,400,'source authority remains inert after local recovery');
  assert.deepEqual((await api(`/api/monitors/${id}/heartbeat-runs`)).data.runs,runs);assert.deepEqual((await read()).alerts,view.alerts);
  const current=(await read()).monitor;assert.equal((await api(`/api/monitors/${id}`,{...current.definition,enabled:false},{},'PATCH')).status,200);
 }
 console.log('HEARTBEAT-004 saved-document migrations passed: UptimeRobot and Better Stack 60-minute period plus five-minute grace, reviewed paused apply, owner activation and new URL, actual signed deadline failure and retained late recovery; controlled local clock, no hosted timing or live cutover claimed.');
}
