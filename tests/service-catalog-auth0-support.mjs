// RL-101 through the owner API and the production signed runner. Only DNS and
// the provider TLS socket terminate at a controlled network edge.
import assert from 'node:assert/strict';
import https from 'node:https';
import {Resolver} from 'node:dns/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture,closeServer} from './resilience/support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {authRequest,sessionCookie,deliveredLink,emailSignIn} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
const TENANT='synthetic-uptime-1.us.auth0.com',CHANGED='synthetic-uptime-2.eu.auth0.com';
const HOST='status.auth0.com',ENDPOINT=`https://${HOST}/rss`;
const rss=title=>`<?xml version="1.0"?><rss version="2.0"><channel><title>Auth0 status</title>${title===null?'':`<item><title>${title}</title></item>`}</channel></rss>`;
const wait=async read=>{const until=Date.now()+30000;for(;;){const value=await read();if(value)return value;assert.ok(Date.now()<until,'real signed runner finishes the reviewed check');await new Promise(resolve=>setTimeout(resolve,50))}};
async function auth0Edge(directory){
 const key=join(directory,'auth0-key.pem'),cert=join(directory,'auth0-cert.pem');
 const child=spawn('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj',`/CN=${HOST}`,'-addext',`subjectAltName=DNS:${HOST}`],{stdio:'ignore'});
 assert.equal((await once(child,'exit'))[0],0);
 const tls={key:await readFile(key),cert:await readFile(cert)},requests=[],lookups=[],state={mode:'ambiguous'},streams=[];
 const server=https.createServer(tls,(req,res)=>{
  const record={host:req.headers.host,path:req.url,method:req.method,headers:req.headers,servername:req.socket.servername,body:''};requests.push(record);
  req.on('data',chunk=>{record.body+=chunk});
  if(state.mode==='drop'){res.destroy();return}
  if(state.mode==='non-200'){res.writeHead(400);res.end('check your domain parameter synthetic-uptime-9');return}
  if(state.mode==='redirect'){res.writeHead(302,{location:'https://arbitrary.example.test/?domain='+CHANGED});res.end();return}
  res.writeHead(200,{'content-type':'application/rss+xml'});
  if(state.mode==='timeout'){
   const stream={closed:false};streams.push(stream);res.on('close',()=>{stream.closed=true});
   res.write('<?xml version="1.0"?><rss><channel>');return;
  }
  if(state.mode==='oversized'){
   const stream={sent:0,closed:false,total:32*1024*1024};streams.push(stream);res.on('close',()=>{stream.closed=true});
   res.write('<?xml version="1.0"?><rss><channel>');const chunk='<item><title>synthetic-uptime-1</title></item>'.repeat(256);
   const pump=()=>{while(stream.sent<stream.total&&!res.destroyed){stream.sent+=Buffer.byteLength(chunk);if(!res.write(chunk)){res.once('drain',pump);return}}if(!res.destroyed)res.end('</channel></rss>')};pump();return;
  }
  res.end(state.mode==='malformed'?'<rss><channel><item>broken':rss(state.mode==='empty'?null:state.mode==='operational'?'All Systems Operational':'Investigating tenant service disruption'));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port,original=https.request,resolve4=Resolver.prototype.resolve4,resolve6=Resolver.prototype.resolve6;
 Resolver.prototype.resolve4=async function(host){lookups.push(host);if(host===HOST){if(state.mode==='private')return ['127.0.0.1'];return ['93.184.216.37']}return resolve4.call(this,host)};
 Resolver.prototype.resolve6=async function(host){lookups.push(host);if(host===HOST)return [];return resolve6.call(this,host)};
 https.request=function(options,...args){
  assert.equal(options?.hostname,'93.184.216.37','only the admitted official source reaches a provider socket');
  assert.equal(options.rejectUnauthorized,true);assert.equal(options.servername,HOST);assert.equal(options.headers.host,HOST);
  return original.call(this,{...options,hostname:'127.0.0.1',port,ca:tls.cert},...args);
 };
 return {state,requests,lookups,streams,async close(){https.request=original;Resolver.prototype.resolve4=resolve4;Resolver.prototype.resolve6=resolve6;await closeServer(server)}};
}
export async function proveAuth0Egress(){
 const g=await fixture(),edge=await auth0Edge(g.directory);let restarted;
 const ownerCookie=await emailSignIn(g.origin,{bindings:g.bindings});
 const request=(path,body,options={})=>g.request(path,{body,headers:{cookie:ownerCookie},...options});
 const ok=async(path,body)=>{const response=await request(path,body);assert.ok(response.status<300,`${path}: ${response.status} ${JSON.stringify(response.data)}`);return response.data};
 const invite=async(role,index)=>{
  const email=[`synthetic-uptime-${index}`,'example.test'].join('@');
  await ok('/api/access/invitations',{email,displayName:`Synthetic Uptime ${role}`,role});
  const call=authRequest(g.origin),link=await deliveredLink(call,{email,kind:'invite'});
  const cookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
  await completeSecondFactor(g.origin,cookie);
  const self=await request('/api/access/self',undefined,{headers:{cookie}});assert.equal(self.status,200);
  return {cookie,id:self.data.id};
 };
 const input={entry:'auth0',scope:'whole',tenantDomain:TENANT};
 const restart=async()=>{await (restarted??g.worker).dispose();restarted=await startLocalWorker({persist:g.directory,port:Number(new URL(g.origin).port),bindings:g.bindings,cf:{}});g.DB=await restarted.getD1Database('DB')};
 const rows=async sql=>(await g.DB.prepare(sql).all()).results;
 const jobCount=async()=>Number((await g.DB.prepare('SELECT COUNT(*) n FROM discovery_jobs').first()).n);
 const application=async id=>({monitor:await g.DB.prepare('SELECT * FROM monitors WHERE id=?').bind(id).first(),
  revisions:await rows('SELECT * FROM revisions ORDER BY rowid'),slots:await rows('SELECT * FROM slots ORDER BY rowid'),observations:await rows('SELECT * FROM observations ORDER BY rowid'),
  outbox:await rows('SELECT * FROM outbox ORDER BY rowid'),jobs:await rows('SELECT * FROM notification_jobs ORDER BY rowid')});
 try{
  assert.equal((await request('/api/runners/'+g.second.runnerId,undefined,{method:'DELETE'})).status,200);
  // A populated, healthy application is held away from the schedule while the
  // catalog checks run; its retained health and evidence must stay byte-exact.
  await ok('/api/external-check',{url:`http://93.184.216.35:${g.port}/canary`});g.modes.target=200;
  const app=await g.monitor({runners:[g.first]});await g.run(g.first);assert.equal((await g.state(app.id)).state,'Healthy');
  await g.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now()+3600000,app.id).run();
  const before=await application(app.id),jobsBefore=await jobCount();
  const catalog=await ok('/api/service-catalog?q=auth0');assert.equal(catalog.entries[0].followable,false);
  const review=await ok('/api/service-catalog/checks',input);
  assert.equal(review.status,'review_required');assert.equal(review.disclosure.provider,'Auth0');assert.equal(review.disclosure.endpoint,ENDPOINT);
  assert.equal(review.disclosure.tenantDomain,TENANT);assert.equal(review.disclosure.url,ENDPOINT+'?domain='+TENANT);assert.equal(review.disclosure.method,'GET');
  assert.match(review.disclosure.data.join(' '),/tenant domain.*domain query parameter/);assert.match(review.disclosure.data.join(' '),/Request time.*source address/);
  assert.equal(await jobCount(),jobsBefore,'review queues no job');assert.equal(edge.lookups.length,0);assert.equal(edge.requests.length,0);
  for(const bad of [
   {...input,tenantDomain:undefined},{...input,tenantDomain:'https://'+TENANT},{...input,tenantDomain:TENANT+'?domain='+CHANGED},
   {...input,tenantDomain:'user:synthetic-uptime-1@'+TENANT},{...input,tenantDomain:[TENANT,CHANGED]},{...input,tenantDomain:'*.auth0.com'},
   {...input,tenantDomain:'arbitrary.example.test'},{...input,tenantDomain:TENANT+'.example.test'},{...input,tenantDomain:'127.0.0.1'},
   {...input,url:'https://arbitrary.example.test/'},{...input,endpoint:'https://arbitrary.example.test/'},{...input,headers:{authorization:'synthetic-uptime-1'}},
   {...input,domains:[TENANT,CHANGED]},{...input,consent:true},{...input,review:review.review,consent:false},
   {...input,tenantDomain:CHANGED,review:review.review,consent:true},{...input,review:review.review.slice(0,-1)+(review.review.endsWith('0')?'1':'0'),consent:true},
  ]){const response=await request('/api/service-catalog/checks',bad);assert.ok([400,409].includes(response.status),JSON.stringify(response.data));assert.ok(!JSON.stringify(response.data).includes('synthetic-uptime-9'))}
  assert.equal((await request('/api/service-catalog/checks?domain='+CHANGED,input)).status,400,'extra route queries cannot alter disclosure');
  assert.equal((await request('/api/service-catalog/checks',input,{headers:{cookie:''}})).status,401);
  assert.equal((await request('/api/service-catalog/checks',{...input,review:review.review,consent:true},{runner:g.first,headers:{cookie:''}})).status,401);
  assert.equal(await jobCount(),jobsBefore);assert.equal(edge.lookups.length,0);assert.equal(edge.requests.length,0,'nothing reaches the network before review confirmation');
  const admin=await invite('admin',1);
  for(const body of [input,{...input,review:review.review,consent:true}])assert.equal((await request('/api/service-catalog/checks',body,{headers:{cookie:admin.cookie}})).status,403,'a workspace admin cannot authorize this owner-data exception');
  const other=await invite('owner',2);
  assert.equal((await request('/api/service-catalog/checks',{...input,review:review.review,consent:true},{headers:{cookie:other.cookie}})).status,409,'another owner must review the disclosure themselves');
  assert.equal(await jobCount(),jobsBefore);assert.equal(edge.requests.length,0);
  // Review survives a genuine Worker restart; consent and the admitted job then
  // survive another restart, without changing the domain or endpoint.
  await restart();
  const job=await ok('/api/service-catalog/checks',{...input,review:review.review,consent:true});assert.equal(job.status,'queued');
  const queued=await ok('/api/discoveries/'+job.id);assert.equal(queued.url,ENDPOINT+'?domain='+TENANT);assert.equal(queued.spec.tenantDomain,TENANT);assert.equal(queued.spec.authorization.endpoint,ENDPOINT);assert.equal(queued.spec.authorization.consent,true);
  assert.equal(queued.spec.authorization.review,review.review);assert.ok(queued.initiatingOwnerId);assert.equal(edge.requests.length,0);
  await restart();assert.deepEqual((await ok('/api/discoveries/'+job.id)).spec,queued.spec);
  const complete=async id=>{
   const controller=new AbortController(),running=runRunner({origin:g.origin,key:g.first.key,runnerId:g.first.runnerId,localReview:true,signal:controller.signal,pollMs:50});
   try{return await wait(async()=>{const value=await ok('/api/discoveries/'+id);return ['done','failed'].includes(value.status)?value:null})}finally{controller.abort();await running}
  };
  const verifyRefusal=async(done,problem)=>{
   assert.equal(done.status,'done',done.error);assert.equal(done.networkLabel,g.first.networkLabel);assert.equal(done.result.ok,false);assert.equal(done.result.problem,problem);assert.deepEqual(done.result.targets,[]);assert.equal(done.result.requests,1);
   assert.deepEqual(done.result.authorization,done.spec.authorization);assert.ok(!JSON.stringify(done.result).includes('synthetic-uptime-9'),'raw provider content is withheld');
   assert.equal((await request('/api/service-follows',{check:done.id})).status,409,'unqualified or unusable Auth0 is never followed');
   const current=await ok('/api/service-catalog?q=auth0');assert.equal(current.entries[0].review.state,'needs_review');assert.deepEqual(current.entries[0].followed,[]);
   assert.deepEqual(await application(app.id),before,'provider checks cannot alter application evidence, health or notifications');
  };
  const first=await complete(job.id);await verifyRefusal(first,'shape');
  // A signed answer cannot swap the reviewed tenant or turn unqualified Auth0
  // into a successful provider claim. The refused answer changes no job fact.
  const hostile=await ok('/api/service-catalog/checks',{...input,review:review.review,consent:true});
  assert.equal((await request('/api/runner/discoveries/claim',{}, {runner:g.first})).data.job.id,hostile.id);
  const running=await ok('/api/discoveries/'+hostile.id),base={...first.result,authorization:running.spec.authorization};
  for(const result of [
   {...base,authorization:{...base.authorization,tenantDomain:CHANGED}},
   {...base,authorization:{...base.authorization,endpoint:'https://arbitrary.example.test/'}},
   {...base,ok:true,problem:null,detail:null,targets:[{scope:'whole',key:null,name:null,id:null,state:'operational',stated:'All Systems Operational'}]},
  ]){
   assert.equal((await request(`/api/runner/discoveries/${hostile.id}/result`,{result},{runner:g.first,signed:true})).status,400);
   assert.deepEqual(await ok('/api/discoveries/'+hostile.id),running);
  }
  assert.equal((await request('/api/discoveries/'+hostile.id,undefined,{method:'DELETE'})).status,200);
  assert.equal((await request(`/api/runner/discoveries/${job.id}/result`,{result:first.result},{runner:g.first,signed:true})).status,409,'completed signed results never replay');
  const otherReview=await request('/api/service-catalog/checks',input,{headers:{cookie:other.cookie}});assert.equal(otherReview.data.status,'review_required');
  const revoked=await request('/api/service-catalog/checks',{...input,review:otherReview.data.review,consent:true},{headers:{cookie:other.cookie}});assert.equal(revoked.data.status,'queued');
  assert.equal((await request('/api/access/members/'+other.id,undefined,{method:'DELETE'})).status,200);
  const beforeRevoked=edge.requests.length,stopped=await complete(revoked.data.id);assert.equal(stopped.status,'failed');assert.equal(stopped.stopReason,'initiator_revoked');assert.equal(edge.requests.length,beforeRevoked,'revoked owner authority cannot launch queued egress');
  assert.equal((await request('/api/service-catalog/checks',{...input,review:otherReview.data.review,consent:true},{headers:{cookie:other.cookie}})).status,401);

  for(const [mode,problem] of [['non-200','unreachable'],['malformed','shape'],['oversized','too-large'],['redirect','moved'],['empty','shape'],['operational','shape'],['drop','unreachable'],['timeout','unreachable'],['private','unreachable']]){
   edge.state.mode=mode;const next=await ok('/api/service-catalog/checks',{...input,review:review.review,consent:true});const done=await complete(next.id);await verifyRefusal(done,problem);
   if(mode==='timeout'){
    assert.match(done.result.detail,/did not answer in time/);
    await wait(()=>edge.streams.at(-1).closed);
    assert.deepEqual(await application(app.id),before,'a timed-out provider read cannot change application health');
   }
  }
  await restart();assert.deepEqual((await ok('/api/discoveries/'+job.id)).spec,queued.spec);await verifyRefusal(await ok('/api/discoveries/'+job.id),'shape');
  assert.equal((await request('/api/service-follows',{check:job.id,tenantDomain:CHANGED})).status,400,'persisted reuse cannot substitute a tenant');
  assert.equal((await request('/api/service-catalog/checks',{...input,tenantDomain:CHANGED,review:review.review,consent:true})).status,409);
  const beforeChanged=edge.requests.length,changedReview=await ok('/api/service-catalog/checks',{...input,tenantDomain:CHANGED});assert.equal(edge.requests.length,beforeChanged);
  edge.state.mode='ambiguous';const changed=await ok('/api/service-catalog/checks',{...input,tenantDomain:CHANGED,review:changedReview.review,consent:true});await verifyRefusal(await complete(changed.id),'shape');
  assert.deepEqual([...new Set(edge.lookups)],[HOST],'the tenant and redirect hosts are never looked up');
  const records=edge.requests;
  assert.ok(records.length>=8);assert.equal(records.filter(record=>new URL('https://'+HOST+record.path).searchParams.get('domain')===CHANGED).length,1);
  for(const record of records){
   const url=new URL('https://'+record.host+record.path);assert.equal(record.host,HOST);assert.equal(record.servername,HOST);assert.equal(record.method,'GET');assert.equal(url.pathname,'/rss');
   assert.deepEqual([...url.searchParams.keys()],['domain']);assert.ok([TENANT,CHANGED].includes(url.searchParams.get('domain')));assert.equal(record.body,'');
   assert.ok(Object.keys(record.headers).every(name=>['host','user-agent','accept','accept-encoding','connection'].includes(name)),'no owner-supplied or credential headers reach the provider');
   assert.equal(record.headers['accept-encoding'],'identity');
   assert.equal(record.headers.authorization,undefined);assert.equal(record.headers.cookie,undefined);assert.equal(record.headers.referer,undefined);
   for(const value of [g.first.key,g.bindings.SESSION_SECRET,g.cookie,ownerCookie])assert.ok(!JSON.stringify(record).includes(value),'runner and owner authority never reach Auth0');
  }
  assert.ok(edge.streams[0].closed&&edge.streams[0].sent<edge.streams[0].total,'the pinned reader closes the oversized source before its end');
  assert.deepEqual(await application(app.id),before);
 }finally{await restarted?.dispose();await edge.close();await g.close()}
}
