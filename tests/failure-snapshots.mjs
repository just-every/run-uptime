import http from 'node:http';
// EVIDENCE-002: owner -> real signed HTTP runner -> redacted diagnostic custody -> inactive archive.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture,closeServer} from './resilience/support.mjs';
import {snapshotBrowser} from './failure-snapshot-browser.mjs';

test('failure snapshots are separately stored, masked, private, portable and erasable without altering evidence',{timeout:120000},async()=>{
 const f=await fixture(),previous=process.env.UPTIME_CREDENTIAL_DIR;let receiving;
 try{
  const token=randomBytes(24).toString('hex'),cookie=randomBytes(20).toString('hex'),email=randomUUID()+'@customer.example.test',mask='InternalOrder-'+randomUUID();
  const secrets=[token,cookie,email,mask],directory=join(f.directory,'credentials');await mkdir(directory,{mode:0o700});process.env.UPTIME_CREDENTIAL_DIR=directory;
  f.modes.headers={'content-type':'text/html','set-cookie':`session=${cookie}`,'x-api-key':token};
  f.modes.body=`<h1>Service Unavailable</h1><script>window.snapshotExecuted=true</script><img src="https://snapshot-attacker.example.test/leak"> Authorization: Bearer ${token}\nCookie: session=${cookie}\nemail=${email}\norder=${mask}\nVisible diagnostic marker\n`+'Upstream checkout-api connection refused. Request correlation unavailable.\n'.repeat(300);
  const monitor=await f.monitor({name:'Production checkout API',runners:[f.first],canary:true,request:{credentialRef:'checkout-api'},url:`http://93.184.216.34:${f.port}/target?trace=${randomUUID()}`});
  await writeFile(join(directory,'checkout-api.json'),JSON.stringify({monitorId:monitor.id,origin:`http://93.184.216.34:${f.port}`,auth:{type:'bearer',token}}),{mode:0o600});
  const path=`/api/monitors/${monitor.id}/failure-snapshots`,policy=await f.request(path,{method:'PATCH',body:{version:0,retentionDays:90,masks:[mask]}});assert.equal(policy.status,200);
  const task=await f.claim(f.first),observation=await f.evidence(task);assert.equal(observation.outcome,'target_failure');assert.ok(observation.failureSnapshot);assert.equal(observation.failureSnapshot.bodyTruncated,true);
  for(const secret of secrets)assert.ok(!JSON.stringify(observation.failureSnapshot).includes(secret),'capture removes planted values');
  const rejected=await f.submit(f.first,task,[{...observation,failureSnapshot:{...observation.failureSnapshot,status:200}}]);assert.equal(rejected.status,400);assert.equal((await f.request(path)).data.items.length,0);
  assert.equal((await f.submit(f.first,task,[observation])).status,200);assert.equal((await f.submit(f.first,task,[observation])).status,200);
  const snapshot=(await f.request(path)).data;assert.equal(snapshot.items.length,1);assert.equal(snapshot.items[0].snapshot.bodyTruncated,true);assert.equal(snapshot.items[0].snapshot.requestHeaders.authorization,'[redacted]');assert.equal(snapshot.items[0].snapshot.responseHeaders['set-cookie'],'[redacted]');
  const stored=await f.DB.prepare('SELECT evidence FROM observations WHERE id=?').bind(observation.id).first();assert.ok(!Object.hasOwn(JSON.parse(stored.evidence),'failureSnapshot'),'body is stored apart from observations');
  const unauthenticated=await fetch(f.origin+path);assert.equal(unauthenticated.status,401);assert.equal((await fetch(f.origin+path,{headers:{'x-runner-id':f.first.runnerId,'x-runner-key':f.first.key}})).status,401);
  const stateRecord=(await f.DB.prepare('SELECT state FROM monitors WHERE id=?').bind(monitor.id).first()).state;const state=await f.state(monitor.id);assert.equal(state.targetState,'Failing');const incidents=(await f.request(`/api/monitors/${monitor.id}/incidents`)).data;assert.equal(incidents.length,1);
  const detail=(await f.request(`/api/v1/incidents/${incidents[0].trigger.id}`)).data;assert.equal(detail.failureSnapshots.items.length,1);
  const archive=(await f.request('/api/archive')).data;assert.equal(archive.payload.productTables.failure_snapshots.length,1);for(const secret of secrets)assert.ok(!JSON.stringify(archive).includes(secret),'portable snapshots contain no planted values');
  const eventRows=(await f.DB.prepare('SELECT event FROM outbox').all()).results;assert.ok(eventRows.every(row=>!row.event.includes('<h1>')),'notification context carries no excerpt');
  receiving=await fixture();assert.equal((await receiving.request('/api/restore',{body:{archive}})).status,200);assert.equal((await receiving.request(path)).data.items.length,1);assert.ok((await receiving.request('/api/overview')).data.monitors.every(m=>!m.definition.enabled));
  const corrupt=structuredClone(observation);corrupt.failureSnapshot.extra='foreign';assert.equal((await f.submit(f.first,task,[corrupt])).status,400);
  await snapshotBrowser(f,monitor,secrets);assert.equal((await f.request(path)).data.items.length,0);assert.equal((await f.DB.prepare('SELECT state FROM monitors WHERE id=?').bind(monitor.id).first()).state,stateRecord);
  // Erasure fences the old snapshot even when the monitor and observation remain.
  const journal=(await f.request('/api/erasure-journal')).data;const fresh=await fixture();try{assert.equal((await fresh.request('/api/restore',{body:{archive,laterJournal:journal}})).status,400)}finally{await fresh.close()}
  const erased=await receiving.request(`/api/monitors/${monitor.id}/erase`,{body:{name:monitor.definition.name}});assert.equal(erased.status,200);assert.equal(erased.data.receipt.counts.failure_snapshots,1);
 }finally{if(previous===undefined)delete process.env.UPTIME_CREDENTIAL_DIR;else process.env.UPTIME_CREDENTIAL_DIR=previous;await receiving?.close();await f.close()}
});


