import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';

// Requests retain their own valid origin and Host when the Worker binding is
// absent or malformed. Only the outbound network edge is substituted.
export async function proveWorkerOriginConfiguration(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-worker-origin-'));
 const requestOrigin='https://synthetic-uptime-158.example.test';
 const requestHost='synthetic-uptime-158.example.test';
 const valid={UPTIME_ORIGIN:requestOrigin,UPTIME_LOCAL_REVIEW:'false',
  OWNER_EMAIL:['synthetic-uptime-158','example.test'].join('@'),
  MAIL_FROM:['synthetic-uptime-158-mail','example.test'].join('@'),
  SESSION_SECRET:'synthetic-uptime-158-session-secret',SETUP_TOKEN:'synthetic-uptime-158-setup-token-unique',
  UPTIME_RUNNER_KEY:'synthetic-uptime-158-runner-key-unique',
  MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-158-mail-key'};
 const sentinel='synthetic-uptime-158-origin+ /?';
 const traffic=[];
 let worker,DB,preparing=true,cookie='';
 const start=async bindings=>{
  worker=await hostedRuntime(directory,bindings,async request=>{
   traffic.push({host:new URL(request.url).hostname,path:new URL(request.url).pathname,method:request.method});
   if(preparing&&new URL(request.url).hostname==='api.sendgrid.com'&&(await request.json()).subject==='Uptime second-factor security change')return new Response(null,{status:202});
   throw Error('Unexpected outbound request in Worker origin journey');
  });
  DB=await worker.getD1Database('DB');
 };
 const stop=async()=>{await worker?.dispose();worker=undefined};
 const call=(path,{method='GET',headers={},body}={})=>worker.dispatchFetch('http://localhost/',{
  method:'POST',redirect:'manual',headers:{'content-type':'application/json'},
  body:JSON.stringify({url:requestOrigin+path,method,headers:{host:requestHost,origin:requestOrigin,'cf-connecting-ip':'192.0.2.158',...headers},...(body===undefined?{}:{body})}),
 });
 const claim=()=>call('/api/runner/claim',{method:'POST',headers:{'content-type':'application/json','x-runner-key':valid.UPTIME_RUNNER_KEY},body:'{}'});
 async function snapshot(){
  // D1 reserves its own metadata; include every application table and sequence.
  const tables=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name <> '_cf_METADATA' ORDER BY name").all()).results;
  return Promise.all(tables.map(async({name})=>[name,(await DB.prepare(`SELECT * FROM "${name.replaceAll('"','""')}" ORDER BY rowid`).all()).results]));
 }
 const rows=(state,name)=>{const table=state.find(([table])=>table===name);assert.ok(table,`${name} is included in the durable snapshot`);return table[1]};
 function withheld(output,values){
  for(const value of values)for(const encoded of new Set([value,encodeURIComponent(value),encodeURI(value),Buffer.from(value).toString('base64'),Buffer.from(value).toString('base64url'),JSON.stringify(value).slice(1,-1)])){
   assert.ok(!output.includes(encoded),'diagnostics withhold supplied values and their encodings');
  }
 }
 try{
  await start(valid);
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const boot=await call('/auth/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:valid.SETUP_TOKEN,displayName:'synthetic-uptime-158-owner'})});
  assert.equal(boot.status,303);cookie=boot.headers.get('set-cookie').split(';')[0];await boot.arrayBuffer();
  await completeSecondFactor(requestOrigin,cookie,(url,init)=>call(new URL(url).pathname,init));
  const destination=await call('/api/notifications/destinations',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'synthetic-uptime-158-destination',kind:'webhook',url:'https://synthetic-uptime-158.example.com/hook'})});
  assert.equal(destination.status,201);await destination.arrayBuffer();
  const healthy=await call('/health');assert.equal(healthy.status,200);assert.equal((await healthy.json()).status,'ok');
  const idle=await claim();assert.equal(idle.status,200);assert.equal((await idle.json()).task,null);
  let initial=await snapshot();
  assert.equal(rows(initial,'oa_bootstrap').length,1,'preservation includes permanent owner admission');
  assert.equal(rows(initial,'oa_operators').length,1);assert.equal(rows(initial,'oa_sessions').length,1);
  assert.equal(rows(initial,'notification_credentials').length,1,'preservation includes real encrypted credential custody');
  assert.ok(rows(initial,'notification_credentials')[0].ciphertext);assert.equal(rows(initial,'notification_credentials')[0].endpoint,null);
  assert.equal(rows(initial,'runners').filter(row=>row.legacy_key===1).length,1);assert.equal(rows(initial,'monitors').length,0);
  assert.deepEqual(traffic,[{host:'api.sendgrid.com',path:'/v3/mail/send',method:'POST'}],'only explicit MFA enrollment sends a preparation message');
  preparing=false;traffic.length=0;
  for(const [kind,value] of [['missing',undefined],['malformed',requestOrigin+'/'+sentinel]]){
   await stop();
   const invalid={...valid};if(value===undefined)delete invalid.UPTIME_ORIGIN;else invalid.UPTIME_ORIGIN=value;
   await start(invalid);
   const before=await snapshot();assert.deepEqual(before,initial,'restart retains the complete prepared installation');
   for(const [door,request] of [['health',()=>call('/health')],['runner claim',claim]]){
    const response=await request();assert.equal(response.status,503,`${kind} UPTIME_ORIGIN refuses ${door}`);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const diagnostic=await response.text();
    assert.match(diagnostic,/Invalid or missing configuration: UPTIME_ORIGIN\b/,'the Worker names the missing or malformed binding');
    withheld(diagnostic,[...Object.values(valid),sentinel,...(value===undefined?[]:[value])]);
    assert.deepEqual(traffic,[],'faulty Worker configuration performs zero outbound requests');
    assert.deepEqual(await snapshot(),before,'each refused request preserves every durable table, including admission and credential custody');
   }
   console.info(`PROBE STARTUP-001 acceptance-1 UPTIME_ORIGIN ${kind}: emitted Worker health and authenticated native claim -> named value-free 503, zero outbound traffic, all ${before.length} durable tables unchanged`);
   await stop();await start(valid);
   assert.deepEqual(await snapshot(),before,'corrected Worker restarts against exactly the same persistence');
   const health=await call('/health');assert.equal(health.status,200);assert.equal((await health.json()).status,'ok');
   const claimResponse=await claim();assert.equal(claimResponse.status,200);const answer=await claimResponse.json();
   assert.equal(answer.task,null,'authenticated corrected claim has no target work');assert.ok(Number.isSafeInteger(answer.now));
   const after=await snapshot();
   // Readiness and authenticated contact may update their own admission counters
   // and contact timestamps; no other product or authority row may change.
   const unchanged=state=>state.filter(([name])=>!['public_rate_limits','runner_contact','runners'].includes(name));
   assert.deepEqual(unchanged(after),unchanged(before),'recovery preserves all other product, admission and custody rows');
   const oldRunner=rows(before,'runners').find(row=>row.legacy_key===1),runner=rows(after,'runners').find(row=>row.runner_id===oldRunner.runner_id);
   assert.deepEqual(rows(after,'runners').map(row=>row.runner_id===oldRunner.runner_id?{...row,last_contact_at:oldRunner.last_contact_at}:row),rows(before,'runners'),'restart preserves every runner identity and authority');
   assert.ok(runner.last_contact_at>=oldRunner.last_contact_at);
   assert.deepEqual(traffic,[],'health and the idle claim do not perform target or provider work');
   // The next fault must preserve the state left by this successful recovery.
   initial=after;
   console.info(`PROBE STARTUP-001 acceptance-2 UPTIME_ORIGIN ${kind}: corrected binding and same-persistence restart -> health 200, authenticated idle claim 200, original admission and custody retained, zero outbound traffic`);
  }
 }finally{await stop();await rm(directory,{recursive:true,force:true})}
}
