import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {fixture} from './support.mjs';
let f;before(async()=>{f=await fixture()});after(async()=>{await f?.close()});
test('migration preserves the existing runner and scoped key without putting credentials in owner lists',async()=>{
 const rows=(await f.request('/api/runners')).data;assert.equal(rows[0].runnerId,f.first.runnerId);assert.equal(rows[0].networkLabel,f.first.networkLabel);assert.equal(rows[0].lastContactAt,f.migratedContact);assert.ok(rows.every(r=>!Object.hasOwn(r,'key')));assert.equal((await f.request('/api/runner/enroll',{runner:f.first,signed:true,body:{version:1}})).data.runnerId,f.first.runnerId);
 const stored=await f.DB.prepare('SELECT key_ciphertext FROM runners WHERE runner_id=?').bind(f.second.runnerId).first();assert.ok(stored.key_ciphertext&&!stored.key_ciphertext.includes(f.second.key));
});
test('C3: two real runners on independent networks agree on a failed target',async()=>{
 const m=await f.monitor();await f.run(f.first);assert.equal((await f.state(m.id)).targetState,'Degraded');await f.run(f.second);assert.equal((await f.state(m.id)).targetState,'Failing');await f.pause(m);
});
test('C3: one real runner with a passing external canary establishes failure',async()=>{
 const m=await f.monitor({runners:[f.first],canary:true});await f.run(f.first);assert.equal((await f.state(m.id)).targetState,'Failing');await f.pause(m);
});
test('C3: a canary page larger than the probe body limit still passes and witnesses the failure',async()=>{
 f.modes.canaryBytes=300000;const m=await f.monitor({runners:[f.first],canary:true});await f.run(f.first);const state=await f.state(m.id);assert.equal(state.targetState,'Failing');assert.equal(state.regions[0].canaryPassed,true);await f.pause(m);f.modes.canaryBytes=0;
});
test('C3: a failing canary leaves target failure visible as Degraded',async()=>{
 f.modes.canary=503;const m=await f.monitor({runners:[f.first],canary:true,retries:1}),task=await f.claim(f.first);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);f.modes.canary=200;assert.equal((await f.submit(f.first,task,[{...await f.evidence(task),attempt:1}])).status,200);const state=await f.state(m.id);assert.equal(state.targetState,'Degraded');assert.equal(state.unknown,1);const overview=(await f.request('/api/overview')).data.monitors.find(row=>row.id===m.id);assert.equal(overview.availability.last24h.observedMs,0);assert.equal(overview.availability.responseDurationMs,null);await f.pause(m);f.modes.canary=200;
});
test('C3: one network with no external check takes the installation External check URL into its saved revision',async()=>{
 const save=(name,extra={},assignment={})=>f.request('/api/monitors',{body:{name,url:'https://target.example.test/',probes:['local-a'],assignments:{'local-a':{runnerId:f.first.runnerId,...assignment}},intervalMs:60000,...extra}});
 const overview=async()=>(await f.request('/api/overview')).data;
 const canary=async name=>(await overview()).monitors.find(m=>m.definition.name===name).definition.assignments['local-a'].canaryUrl;
 const setting=url=>f.request('/api/external-check',{body:{url}});
 assert.equal((await f.request('/api/external-check')).data.url,'https://example.com/','a new installation starts with https://example.com/');
 assert.equal((await overview()).runner.externalCheckUrl,'https://example.com/','the console reads the default from the overview');
 const first=await save('Default one');assert.equal(first.status,201,JSON.stringify(first.data));assert.equal(first.data.definition.assignments['local-a'].canaryUrl,'https://example.com/');
 // Revisions are immutable: changing the setting reaches monitors saved afterwards only.
 const changed=await setting('https://status.example.org/health');assert.equal(changed.status,200);assert.equal(changed.data.url,'https://status.example.org/health');
 assert.equal((await f.request('/api/external-check')).data.url,'https://status.example.org/health');
 const second=await save('Default two');assert.equal(second.status,201);assert.equal(second.data.definition.assignments['local-a'].canaryUrl,'https://status.example.org/health');
 assert.equal(await canary('Default one'),'https://example.com/','the earlier monitor keeps the URL it was saved with');
 // Resuming a paused monitor is a save: it takes the setting in force then.
 const paused=await save('Paused first',{enabled:false});assert.equal(paused.status,201);assert.equal(paused.data.definition.assignments['local-a'].canaryUrl,undefined,'a paused monitor needs none');
 await setting('https://example.org/status');
 const resumed=await f.request('/api/monitors/'+paused.data.id,{method:'PATCH',body:{...paused.data.definition,enabled:true}});assert.equal(resumed.status,200,JSON.stringify(resumed.data));assert.equal(resumed.data.definition.assignments['local-a'].canaryUrl,'https://example.org/status');
 // A URL the owner supplies is kept as it is.
 const own=await save('Own check',{},{canaryUrl:'https://owner.example.net/up'});assert.equal(own.data.definition.assignments['local-a'].canaryUrl,'https://owner.example.net/up');
 // Two runners that share a label are one network; two independent networks need no external check at all.
 const same=(await f.request('/api/runners',{body:{networkLabel:f.first.networkLabel}})).data;
 const shared=await f.request('/api/monitors',{body:{name:'One network twice',url:'https://target.example.test/',probes:['local-a','local-b'],assignments:{'local-a':{runnerId:f.first.runnerId},'local-b':{runnerId:same.runnerId}}}});
 assert.equal(shared.status,201);assert.deepEqual(Object.values(shared.data.definition.assignments).map(a=>a.canaryUrl),['https://example.org/status','https://example.org/status']);
 const two=await f.request('/api/monitors',{body:{name:'Two networks',url:'https://target.example.test/',probes:['local-a','local-b'],assignments:{'local-a':{runnerId:f.first.runnerId},'local-b':{runnerId:f.second.runnerId}}}});
 assert.equal(two.status,201);assert.ok(Object.values(two.data.definition.assignments).every(a=>a.canaryUrl===undefined));
 // A check on the monitored site fails whenever the monitor does, so it could never confirm an outage: refused for the
 // filled-in default and for a URL the owner supplies. Same site means the same hostname, ignoring case and a leading www.
 const sameSite=/is the same site as this monitor, so an outage there could never be confirmed/;
 for(const url of ['https://example.org/','https://www.example.org/home','https://EXAMPLE.org:8443/x?y=1','https://example.org./']){
  const refused=await save('Same site '+url,{url});assert.equal(refused.status,400,url);assert.match(refused.data.error,sameSite);
  assert.match(refused.data.error,/https:\/\/example\.org\/status/,'the message names the address');assert.match(refused.data.error,/Runner \/ archive/,'and says where to change it');
 }
 const subdomain=await save('Other site',{url:'https://status.example.org/'});assert.equal(subdomain.status,201,JSON.stringify(subdomain.data));assert.equal(subdomain.data.definition.assignments['local-a'].canaryUrl,'https://example.org/status','a different hostname is a different site');
 const ownSame=await save('Own same site',{},{canaryUrl:'https://www.target.example.test/up'});assert.equal(ownSame.status,400);assert.match(ownSame.data.error,sameSite);assert.match(ownSame.data.error,/different site for this check/);
 const independentSame=await f.request('/api/monitors',{body:{name:'Two networks same site',url:'https://target.example.test/',probes:['local-a','local-b'],assignments:{'local-a':{runnerId:f.first.runnerId,canaryUrl:'https://target.example.test/up'},'local-b':{runnerId:f.second.runnerId}}}});assert.equal(independentSame.status,400);assert.match(independentSame.data.error,sameSite);
 assert.equal((await save('Paused same site',{enabled:false},{canaryUrl:'https://target.example.test/up'})).status,201,'a paused monitor is checked when it is resumed');
 assert.equal((await overview()).monitors.some(m=>/^Same site /.test(m.definition.name)||m.definition.name==='Own same site'||m.definition.name==='Two networks same site'),false,'a refused save creates no monitor');
 // Refused at the boundary with a plain message; the stored value does not change.
 for(const url of ['http://127.0.0.1/','http://10.0.0.5/health','https://user:pw@example.com/','https://example.com/#x','ftp://example.com/','not a url','',5,undefined]){
  const refused=await setting(url);assert.equal(refused.status,400,String(url));assert.equal(typeof refused.data.error,'string');
 }
 assert.equal((await f.request('/api/external-check',{body:{url:'https://example.com/',other:1}})).status,400);
 assert.equal((await f.request('/api/external-check')).data.url,'https://example.org/status');
 // Without the setting there is nothing to fill in: refused, naming the setting.
 await f.DB.prepare('DELETE FROM external_check').run();
 const missing=await save('No setting');assert.equal(missing.status,400);assert.match(missing.data.error,/External check URL/);
 await f.DB.prepare("INSERT INTO external_check(id,url,updated_at) VALUES(1,'https://example.com/',?)").bind(Date.now()).run();
 for(const m of (await overview()).monitors.filter(m=>m.definition.enabled))await f.pause(m);
});
test('C4: assigned-runner, signature and acceptance-window authority protect first-copy-wins evidence',async()=>{
 const m=await f.monitor(),task=await f.claim(f.first),o=await f.evidence(task);
 assert.equal((await f.submit(f.second,task,[o])).status,400);assert.equal((await f.request('/api/runner/results',{runner:f.first,body:{slotId:task.id,attempts:[o]}})).status,403);
 assert.equal((await f.submit(f.first,task,[o])).status,200);
 const duplicate={...o,failureSnapshot:undefined,id:'different-copy',outcome:'pass',status:200,checks:[{assertion:'status',pass:true,reason:'Expected HTTP status'}]};assert.equal((await f.submit(f.first,task,[duplicate])).status,200);
 const history=(await f.request('/api/monitors/'+m.id+'/history')).data;assert.equal(history[0].observations.length,1);assert.equal(history[0].observations[0].id,o.id);
 await f.DB.prepare('UPDATE slots SET lease_until=? WHERE id=?').bind(Date.now()-1,task.id).run();assert.equal((await f.submit(f.first,task,[o])).status,400);await f.pause(m);
});
test('C4: reverse retry and scheduled-slot arrivals converge in state and incident history',async()=>{
 const created=await f.request('/api/notifications/destinations',{body:{name:'Retry events',kind:'webhook',url:'https://notifications.example.com/retries'}});
 assert.equal(created.status,201);const destination=created.data,accepted=new Map();
 async function read(m){
  const overview=(await f.request('/api/overview')).data,state=overview.monitors.find(row=>row.id===m.id).state;
  const alerts=overview.alerts.filter(row=>row.monitor_id===m.id).reverse(),jobs=overview.notifications.deliveries.filter(row=>row.event.monitorId===m.id);
  assert.deepEqual(jobs.map(row=>row.eventId).sort(),alerts.map(row=>row.id).sort(),'one job per accepted incident event');
  const history=alerts.map(({id,kind,event})=>({id,kind,event})),prior=accepted.get(m.id)??[];
  assert.deepEqual(history.slice(0,prior.length),prior,'accepted incident history is append-only');accepted.set(m.id,history);
  const {reason,evaluatedAt,incidentKey,regions,...semantic}=state;
  return {state:{...semantic,incidentKeyPresent:Boolean(incidentKey),regions:regions.map(({observationId,observedAt,...region})=>region)},events:alerts.map(({kind,event})=>({kind,state:event.state,incidentKeyPresent:Boolean(event.incidentKey)}))}
 }
 // Passing at attempt 1 with retries=2 is a legitimate early stop. A terminal
 // attempt 2 delivered with a missing middle attempt is still incomplete.
 for(const scenario of [
  {retries:1,terminalAttempt:1,pass:false,failedCanary:-1},
  {retries:1,terminalAttempt:1,pass:false,failedCanary:0},
  {retries:2,terminalAttempt:2,pass:false,failedCanary:1},
  {retries:2,terminalAttempt:1,pass:true,failedCanary:-1},
  {retries:2,terminalAttempt:2,pass:true,failedCanary:1}
 ]){
  const results=[];
  for(const reversed of [false,true]){
   f.modes.target=503;f.modes.canary=200;
   const m=await f.monitor({runners:[f.first],canary:true,retries:scenario.retries});
   if(scenario.pass){
    const failure=await f.claim(f.first),chain=[];
    for(let attempt=0;attempt<=scenario.retries;attempt++)chain.push({...await f.evidence(failure),attempt});
    assert.equal((await f.submit(f.first,failure,chain)).status,200);
    assert.equal((await read(m)).state.notificationOpen,true);
    await new Promise(r=>setTimeout(r,5100));
   }
   const task=await f.claim(f.first),chain=[];
   for(let attempt=0;attempt<=scenario.terminalAttempt;attempt++){
    f.modes.target=scenario.pass&&attempt===scenario.terminalAttempt?200:503;f.modes.canary=attempt===scenario.failedCanary?503:200;
    chain.push({...await f.evidence(task),attempt});
   }
   // For three attempts, deliver terminal then initial then middle to expose
   // the gap even when both endpoints have already arrived.
   const ordered=reversed?[chain.at(-1),...chain.slice(0,-1)]:chain;
   for(const [index,observation] of ordered.entries()){
    assert.equal((await f.submit(f.first,task,[observation])).status,200);
    const current=await read(m);
    if(index<ordered.length-1){
     assert.equal(current.state.failureStreak,0,'incomplete retries cannot confirm failure');
     assert.equal(current.state.recoveryStreak,0,'incomplete retries cannot confirm recovery');
     assert.equal(current.state.notificationOpen,scenario.pass,'incomplete retries preserve the existing incident');
     assert.deepEqual(current.events.map(row=>row.kind),scenario.pass?['trigger']:[]);
     const history=(await f.request('/api/monitors/'+m.id+'/history')).data;
     assert.equal(history.find(row=>row.id===task.id).status,'running');
    }
    const duplicate={...observation,failureSnapshot:undefined,id:crypto.randomUUID(),outcome:observation.outcome==='pass'?'target_failure':'pass',status:observation.outcome==='pass'?503:200,checks:[{assertion:'status',pass:observation.outcome!=='pass',reason:'Different duplicate body'}]};
    assert.equal((await f.submit(f.first,task,[duplicate])).status,200);
    assert.deepEqual(await read(m),current,'first accepted copy wins without adding events or jobs');
   }
   const result=await read(m),canaryFailed=scenario.failedCanary>=0;
   assert.equal(result.state.targetState,canaryFailed?(scenario.pass?'Unknown':'Degraded'):(scenario.pass?'Healthy':'Failing'));
   assert.equal(result.state.notificationOpen,canaryFailed?scenario.pass:!scenario.pass);
   assert.deepEqual(result.events.map(row=>row.kind),scenario.pass?(canaryFailed?['trigger']:['trigger','recovery']):(canaryFailed?[]:['trigger']));
   const history=(await f.request('/api/monitors/'+m.id+'/history')).data.find(row=>row.id===task.id);
   assert.equal(history.status,'complete');assert.deepEqual(history.observations,chain,'all signed retries remain immutable');
   results.push(result);await f.pause(m);
  }
  assert.deepEqual(results[1],results[0],'arrival order preserves every semantic state field and incident history');
 }
 const peer=(await f.request('/api/runners',{body:{networkLabel:f.first.networkLabel}})).data;
 const unrelated=(await f.request('/api/runners',{body:{networkLabel:'unrelated-canary-network'}})).data;
 // A configured canary can disqualify every probe on its label, including
 // probes assigned to another key. Only those potentially invalidating peers
 // must settle before that label contributes to an incident decision.
 for(const scenario of [
  {name:'failed peer on another key',runners:[f.first,peer],canaries:[0,1],failedProbe:1,failedAttempt:0,expected:'Degraded'},
  {name:'failed peer on the same key',runners:[f.first,f.first],canaries:[0,1],failedProbe:1,failedAttempt:0,expected:'Degraded'},
  {name:'missing lower peer retry',runners:[f.first,peer],canaries:[0,1],retries:1,failedProbe:1,failedAttempt:0,expected:'Degraded'},
  {name:'nonterminal peer prefix',runners:[f.first,peer],canaries:[0,1],retries:1,failedProbe:1,failedAttempt:1,expected:'Degraded'},
  {name:'independent quorum invalidated by shared-label peer',runners:[f.first,f.second,peer],canaries:[2],failedProbe:2,failedAttempt:0,expected:'Degraded'},
  {name:'settled passing canaries',runners:[f.first,peer],canaries:[0,1],quorumAfter:[0,1],expected:'Failing'},
  {name:'early passing peer settles before retry limit',runners:[f.first,peer],canaries:[0,1],retries:2,passAt:{1:0},quorumAfter:[0,1],expected:'Failing'},
  {name:'unconfigured same-label peer does not delay witness',runners:[f.first,peer],canaries:[0],retries:1,passAt:{1:1},quorumAfter:[0],expected:'Failing'},
  {name:'unrelated pending canary does not delay quorum',runners:[f.first,f.second,unrelated],canaries:[2],failedProbe:2,failedAttempt:0,quorumAfter:[0,1],expected:'Failing'},
  {name:'shared-label complete recovery',runners:[f.first,peer],canaries:[0,1],recovery:true,retries:1,passAt:{0:1,1:1},expected:'Healthy'},
  {name:'failed peer prevents recovery',runners:[f.first,peer],canaries:[0,1],recovery:true,retries:1,passAt:{0:1,1:1},failedProbe:1,failedAttempt:0,expected:'Unknown'}
 ]){
  const results=[];
  for(const order of ['forward','reverse',...(scenario.name==='missing lower peer retry'?['peer-retry-first']:[])]){
   const retries=scenario.retries??0;
   let m=await f.monitor({runners:scenario.runners,canary:true,retries});
   if(scenario.canaries.length<scenario.runners.length){
    const assignments=Object.fromEntries(Object.entries(m.definition.assignments).map(([probe,assignment],i)=>[probe,scenario.canaries.includes(i)?assignment:{runnerId:assignment.runnerId}]));
    const saved=await f.request('/api/monitors/'+m.id,{method:'PATCH',body:{...m.definition,assignments}});assert.equal(saved.status,200);m=saved.data;
   }
   async function claim(){
    const runners=[...new Map(scenario.runners.map(r=>[r.runnerId,r])).values()],task=await f.claim(runners[0]);
    for(const runner of runners.slice(1))assert.equal((await f.claim(runner)).id,task.id);
    return task;
   }
   async function evidence(task,opening=false){
    const chains=[];
    for(const [i,probe] of task.definition.probes.entries()){
     const chain=[],passAt=opening?undefined:scenario.passAt?.[i];
     for(let attempt=0;attempt<=(passAt??retries);attempt++){
      f.modes.target=attempt===passAt?200:503;
      f.modes.canary=!opening&&i===scenario.failedProbe&&attempt===scenario.failedAttempt?503:200;
      chain.push({...await f.evidence(task,probe),attempt});
     }
     chains.push(chain);
    }
    return chains;
   }
   if(scenario.recovery){
    const opening=await claim(),chains=await evidence(opening,true);
    for(const [i,chain] of chains.entries())assert.equal((await f.submit(scenario.runners[i],opening,chain)).status,200);
    assert.equal((await read(m)).state.notificationOpen,true);
    await new Promise(r=>setTimeout(r,5100));
   }
   const task=await claim(),chains=await evidence(task),deliveries=chains.flatMap((chain,i)=>chain.map(observation=>({i,observation})));
   const ordered=order==='reverse'?[...deliveries].reverse():order==='peer-retry-first'?[...deliveries.filter(d=>d.i===0),...deliveries.filter(d=>d.i===1).reverse()]:deliveries;
   const remaining=chains.map(chain=>chain.length);
   for(const {i,observation} of ordered){
    assert.equal((await f.submit(scenario.runners[i],task,[observation])).status,200);remaining[i]--;
    const current=await read(m),recovered=scenario.recovery&&scenario.expected==='Healthy'&&remaining.every(n=>n===0);
    const open=scenario.recovery?!recovered:Boolean(scenario.quorumAfter?.every(probe=>remaining[probe]===0));
    assert.equal(current.state.notificationOpen,open,`${scenario.name}: ${order} incident eligibility`);
    assert.deepEqual(current.events.map(row=>row.kind),scenario.recovery?(recovered?['trigger','recovery']:['trigger']):(open?['trigger']:[]));
    if(!open&&!recovered)assert.equal(current.state.failureStreak,0);
    if(scenario.recovery&&!recovered)assert.equal(current.state.recoveryStreak,0,'partial or canary-invalid passing coverage cannot recover');
    assert.equal((await f.submit(scenario.runners[i],task,[{...observation,id:crypto.randomUUID()}])).status,200);
    assert.deepEqual(await read(m),current,'duplicate shared-label attempts cannot add events or jobs');
   }
   const result=await read(m);assert.equal(result.state.targetState,scenario.expected,scenario.name);results.push(result);
   const history=(await f.request('/api/monitors/'+m.id+'/history')).data.find(row=>row.id===task.id);
   assert.equal(history.status,'complete');assert.deepEqual(history.observations,chains.flat(),'shared-label attempts remain immutable');
   await f.pause(m);
  }
  for(const result of results.slice(1))assert.deepEqual(result,results[0],`${scenario.name}: state, incident and job histories converge`);
 }
 f.modes.target=503;f.modes.canary=200;
 assert.equal((await f.request('/api/notifications/destinations/'+destination.id,{method:'PATCH',body:{name:'Retry events',enabled:false}})).status,200);
 const forward=await f.monitor({runners:[f.first],canary:true,confirmSlots:2});let task=await f.claim(f.first);await f.submit(f.first,task,[await f.evidence(task)]);await new Promise(r=>setTimeout(r,5100));task=await f.claim(f.first);await f.submit(f.first,task,[await f.evidence(task)]);const expected=await f.state(forward.id);await f.pause(forward);
 const reverse=await f.monitor({runners:[f.first],canary:true,confirmSlots:2});const early=await f.claim(f.first),earlier=await f.evidence(early);await new Promise(r=>setTimeout(r,5100));const late=await f.claim(f.first);await f.submit(f.first,late,[await f.evidence(late)]);await f.submit(f.first,early,[earlier]);const actual=await f.state(reverse.id);assert.equal(actual.targetState,expected.targetState);assert.equal(actual.failureStreak,expected.failureStreak);assert.equal(actual.targetState,'Failing');await f.pause(reverse);
});
test('C4: revoking one runner refuses its attempts and leaves another runner authorized',async()=>{
 const m=await f.monitor(),task=await f.claim(f.second),o=await f.evidence(task);assert.equal((await f.request('/api/runners/'+f.second.runnerId,{method:'DELETE'})).status,200);assert.equal((await f.submit(f.second,task,[o])).status,401);assert.equal((await f.request('/api/runner/claim',{runner:f.first,body:{}})).status,200);assert.equal((await f.request('/api/runners',{method:'POST',body:{networkLabel:'untrusted'},headers:{cookie:''}})).status,401);await f.pause(m);
});

