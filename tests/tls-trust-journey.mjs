import assert from 'node:assert/strict';
import {authFixture} from './tls-auth-support.mjs';
import {fixture} from './resilience/support.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function tlsTrustJourney(){
 let edge,receiving;
 try{
  edge=await authFixture((record,res)=>{
   if(record.url==='/cross'){res.writeHead(302,{location:edge.url('/back','auth.example.test')});res.end();return}
   if(record.url==='/back'){res.writeHead(302,{location:edge.url('/health')});res.end();return}
   res.end('operational');
  });const {f,certs,create,claim,run,submit,url,records}=edge;
  const before=Number((await f.DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n);
  for(const tlsTrust of [{mode:'ignore'},{mode:'ignore',acknowledged:true,allowCredentials:true},{mode:'fingerprint',sha256:'invalid'},{mode:'ca',certificate:certs.server.key}])assert.equal((await f.request('/api/monitors',{body:{name:'Refused trust',url:url(),tlsTrust}})).status,400);
  assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n),before);
  let monitor=await create({name:'Legacy checkout certificate',intervalMs:5000}),task=await claim(monitor.id),result=await run(task);
  assert.equal(result.outcome,'target_failure');assert.equal(result.checks[0].assertion,'tls');await submit(task,result);assert.equal((await f.state(monitor.id)).state,'Failing');
  const revision=(await f.request('/api/monitors/'+monitor.id,{method:'PATCH',body:{...monitor.definition,tlsTrust:{mode:'fingerprint',sha256:certs.fingerprint}}}));assert.equal(revision.status,200);monitor=revision.data;
  await sleep(Math.max(0,monitor.nextDue-Date.now()+10));task=await claim(monitor.id);result=await run(task);
  assert.equal(result.outcome,'pass');assert.equal(result.tlsTrust[0].bypassed,true);assert.deepEqual(result.tlsTrust[0].errors,['SELF_SIGNED_CERT_IN_CHAIN']);await submit(task,result);
  assert.equal((await f.state(monitor.id)).state,'Healthy');assert.match((await f.request('/api/overview')).data.alerts.find(a=>a.monitor_id===monitor.id&&a.kind==='recovery').event.explanation,/different HTTPS certificate trust policy/);
  const missing=structuredClone(result);delete missing.tlsTrust;assert.equal((await f.submit(f.first,task,[{...missing,attempt:0,canary:await edge.canary(task)}])).status,400);
  edge.server.setSecureContext({...certs.rotated,ca:certs.ca});
  const row=await f.DB.prepare('SELECT next_due FROM monitors WHERE id=?').bind(monitor.id).first();await sleep(Math.max(0,row.next_due-Date.now()+10));task=await claim(monitor.id);result=await run(task);
  assert.equal(result.outcome,'target_failure');assert.ok(result.tlsTrust[0].errors.includes('TLS_FINGERPRINT_MISMATCH'));assert.notEqual(result.tlsTrust[0].sha256,certs.fingerprint);await submit(task,result);assert.equal((await f.state(monitor.id)).state,'Failing');await f.pause(monitor);
  edge.server.setSecureContext({...certs.server,ca:certs.ca});
  for(const tlsTrust of [{mode:'ca',certificate:certs.ca},{mode:'ignore',acknowledged:true}]){
   const m=await create({name:'Reviewed '+tlsTrust.mode,tlsTrust});const t=await claim(m.id),r=await run(t);assert.equal(r.outcome,'pass');assert.equal(r.tlsTrust[0].mode,tlsTrust.mode);assert.equal(r.tlsTrust[0].bypassed,true);await submit(t,r);await f.pause(m);
  }
  edge.server.setSecureContext(certs.selfSigned);
  for(const tlsTrust of [undefined,{mode:'fingerprint',sha256:certs.selfSignedFingerprint},{mode:'ignore',acknowledged:true}]){
   const m=await create({name:'Self-signed '+(tlsTrust?.mode??'default'),...(tlsTrust?{tlsTrust}:{})}),t=await claim(m.id),r=await run(t);
   assert.equal(r.outcome,tlsTrust?'pass':'target_failure');if(tlsTrust)assert.deepEqual(r.tlsTrust[0].errors,['DEPTH_ZERO_SELF_SIGNED_CERT']);else assert.equal(r.checks[0].assertion,'tls');await submit(t,r);await f.pause(m);
  }
  edge.server.setSecureContext({...certs.server,ca:certs.ca});
  const authorized=await create({name:'Credential trust consent',url:url('/cross'),method:'POST',request:{credentialRef:'trust'},tlsTrust:{mode:'ignore',acknowledged:true}}),t=await claim(authorized.id);
  const credential={monitorId:authorized.id,origin:new URL(url()).origin,headers:{'x-private':'trust-private-sentinel'},body:'private-request-body'};
  await edge.write('trust',credential);const start=records.length;result=await run(t);assert.equal(result.outcome,'runner_error');assert.equal(result.checks[0].assertion,'credential');assert.equal(records.length,start);
  await edge.write('trust',{...credential,allowUnverifiedTls:true});result=await run(t);assert.equal(result.outcome,'target_failure');assert.equal(result.checks[0].assertion,'tls');
  const sent=records.slice(start);assert.equal(sent.length,2);assert.equal(sent[0].headers['x-private'],'trust-private-sentinel');assert.equal(sent[1].headers['x-private'],undefined);assert.equal(sent[1].body,'');assert.equal(sent[1].method,'GET');assert.equal(result.tlsTrust[0].mode,'ignore');assert.equal(result.tlsTrust[1].mode,'default');await submit(t,result);await f.pause(authorized);
  for(const [source,text] of [
   ['uptimerobot',JSON.stringify({data:[{id:46,friendlyName:'Imported legacy gateway',type:'HTTP',url:url(),interval:60,checkSSLErrors:false}],nextLink:null})],
   ['pingdom',JSON.stringify({check:{id:47,name:'Pingdom legacy gateway',hostname:'legacy.example.test',resolution:1,type:{http:{url:'/health',port:edge.server.address().port,encryption:true,verify_certificate:false,requestheaders:{'x-api-key':'source-secret-sentinel'}}}}})],
  ]){
   const input=JSON.parse(text),preview=await f.request('/api/definitions/preview?source='+source,{body:input});assert.equal(preview.status,200);assert.equal(preview.data.entries[0].target.tlsTrust.mode,'ignore');if(source==='pingdom')assert.equal(preview.data.entries[0].target.credentialRef,'pingdom-47');assert.ok(!JSON.stringify(preview.data).includes('source-secret-sentinel'));
   const applied=await f.request('/api/definitions/apply?source='+source+'&digest='+preview.data.digest,{body:input});assert.equal(applied.status,201,JSON.stringify(applied.data));
  }
  const archive=await f.request('/api/archive');assert.equal(archive.status,200);for(const secret of ['trust-private-sentinel','private-request-body','allowUnverifiedTls','source-secret-sentinel'])assert.ok(!JSON.stringify(archive.data).includes(secret));
  receiving=await fixture();assert.equal((await receiving.request('/api/restore',{body:archive.data})).status,200);const restored=await receiving.request('/api/overview');assert.ok(restored.data.monitors.every(m=>m.state.state==='Paused'));assert.ok(restored.data.monitors.some(m=>m.definition.tlsTrust?.mode==='ca'));
 }finally{await receiving?.close();await edge?.close()}
}
