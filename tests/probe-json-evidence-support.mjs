import assert from 'node:assert/strict';

// Exercise selectors through owner saves, real HTTP probes and signed scheduled completion.
export async function proveJsonSelectors(f) {
 const cases = [
  {
   name: 'JSON array', path: '$[*].ready',
   good: [{ready:true,message:'checkout-ready'},{ready:true}],
   bad: [{ready:true,message:'checkout-ready'},{ready:false}],
  },
  {
   name: 'Nested JSONPath', path: '$.checkout.orders[?(@.id=="synthetic-uptime-2")].items[*].ready',
   good: {checkout:{orders:[{id:'synthetic-uptime-1',items:[{ready:false}]},{id:'synthetic-uptime-2',items:[{ready:true},{ready:true}]}]},message:'checkout-ready'},
   bad: {checkout:{orders:[{id:'synthetic-uptime-1',items:[{ready:false}]},{id:'synthetic-uptime-2',items:[{ready:true},{ready:false}]}]},message:'checkout-ready'},
  },
 ];
 const failures = new Set();
 for (const example of cases) {
  const assertions = {status:200,bodyIncludes:'checkout-ready',bodyExcludes:'maintenance',bodyRegex:{pattern:'"ready":true'},header:{name:'x-check',equals:'yes'},json:{path:example.path,equals:true},latencyMs:1000};
  Object.assign(f.modes,{target:200,headers:{'content-type':'application/json','x-check':'yes'},delayMs:0,body:JSON.stringify(example.good)});
  const monitor = await f.monitor({name:example.name,assertions,retries:1});
  assert.deepEqual(monitor.definition.assertions,assertions,'the owner save retains the requested selector and criteria');
  const retained = [];
  for (const [phase,body] of [['healthy',example.good],['failure',example.bad],['recovery',example.good]]) {
   f.modes.body = JSON.stringify(body);
   // Advance only this monitor's scheduling fixture, without revising its saved criteria.
   await f.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.id).run();
   await f.run(f.first);await f.run(f.second);
   const history = await f.request(`/api/monitors/${monitor.id}/history`);
   assert.equal(history.status,200);
   const slot = history.data.find(row=>row.observations.length);
   assert.ok(slot && !retained.some(row=>row.id===slot.id),'each phase completes a new scheduled slot');
   assert.equal(slot.manual,0,'JSON evidence comes from scheduled work');
   assert.equal(slot.revision,monitor.revision);
   assert.deepEqual(slot.definition.assertions,assertions,'historical criteria remain the saved bundle');
   assert.deepEqual([...new Set(slot.observations.map(row=>row.probe))].sort(),[...monitor.definition.probes].sort(),'both assigned probes retain signed observations');
   assert.equal((await f.state(monitor.id)).state,phase==='failure'?'Failing':'Healthy');
   for (const observation of slot.observations) {
    assert.equal(observation.status,200,'a successful HTTP transport cannot hide a JSON failure');
    assert.equal(observation.outcome,phase==='failure'?'target_failure':'pass');
    const json = observation.checks.find(check=>check.assertion==='json');
    assert.ok(json,'signed history includes the selected JSON assertion');
    assert.equal(json.pass,phase!=='failure',example.name+' judges every selected value');
    assert.ok(observation.checks.filter(check=>check.assertion!=='json').every(check=>check.pass),'all unrelated saved assertions still pass');
    if (phase==='failure') {
     assert.ok(json.reason.includes(example.path),'failure identifies the saved selector');
     assert.match(json.reason,/actual \[redacted\]; expected \[redacted\]/,'query-selected values stay redacted');
     assert.ok(json.reason.length<=300,'diagnostics stay within the signed evidence bound');
     failures.add(json.reason);
    }
   }
   if (phase==='failure') for (const probe of monitor.definition.probes) assert.deepEqual(slot.observations.filter(row=>row.probe===probe).map(row=>row.attempt),[0,1],'each failed probe retains its original attempt and retry');
   const current = await f.request(`/api/overview?monitor=${monitor.id}`);
   assert.equal(current.status,200);
   const saved = current.data.monitors.find(row=>row.id===monitor.id);
   assert.equal(saved.revision,monitor.revision);
   assert.deepEqual(saved.definition.assertions,assertions,'every phase leaves current saved criteria unchanged');
   for (const prior of retained) assert.deepEqual(history.data.find(row=>row.id===prior.id),prior,'later failures and recovery do not rewrite earlier evidence');
   retained.push(slot);
  }
  const overview = (await f.request(`/api/overview?monitor=${monitor.id}`)).data;
  const alerts = overview.alerts.filter(row=>row.monitor_id===monitor.id);
  assert.equal(alerts.filter(row=>row.kind==='trigger').length,1,'the JSON failure confirms one incident');
  assert.equal(alerts.filter(row=>row.kind==='recovery').length,1,'the restored selected values recover once');
  await f.pause(monitor);
 }
 assert.equal(failures.size,cases.length,'array and nested-path failures retain distinct selector diagnostics');
}