test('legacy revisions keep quorum alerts until a new save adopts an external check or independent networks',async()=>{
 const {validateDefinition}=await import('../../src/domain/policy.mjs');
 const target=(await f.monitor({enabled:false})).definition.url;
 const definition=validateDefinition({name:'Upgraded monitor',url:target,probes:['local-a'],retries:1,intervalMs:5000,confirmSlots:1,recoverSlots:1},[]),id=crypto.randomUUID(),now=Date.now();
 await f.DB.batch([
  f.DB.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind(id,1,JSON.stringify(definition),now,'{}'),
  f.DB.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(id,1,JSON.stringify(definition),now),
  f.DB.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind(id)
 ]);
 const task=await f.claim(f.first);
 const initial=await f.evidence(task),terminal={...await f.evidence(task),attempt:1};
 assert.equal((await f.submit(f.first,task,[initial])).status,200);assert.equal((await f.state(id)).targetState,'Degraded');
 assert.equal((await f.submit(f.first,task,[terminal])).status,200);
 const read=(await f.request('/api/overview')).data,legacy=read.monitors.find(m=>m.id===id);
 assert.equal(legacy.state.targetState,'Failing');assert.equal(legacy.activeVantages,1);assert.ok(legacy.configurationWarning);assert.equal(read.alerts.filter(a=>a.monitor_id===id&&a.kind==='trigger').length,1);
 // Saving the same single-network settings is a new revision, which takes the installation's External check URL instead of being refused.
 const adopted=await f.request('/api/monitors/'+id,{method:'PATCH',body:definition});assert.equal(adopted.status,200,JSON.stringify(adopted.data));
 assert.equal(adopted.data.definition.assignments['local-a'].canaryUrl,'https://example.com/');assert.equal((await f.request('/api/overview')).data.monitors.find(m=>m.id===id).configurationWarning,null);
 const saved=await f.request('/api/monitors/'+id,{method:'PATCH',body:{...definition,probes:['local-a','local-b'],assignments:{'local-a':{runnerId:f.first.runnerId},'local-b':{runnerId:(await f.request('/api/runners',{body:{networkLabel:'upgrade-second'}})).data.runnerId}}}});
 assert.equal(saved.status,200);assert.ok(saved.data.definition.assignments);assert.equal((await f.request('/api/overview')).data.monitors.find(m=>m.id===id).configurationWarning,null);await f.pause(saved.data);
});

