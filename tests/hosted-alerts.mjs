import {completeSecondFactor} from './mfa-auth-support.mjs';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
// A hosted install with no private runner: HTTP setup -> real scheduled handler -> webhook and Slack receivers.
// Only public DNS/HTTP network edges are faked.
const directory=await mkdtemp(join(tmpdir(),'uptime-hosted-alerts-')),origin='https://uptime.example.test';
const headerSecret=randomBytes(32).toString('hex');
const received=[];let requests=0;
let worker;
try{
 worker=await hostedRuntime(directory,{...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-provider-key'},async request=>{
  requests++;const url=new URL(request.url);if(url.hostname==='api.sendgrid.com')return new Response(null,{status:202});
  if(url.origin==='https://cloudflare-dns.com'){
   const name=url.searchParams.get('name'),a=url.searchParams.get('type')==='A';
   return Response.json(['gone.example.test','synthetic-uptime-401.test'].includes(name)?{Status:3}:{Status:0,Answer:[{type:a?1:28,data:a?'93.184.215.14':'2606:2800:21f:cb07:6820:80da:af6b:8b2c'}]});
  }
  if(['https://hooks.example.com','https://hooks.slack.com'].includes(url.origin)){
   received.push({origin:url.origin,url:request.url,method:request.method,headers:Object.fromEntries(request.headers),body:await request.text()});
   return new Response('ok',{status:200});
  }
  assert.ok(url.origin==='https://example.com'||url.hostname.endsWith('.example.test'),'only declared targets and receivers leave the Worker');
  return url.hostname==='down.example.test'?new Response('maintenance',{status:503}):new Response('service ready',{status:200,headers:{'content-type':'text/plain'}});
 });
 const db=await worker.getD1Database('DB');
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const call=(path,body,cookie,method=body===undefined?'GET':'POST')=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method,headers:{host:'uptime.example.test',origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const scheduled=async()=>{const response=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(response.status,204,await response.text())};
 const owner=await call('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Owner'});assert.equal(owner.status,303,await owner.clone().text());
 const cookie=owner.headers.get('set-cookie').split(';')[0],json=async response=>{assert.ok(response.ok,await response.clone().text());return response.json()};
 await completeSecondFactor(origin,cookie,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),cookie));
 // DIAG-001: hosted DNS retains the failure with explicitly unavailable socket/route evidence.
 const dnsCreated=await call('/api/monitors',{name:'synthetic-uptime-401',type:'dns',dns:{name:'synthetic-uptime-401.test',resolvers:['cloudflare']},intervalMs:60000,retries:0,confirmSlots:1,recoverSlots:1},cookie);
 assert.equal(dnsCreated.status,201,await dnsCreated.clone().text());const dnsMonitor=await dnsCreated.json();
 await scheduled();
 const retained=await call('/api/monitors/'+dnsMonitor.id+'/failure-snapshots',undefined,cookie);assert.equal(retained.status,200);
 const diagnostic=(await retained.json()).items[0].snapshot.diagnostics;
 assert.equal(diagnostic.category,'dns');assert.equal(diagnostic.route.reason,'hosted-transport');assert.deepEqual(diagnostic.route.hops,[]);
 for(const phase of ['dnsMs','connectMs','tlsMs','ttfbMs'])assert.equal(diagnostic.phases[phase],null);
 assert.equal((await call('/api/monitors/'+dnsMonitor.id,{...dnsMonitor.definition,enabled:false},cookie,'PATCH')).status,200);
 const webhook=await json(await call('/api/notifications/destinations',{name:'Receiver',kind:'webhook',url:'https://hooks.example.com/uptime'},cookie));
 await json(await call('/api/notifications/destinations',{name:'Team channel',kind:'slack',url:'https://hooks.slack.com/services/T000/B000/XXXX'},cookie));
 const down=await json(await call('/api/monitors',{name:'Down service',url:'https://down.example.test/health',retries:0,confirmSlots:1,recoverSlots:1},cookie));
 const gone=await json(await call('/api/monitors',{name:'Lapsed domain',url:'https://gone.example.test/',retries:0,confirmSlots:1,recoverSlots:1},cookie));

 await scheduled();
 const overview=await json(await call('/api/overview',undefined,cookie)),state=id=>overview.monitors.find(m=>m.id===id).state;
 assert.equal(state(down.id).targetState,'Failing');assert.equal(state(gone.id).targetState,'Failing','a name that does not resolve is a target outage');
 const [goneCheck]=(await json(await call(`/api/monitors/${gone.id}/history`,undefined,cookie)))[0].observations;
 assert.equal(goneCheck.outcome,'target_failure');assert.equal(goneCheck.checks[0].assertion,'unresolved');assert.match(goneCheck.checks[0].reason,/NXDOMAIN/);
 // The Worker sent each trigger to both receivers in the same run, in the runner's signed and Slack formats.
 const hooks=received.filter(r=>r.origin==='https://hooks.example.com'),slack=received.filter(r=>r.origin==='https://hooks.slack.com');
 assert.equal(hooks.length,2);assert.equal(slack.length,2);
 for(const hook of hooks){
  const expected=createHmac('sha256',webhook.signingSecret).update(`${hook.headers['x-lamp-timestamp']}.${hook.body}`).digest('base64url');
  assert.equal(hook.headers['x-lamp-signature'],expected,'webhook carries the destination signature');
  const event=JSON.parse(hook.body);assert.equal(event.kind,'trigger');assert.ok([down.id,gone.id].includes(event.monitorId));
 }
 for(const message of slack)assert.ok(JSON.parse(message.body).text,'Slack incoming-webhook message');
 const notes=(await json(await call('/api/notifications',undefined,cookie)));
 assert.deepEqual(notes.deliveries.map(d=>d.state),['accepted','accepted','accepted','accepted']);
 assert.equal(notes.runnerContact.state,'Never seen','Worker checks and sends are not runner contact');

 // Nothing is sent twice: a later run finds no queued work.
 await scheduled();assert.equal(received.length,4);

 // Custom query requests use the same hosted claim and attempt boundary, without a private runner.
 const custom=await json(await call('/api/notifications/destinations',{name:'Custom query receiver',kind:'webhook',enabled:false,url:'https://hooks.example.com/custom?tenant=hosted-private',webhookTemplate:{version:1,method:'GET',mode:'query',template:{name:'{{monitor.name}}',kind:'{{alert.name}}'},headerNames:['X-Api-Key']},webhookHeaders:{'X-Api-Key':headerSecret}},cookie));
 await json(await call(`/api/notifications/destinations/${custom.id}/test`,{},cookie));await scheduled();
 const sent=received.at(-1);assert.equal(received.length,5);assert.equal(sent.method,'GET');assert.equal(sent.body,'');assert.equal(new URL(sent.url).searchParams.get('kind'),'Test');assert.equal(sent.headers['x-api-key'],headerSecret);assert.equal(sent.headers['x-uptime-signature-input'],'query');
 assert.equal(sent.headers['x-lamp-signature'],createHmac('sha256',custom.signingSecret).update(sent.headers['x-lamp-timestamp']+'.'+new URL(sent.url).search.slice(1)).digest('base64url'));
 const customNotes=await json(await call('/api/notifications',undefined,cookie));assert.equal(customNotes.deliveries.find(d=>d.destinationId===custom.id).status,200);assert.ok(!JSON.stringify(customNotes).includes(headerSecret));

 // Twelve healthy one-minute monitors exceed one run's check budget: the rest wait, unclaimed and unfailed, for the next run.
 const services=[];for(let index=0;index<12;index++)services.push(await json(await call('/api/monitors',{name:`Service ${index}`,url:`https://service-${index}.example.test/health`},cookie)));
 const histories=async()=>Promise.all(services.map(async m=>json(await call(`/api/monitors/${m.id}/history`,undefined,cookie))));
 requests=0;await scheduled();
 assert.ok(requests<=35,`one run's checks made ${requests} outbound requests`);
 let checked=(await histories()).filter(h=>h.length);
 assert.ok(checked.length>0&&checked.length<12,`checked ${checked.length} of 12 in the first run`);
 requests=0;await scheduled();assert.ok(requests<=35);
 checked=await histories();
 assert.ok(checked.every(h=>h.length===1&&h[0].observations.every(o=>o.outcome==='pass')),'deferred monitors ran next, and nothing was recorded as a failure');
 console.log('PASS hosted Worker sends webhook and Slack alerts without a runner, fails unresolved names and defers checks beyond its request budget');
 // The same public notification door in demo mode reports acceptance without sending to recipients.
 await worker.dispose();worker=null;let demoSends=0;await mkdir(join(directory,'demo'));
 worker=await hostedRuntime(join(directory,'demo'),{...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,RER_DEMO:'1'},request=>{
  if(request.method!=='GET'){demoSends++;throw Error('Demo notification reached the network edge')}
  const url=new URL(request.url);
  return url.origin==='https://cloudflare-dns.com'?Response.json({Status:0,Answer:[{type:1,data:'93.184.215.14'}]}):new Response('service ready',{status:200});
 });
 const demoDB=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await demoDB.prepare(sql).run();
 const demoOwner=await call('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Demo owner'});assert.equal(demoOwner.status,303);
 const demoCookie=demoOwner.headers.get('set-cookie').split(';')[0];
 await completeSecondFactor(origin,demoCookie,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),demoCookie));
 const demoDestination=(await json(await call('/api/notifications',undefined,demoCookie))).destinations.find(d=>d.kind==='webhook');assert.ok(demoDestination);
 const demoDelivery=await json(await call(`/api/notifications/destinations/${demoDestination.id}/test`,{},demoCookie));
 await scheduled();
 const demoNotes=await json(await call('/api/notifications',undefined,demoCookie));
 assert.equal(demoNotes.deliveries.find(d=>d.id===demoDelivery.deliveryId)?.state,'accepted');assert.equal(demoSends,0,'demo acceptance conveys no external recipient delivery');

}finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
