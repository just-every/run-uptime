import assert from 'node:assert/strict';

// Exercise settings revisions independently of the token-rotation door.
export async function proveHeartbeatRevisionIsolation({api,runner,db,advance}){
 const created=await api('/api/monitors',{name:'Revision-scoped backup',type:'heartbeat',heartbeat:{maxAgeMs:60000},canaryUrl:'https://canary.runner-target.test/canary',intervalMs:5000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1});
 assert.equal(created.status,201);const id=created.data.id,path=`/api/heartbeats/${id}`;
 const read=async()=>{const result=await api('/api/overview');assert.equal(result.status,200);return result.data.monitors.find(m=>m.id===id)};
 const history=async()=>{const result=await api(`/api/monitors/${id}/history`);assert.equal(result.status,200);return result.data};
 const records=async()=>({
  runs:(await api(`/api/monitors/${id}/heartbeat-runs`)).data.runs,
  history:await history(),
  monitor:await db.prepare('SELECT * FROM monitors WHERE id=?').bind(id).first(),
  authority:(await db.prepare('SELECT * FROM heartbeat_authority WHERE monitor_id=?').bind(id).all()).results,
  claims:(await db.prepare('SELECT c.* FROM heartbeat_claims c JOIN slots s ON s.id=c.slot_id WHERE s.monitor_id=? ORDER BY c.slot_id').bind(id).all()).results,
  limits:(await db.prepare('SELECT * FROM heartbeat_limits WHERE monitor_id=?').bind(id).all()).results,
  alerts:(await api('/api/overview')).data.alerts.filter(a=>a.monitor_id===id),
 });
 const issued=await api(`/api/monitors/${id}/heartbeat-key`,{});assert.equal(issued.status,200);
 const headers=sequence=>({authorization:`Bearer ${issued.data.token}`,'x-heartbeat-sequence':String(sequence)});
 const accepted=await api(path+'/success',{},headers(1));assert.equal(accepted.status,200);assert.equal(accepted.data.revision,issued.data.revision);
 assert.equal((await read()).state.state,'Unknown','receipt ingress alone cannot establish Healthy');
 await runner();assert.equal((await read()).state.state,'Healthy');
 const original=await records();assert.equal(original.runs.length,1);assert.equal(original.history.length,1);
 assert.ok(original.history[0].observations.every(o=>o.outcome==='pass'&&o.heartbeatJob.receivedAt===accepted.data.receivedAt));

 const changed=await api(`/api/monitors/${id}/heartbeat-settings`,{maxAgeMs:60000,graceMs:10000});assert.equal(changed.status,200);
 assert.equal(changed.data.revision,issued.data.revision+1,'settings create the next revision without issuing a token');
 assert.equal(changed.data.definition.heartbeat.graceMs,10000);
 assert.equal((await read()).state.state,'Unknown','earlier passing history cannot establish current health');
 const before=await records();assert.deepEqual(before.runs,original.runs);assert.deepEqual(before.history,original.history);
 for(const attempt of [()=>api(path+'/success',{},headers(2)),()=>api(issued.data.capabilityPath+'/success',undefined,{},'GET')]){
  const refused=await attempt();assert.equal(refused.status,400);assert.match(refused.data.error,/Heartbeat authorization required/);
  assert.deepEqual(await records(),before,'foreign-revision authority changes no receipt, history, claim, health, limit or alert record');
  assert.equal((await read()).state.state,'Unknown');
 }
 advance((await read()).nextDue);await runner();
 const pending=await history(),current=pending.filter(slot=>slot.revision===changed.data.revision);
 assert.equal(current.length,1);assert.equal(current[0].status,'complete');assert.equal(current[0].manual,0);
 assert.ok(current[0].observations.length>0);
 for(const observation of current[0].observations){
  assert.equal(observation.outcome,'runner_error','no inherited receipt can produce a passing snapshot');
  assert.equal(observation.heartbeatJob.receivedAt,null);assert.equal(observation.heartbeatJob.startedAt,null);assert.equal(observation.heartbeatJob.failure,null);
 }
 assert.equal((await read()).state.state,'Unknown');

 const fresh=await api(`/api/monitors/${id}/heartbeat-key`,{});assert.equal(fresh.status,200);assert.equal(fresh.data.revision,changed.data.revision+1);
 assert.equal((await api(path+'/success',{},headers(3))).status,400,'old authority stays retired after new authorization');
 const receipt=await api(path+'/success',{},{authorization:`Bearer ${fresh.data.token}`,'x-heartbeat-sequence':'1'});
 assert.equal(receipt.status,200);assert.equal(receipt.data.revision,fresh.data.revision);
 assert.equal((await read()).state.state,'Unknown','new current-revision receipt still needs signed evaluation');
 advance((await read()).nextDue);await runner();assert.equal((await read()).state.state,'Healthy');
 const completed=await history(),passing=completed.filter(slot=>slot.revision===fresh.data.revision);
 assert.equal(passing.length,1);assert.equal(passing[0].status,'complete');assert.equal(passing[0].manual,0);
 assert.ok(passing[0].observations.length>0);
 for(const observation of passing[0].observations){assert.equal(observation.outcome,'pass');assert.equal(observation.heartbeatJob.receivedAt,receipt.data.receivedAt)}
 for(const slot of pending)assert.deepEqual(completed.find(row=>row.id===slot.id),slot,'earlier scheduled evidence remains immutable');
 const runs=(await records()).runs;assert.equal(runs.length,2);assert.ok(runs.some(run=>run.revision===issued.data.revision));assert.ok(runs.some(run=>run.revision===fresh.data.revision));
 const monitor=await read();assert.equal((await api(`/api/monitors/${id}`,{...monitor.definition,enabled:false},{},'PATCH')).status,200);
 console.log('HEARTBEAT-001 revision isolation passed: settings retire both receipt forms, increasing old sequence refuses without writes, current signed snapshot has no inherited receipt, and only fresh authority plus scheduled signed evaluation establishes Healthy.');
}