test('a cross-origin failure snapshot masks earlier request authority without forwarding it',{timeout:30000},async()=>{
 const f=await fixture(),previous=process.env.UPTIME_CREDENTIAL_DIR,token=randomBytes(24).toString('hex'),seen=[];let receiver,original;
 try{
  receiver=http.createServer((req,res)=>{seen.push(Boolean(req.headers.authorization));if(req.url==='/start'){res.writeHead(302,{location:`http://93.184.216.37:${receiver.address().port}/${token}`});res.end()}else{res.writeHead(503,{'content-type':'text/html'});res.end(`<div>${token}</div>`)}});await new Promise(r=>receiver.listen(0,'127.0.0.1',r));
  const port=receiver.address().port;original=http.request;http.request=function(options,...args){return original.call(this,['93.184.216.36','93.184.216.37'].includes(options?.hostname)?{...options,hostname:'127.0.0.1'}:options,...args)};
  const monitor=await f.monitor({runners:[f.first],canary:true,url:`http://93.184.216.36:${port}/start`,request:{credentialRef:'redirect-auth'}});
  const directory=join(f.directory,'redirect-credentials');await mkdir(directory,{mode:0o700});process.env.UPTIME_CREDENTIAL_DIR=directory;await writeFile(join(directory,'redirect-auth.json'),JSON.stringify({monitorId:monitor.id,origin:`http://93.184.216.36:${port}`,auth:{type:'bearer',token}}),{mode:0o600});
  const task=await f.claim(f.first),observation=await f.evidence(task);assert.equal(observation.outcome,'target_failure');assert.deepEqual(seen,[true,false]);assert.ok(!JSON.stringify(observation.failureSnapshot).includes(token),'redirected evidence must mask authority sent to an earlier origin');assert.equal((await f.submit(f.first,task,[observation])).status,200);
 }finally{if(original)http.request=original;if(previous===undefined)delete process.env.UPTIME_CREDENTIAL_DIR;else process.env.UPTIME_CREDENTIAL_DIR=previous;await closeServer(receiver);await f.close()}
});
