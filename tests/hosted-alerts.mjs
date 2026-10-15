import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
// A hosted install with no private runner: HTTP setup -> real scheduled handler -> webhook and Slack receivers.
// Only public DNS/HTTP network edges are faked.
const directory=await mkdtemp(join(tmpdir(),'uptime-hosted-alerts-')),origin='https://uptime.example.test';
const received=[];let requests=0;
let worker;
try{
 worker=await hostedRuntime(directory,{...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-provider-key'},async request=>{
  requests++;const url=new URL(request.url);
  if(url.origin==='https://cloudflare-dns.com'){
   const name=url.searchParams.get('name'),a=url.searchParams.get('type')==='A';
   return Response.json(name==='gone.example.test'?{Status:3}:{Status:0,Answer:[{type:a?1:28,data:a?'93.184.215.14':'2606:2800:21f:cb07:6820:80da:af6b:8b2c'}]});
  }
  if(['https://hooks.example.com','https://hooks.slack.com'].includes(url.origin)){
   received.push({origin:url.origin,headers:Object.fromEntries(request.headers),body:await request.text()});
   return new Response('ok',{status:200});
  }
  assert.ok(url.origin==='https://example.com'||url.hostname.endsWith('.example.test'),'only declared targets and receivers leave the Worker');
  return url.hostname==='down.example.test'?new Response('maintenance',{status:503}):new Response('service ready',{status:200,headers:{'content-type':'text/plain'}});
 });
 const db=await worker.getD1Database('DB');
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const call=(path,body,cookie)=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method:body===undefined?'GET':'POST',headers:{host:'uptime.example.test',origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const scheduled=async()=>{const response=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(response.status,204,await response.text())};
 const owner=await call('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Owner'});assert.equal(owner.status,303,await owner.clone().text());
 const cookie=owner.headers.get('set-cookie').split(';')[0],json=async response=>{assert.ok(response.ok,await response.clone().text());return response.json()};
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
}finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