test('bounded projection equals full stored replay through late retries, expiry, manual checks and revisions',async()=>{
 const {evaluate}=await import('../../src/domain/policy.mjs');
 async function oracle(m){
  const slots=(await f.DB.prepare('SELECT * FROM slots WHERE monitor_id=? AND revision=? AND manual=0 ORDER BY due_at,id').bind(m.id,m.revision).all()).results;
  const observations=(await f.DB.prepare('SELECT o.* FROM observations o JOIN slots s ON s.id=o.slot_id WHERE s.monitor_id=? AND s.revision=?').bind(m.id,m.revision).all()).results;
  const actual=await f.state(m.id);let state={},last=[];
  for(const slot of slots){last=m.definition.probes.flatMap(probe=>{const chain=observations.filter(o=>o.slot_id===slot.id&&o.probe===probe).map(o=>JSON.parse(o.evidence)).sort((a,b)=>b.attempt-a.attempt);if(!chain.length)return [];const failed=chain.find(o=>o.canary&&o.canary.outcome!=='pass');const numbers=new Set(chain.map(o=>o.attempt));let retryComplete=true;for(let attempt=0;attempt<=chain[0].attempt;attempt++)if(!numbers.has(attempt))retryComplete=false;return [{...chain[0],retryComplete,...(failed?{canary:failed.canary}:{})}]});state=evaluate(m.definition,last,state,Math.max(slot.due_at,...last.flatMap(o=>[o.completedAt,o.canary?.completedAt??0])))}
  const expected=evaluate(m.definition,last,state,actual.evaluatedAt,false);
  for(const key of ['state','targetState','underlyingState','evidenceState','coverageState','candidate','regions','denominator','failingVantages','failureStreak','recoveryStreak','confirmedFailure','maintenance','unknown','fails'])assert.deepEqual(actual[key],expected[key],key);
  return actual
 }
 // The earlier authority test revoked second; use a newly enrolled real runner.
 const third=(await f.request('/api/runners',{body:{networkLabel:'projection-network'}})).data;f.third=third;
 const configured=await f.monitor({runners:[f.first,third],canary:true,retries:1,confirmSlots:2,freshnessMs:5000});
 const m=(await f.request('/api/monitors/'+configured.id,{method:'PATCH',body:{...configured.definition,assignments:{...configured.definition.assignments,'local-b':{runnerId:third.runnerId}}}})).data;
 const early=await f.claim(f.first);await f.claim(third);
 const earlyEvidence=await Promise.all(early.definition.probes.map(p=>f.evidence(early,p)));
 await new Promise(r=>setTimeout(r,5100));
 const late=await f.claim(f.first);await f.claim(third);
 const lateEvidence=await Promise.all(late.definition.probes.map(p=>f.evidence(late,p)));
 for(const [task,evidence] of [[late,lateEvidence],[early,earlyEvidence]]){
  const results=await Promise.all([f.first,third].map((runner,i)=>f.submit(runner,task,[...(task===early?[evidence[i]]:[]),{...evidence[i],id:crypto.randomUUID(),attempt:1}])));assert.ok(results.every(r=>r.status===200));await oracle(m)
 }
 assert.equal((await oracle(m)).failureStreak,0,'the later incomplete retries cannot confirm an incident');
 await f.DB.prepare('UPDATE slots SET lease_until=? WHERE id=?').bind(Date.now()-1,early.id).run();await oracle(m);
 const checkpoint=await f.DB.prepare('SELECT slot_id FROM attempt_checkpoints WHERE monitor_id=?').bind(m.id).first();assert.equal(checkpoint.slot_id,early.id);
 // The later retry chain remains incomplete and mutable. A reverse-arriving
 // initial failed canary removes its network without opening an incident.
 f.modes.canary=503;const failed=await f.evidence(late,'local-a');f.modes.canary=200;
 assert.equal((await f.submit(f.first,late,[failed])).status,200);assert.equal((await oracle(m)).failureStreak,0);
 assert.equal((await f.DB.prepare('SELECT slot_id FROM attempt_checkpoints WHERE monitor_id=?').bind(m.id).first()).slot_id,early.id);
 const manual=(await f.request('/api/monitors/'+m.id+'/run',{body:{}})).data;const manualTask=await f.claim(f.first);assert.equal(manualTask.id,manual.slotId);await f.claim(third);
 for(const [i,runner] of [f.first,third].entries())assert.equal((await f.submit(runner,manualTask,[await f.evidence(manualTask,manualTask.definition.probes[i]),{...await f.evidence(manualTask,manualTask.definition.probes[i]),attempt:1}])).status,200);await oracle(m);
 await new Promise(r=>setTimeout(r,5100));assert.equal((await oracle(m)).unknown,2);
 const saved=(await f.request('/api/monitors/'+m.id,{method:'PATCH',body:m.definition})).data;
 const before=await f.state(m.id);assert.equal((await f.submit(third,late,[lateEvidence[1]])).status,200);const after=await f.state(m.id);assert.equal(after.failureStreak,before.failureStreak);assert.equal(after.candidate,'Unknown');await f.pause(saved);
 await f.DB.prepare('UPDATE slots SET lease_until=? WHERE monitor_id=?').bind(Date.now()-1,m.id).run();
 const archive=await f.request('/api/archive');assert.equal(archive.status,200,JSON.stringify(archive.data));assert.equal(JSON.stringify(archive.data).includes('attempt_checkpoints'),false);
 const erased=await f.request('/api/monitors/'+m.id+'/erase',{body:{name:m.definition.name}});assert.equal(erased.status,200);assert.ok(erased.data.receipt.counts.attempt_checkpoints>0);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM attempt_checkpoints WHERE monitor_id=?').bind(m.id).first()).n,0);
 const recovery=await f.monitor({runners:[f.first,third],recoverSlots:2});
 for(const expected of ['Failing','Recovering','Healthy']){
  if(expected!=='Failing'){f.modes.target=200;await new Promise(r=>setTimeout(r,5100))}
  const task=await f.claim(f.first);await f.claim(third);
  const attempts=await Promise.all(task.definition.probes.map(p=>f.evidence(task,p)));
  const results=await Promise.all([f.first,third].map((runner,i)=>f.submit(runner,task,[attempts[i]])));assert.ok(results.every(r=>r.status===200));
  assert.equal((await oracle(recovery)).targetState,expected);
  await f.DB.prepare('UPDATE slots SET lease_until=? WHERE id=?').bind(Date.now()-1,task.id).run();assert.equal((await oracle(recovery)).targetState,expected);
 }
 assert.equal((await oracle(recovery)).recoveryStreak,2);f.modes.target=503;await f.pause(recovery);
});
test('each vantage starts its own scheduled checks at least one interval apart',async()=>{
 // Two machines poll out of phase: the second runner takes its part of a check 1.5 s after the first claimed it, and is then the
 // first to poll once the next check is due. Its next part must still start a whole interval after its previous one.
 const second=(await f.request('/api/runners',{body:{networkLabel:'phase-network'}})).data,m=await f.monitor({runners:[f.first,second]}),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const first=await f.claim(f.first);assert.equal((await f.submit(f.first,first,[await f.evidence(first)])).status,200);await sleep(1500);
 const own=await f.claim(second),ownAt=Date.now();assert.equal(own.id,first.id,'the second runner takes its part of the same check');
 assert.equal((await f.submit(second,own,[await f.evidence(own)])).status,200);
 let next=null;while(!next&&Date.now()-ownAt<15000){next=await f.claim(second);if(!next)await sleep(100)}
 assert.ok(next&&next.id!==own.id,'the second runner took its part of the next scheduled check');
 assert.ok(Date.now()-ownAt>=m.definition.intervalMs,`the second runner's checks started ${Date.now()-ownAt} ms apart`);
 await f.pause(m);
});
