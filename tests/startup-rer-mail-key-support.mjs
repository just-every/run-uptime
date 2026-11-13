import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve,relative,dirname,parse} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {Miniflare,convertV4MiniflareOptions,Log,LogLevel} from 'miniflare';
import {runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';

// A separate migrated installation; the existing public-path fixtures and
// authentication helpers retain their own settings, state and assertions.
export async function proveRerMailKeyStartup(){
 const directory=await runtimeDirectory(),outbound=[],diagnostics=[],cases=[];
 const at=String.fromCharCode(64);
 const valid={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',RER_DEV_KEY:'synthetic-uptime-161-development-key',
  UPTIME_ORIGIN:'https://synthetic-uptime-161.example.test',
  SESSION_SECRET:'synthetic-uptime-161-session-secret',SETUP_TOKEN:'synthetic-uptime-161-bootstrap-secret',
  UPTIME_RUNNER_KEY:'synthetic-uptime-161-runner-key',
  OWNER_EMAIL:'synthetic-uptime-161-owner'+at+'example.test',
  MAIL_PROVIDER:'rer',MAIL_FROM:'synthetic-uptime-161-sender'+at+'example.test',
  MAIL_RELAY_URL:'https://synthetic-uptime-161-relay.example.test/',MAIL_API_KEY:'synthetic-uptime-161-mail-key'};
 // Request authority is deliberately independent of the bindings under test.
 const requestOrigin='https://synthetic-uptime-161.example.test',host='synthetic-uptime-161.example.test';
 const planted='synthetic-uptime-161-planted key';
 let worker,DB;
 class CapturedLog extends Log{log(message){diagnostics.push(String(message))}}
 async function start(bindings){
  const emitted=resolve('./dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
  const wrapper=join(directory,'mail-key-envelope.mjs');
  await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};
   export default {async fetch(request,env,ctx){const input=await request.json();
   return app.fetch(new Request(input.url,{method:input.method,headers:input.headers,...(input.body===undefined?{}:{body:input.body})}),env,ctx)}};`);
  const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},
   ...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))];
  worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,
   compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,host:'127.0.0.1',port:0,
   assets:{directory:resolve(emitted,config.assets.directory),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true},
   d1Databases:{DB:'startup-rer-mail-key'},resourcePersistencePath:join(directory,'state'),bindings,
   cf:{},unsafeLocalExplorer:false,unsafeObservability:false,log:new CapturedLog(LogLevel.VERBOSE),
   handleStructuredLogs:entry=>diagnostics.push(JSON.stringify(entry)),
   outboundService:request=>{outbound.push({method:request.method,url:request.url});return new Response(null,{status:502})}}));
  await worker.ready;DB=await worker.getD1Database('DB');
 }
 async function stop(){await worker?.dispose();worker=undefined}
 const dispatch=async(url,options={})=>worker.dispatchFetch('http://localhost/',{
  method:'POST',headers:{'content-type':'application/json'},redirect:'manual',
  body:JSON.stringify({url,method:options.method??'GET',headers:{...Object.fromEntries(new Headers(options.headers)),host,'cf-connecting-ip':'192.0.2.161'},...(options.body===undefined?{}:{body:options.body})})});
 const call=authRequest(requestOrigin,dispatch);
 async function snapshot(){
  // D1 prohibits reading its platform-owned _cf_METADATA; every readable
  // durable table, including SQLite sequence state, is compared without exclusions.
  const tables=(await DB.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name <> '_cf_METADATA' ORDER BY name").all()).results;
  return Promise.all(tables.map(async({name,sql})=>({name,sql,rows:(await DB.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.map(row=>JSON.stringify(row)).sort()})));
 }
 const unchanged=async(before,label)=>assert.ok(isDeepStrictEqual(await snapshot(),before),label);
 function withheld(text){
  for(const value of [...Object.values(valid).filter(value=>typeof value==='string'),planted]){
   for(const encoded of new Set([value,value.trim(),encodeURIComponent(value),Buffer.from(value).toString('base64'),Buffer.from(value).toString('base64url'),JSON.stringify(value).slice(1,-1)]))
    if(encoded)assert.ok(!text.includes(encoded),'response and captured diagnostics withhold supplied binding values');
  }
 }
 const claimHeaders=id=>({'x-runner-key':valid.UPTIME_RUNNER_KEY,'x-runner-id':id});
 const noWork=async()=>{
  for(const table of ['monitors','slots','notification_jobs'])assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM "${table}"`).first()).n,0,'idle startup has no monitor, target or mail work');
  assert.equal(outbound.length,0,'independent outbound observer saw no mail or target request');
 };
 try{
  await start(valid);
  // Apply the real migrations independently of the parent journey.
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  sessionCookie(await call('/auth/bootstrap',{token:valid.SETUP_TOKEN,displayName:'Synthetic Uptime owner'}));
  const body={version:1},stamp=String(Date.now());
  const enrollment=await call('/api/runner/enroll',body,{'x-runner-key':valid.UPTIME_RUNNER_KEY,'x-sent-at':stamp,
   'x-runner-signature':createHmac('sha256',valid.UPTIME_RUNNER_KEY).update(`${stamp}.runner-enrolment.${JSON.stringify(body)}`).digest('hex')});
  assert.equal(enrollment.status,200,'native signed enrollment establishes valid claim authority');
  const {runnerId}=await enrollment.json();assert.ok(runnerId);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM oa_bootstrap').first()).n,1,'permanent owner admission is populated before refusal');
  assert.ok((await DB.prepare('SELECT COUNT(*) n FROM oa_sessions').first()).n>0,'real session custody is populated before refusal');
  const healthy=await call('/health');assert.equal(healthy.status,200);await healthy.arrayBuffer();
  await noWork();
  // Retained completed custody is inert fixture data, with no job to send.
  await DB.prepare('INSERT INTO notification_claim_custody(claim,delivery_id,created_at,reservation_hash,started_at,released_at) VALUES(?,?,?,?,?,?)')
   .bind('synthetic-uptime-161-claim','synthetic-uptime-161-delivery',1,'synthetic-uptime-161-reservation',1,2).run();
  const initial=await snapshot();
  assert.ok(initial.find(row=>row.name==='notification_claim_custody').rows.length>0,'notification custody is populated before refusal');
  for(const [kind,value] of [['missing',undefined],['malformed',planted]]){
   await stop();const invalid={...valid};if(value===undefined)delete invalid.MAIL_API_KEY;else invalid.MAIL_API_KEY=value;
   await start(invalid);await unchanged(initial,'restart with invalid mail configuration preserves every durable table');
   const before=await snapshot(),records=[];
   for(const [path,payload,headers] of [['/health',undefined,{}],['/api/runner/claim',{},claimHeaders(runnerId)]]){
    const response=await call(path,payload,headers),text=await response.text();
    assert.equal(response.status,503,`${kind}: ${path} refuses invalid MAIL_API_KEY`);
    assert.match(text,/\bMAIL_API_KEY\b/,'configuration refusal names the conditional binding');
    assert.equal(response.headers.get('cache-control'),'no-store');withheld(text);
    await unchanged(before,'each refused door preserves every durable row, including admission and custody');
    await noWork();records.push({path,status:response.status,diagnostic:text});
   }
   withheld(diagnostics.join('\n'));
   await stop();await start(valid);await unchanged(before,'repair restarts against the same unmodified persistence');
   const health=await call('/health');assert.equal(health.status,200,'corrected synthetic mail key restores health');await health.arrayBuffer();
   const idle=await call('/api/runner/claim',{},claimHeaders(runnerId));assert.equal(idle.status,200,'corrected configuration admits the authenticated native claim');
   assert.equal((await idle.json()).task,null,'recovered runner is idle');
   const contact=await DB.prepare('SELECT last_contact_at FROM runners WHERE runner_id=?').bind(runnerId).first();assert.ok(contact.last_contact_at>0,'recovered authenticated claim records durable contact');
   const allowed=new Set(['public_rate_limits','runner_contact','runners']);
   assert.ok(isDeepStrictEqual((await snapshot()).filter(row=>!allowed.has(row.name)),before.filter(row=>!allowed.has(row.name))),'recovery preserves all other durable tables, including owner and notification custody');
   await noWork();withheld(diagnostics.join('\n'));
   cases.push({kind,refused:records,tablesCompared:before.length,healthAfter:health.status,claimAfter:idle.status,task:null,outboundRequests:outbound.length});
   // The next independent refusal starts with the latest valid contact state.
   initial.splice(0,initial.length,...await snapshot());
  }
  console.info('PROBE STARTUP-001 acceptance-1 MAIL_API_KEY: missing and whitespace-bearing rer key -> health and authenticated native claim 503, named value-free responses and captured diagnostics, every durable table unchanged, zero outbound requests');
  console.info('PROBE STARTUP-001 acceptance-2 MAIL_API_KEY: corrected synthetic key and restart with identical persistence -> health 200 and authenticated idle claim 200, no mail or target work');
  await stop();withheld(diagnostics.join('\n'));
  const receipt={cases,capturedDiagnostics:diagnostics,outboundRequests:outbound.length};
  console.info('STARTUP_RER_MAIL_KEY_PASS '+JSON.stringify(receipt));
  return receipt;
 }finally{await stop();await cleanupDirectory(directory)}
}
