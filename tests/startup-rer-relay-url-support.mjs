import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,dirname,parse} from 'node:path';
import {Miniflare,convertV4MiniflareOptions,Log,LogLevel} from 'miniflare';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';

// One isolated installation: actual emitted application, independently migrated
// D1, persistent admission and custody, and an observed deny-all network edge.
export async function proveRerRelayUrlStartup(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-relay-'));
 const emitted=resolve('dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
 const origin='https://uptime.synthetic-uptime-163.test';
 const relay='https://relay.synthetic-uptime-163.test/mail';
 const sentinel='synthetic-uptime-163-planted-relay';
 const malformed=`http://relay.synthetic-uptime-163.test/${sentinel}`;
 const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,UPTIME_LOCAL_REVIEW:'false',
  MAIL_PROVIDER:'rer',MAIL_API_KEY:'synthetic-uptime-163-mail',MAIL_RELAY_URL:relay,
  UPTIME_RUNNER_KEY:'synthetic-uptime-163-runner-key'};
 delete bindings.RER_DEV_KEY;
 const outbound=[],diagnostics=[],receipts=[];
 let worker,DB;
 class CapturedLog extends Log{
  constructor(){super(LogLevel.VERBOSE)}
  log(message){diagnostics.push(String(message))}
 }
 const wrapper=join(directory,'envelope.mjs');
 await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};
 export default {async fetch(request,env,ctx){const input=await request.json();
 return app.fetch(new Request(input.url,{method:input.method,headers:input.headers,...(input.body===undefined?{}:{body:input.body})}),env,ctx)}};`);
 const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},
  ...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))];
 async function start(settings){
  worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,
   compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
   host:'127.0.0.1',port:0,log:new CapturedLog(),
   assets:{directory:resolve(emitted,config.assets.directory),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true},
   d1Databases:{DB:'startup-rer-relay-url'},resourcePersistencePath:join(directory,'state'),bindings:settings,
   unsafeLocalExplorer:false,unsafeObservability:false,
   outboundService:()=>{outbound.push('unexpected outbound request');return new Response(null,{status:502})}}));
  await worker.ready;DB=await worker.getD1Database('DB');
 }
 async function stop(){if(worker){await worker.dispose();worker=undefined}}
 // Request URL and Host never derive from the mail setting under test.
 const call=(path,{method='GET',body,headers={}}={})=>worker.dispatchFetch('http://localhost/',{
  method:'POST',headers:{'content-type':'application/json'},redirect:'manual',
  body:JSON.stringify({url:origin+path,method,headers:{host:new URL(origin).host,origin,
   'cf-connecting-ip':'192.0.2.163',...(body===undefined?{}:{'content-type':'application/json'}),...headers},
   ...(body===undefined?{}:{body:JSON.stringify(body)})})});
 async function snapshot(){
  const tables=(await DB.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name <> '_cf_METADATA' ORDER BY name").all()).results;
  // Include sequence tables; D1 forbids its private _cf_METADATA contents.
  // Sort row encodings so WITHOUT ROWID tables have the same coverage.
  return Promise.all(tables.map(async({name,sql})=>({name,sql,rows:(await DB.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.map(row=>JSON.stringify(row)).sort()})));
 }
 function valueFree(text){
  for(const value of [sentinel,malformed,...Object.values(bindings)]){
   if(value.length<8)continue;
   for(const encoded of new Set([value,encodeURIComponent(value),Buffer.from(value).toString('base64'),Buffer.from(value).toString('base64url'),JSON.stringify(value).slice(1,-1)])){
    assert.ok(!text.includes(encoded),'responses and captured diagnostics withhold supplied values');
   }
  }
 }
 const claim=()=>call('/api/runner/claim',{method:'POST',body:{},headers:{'x-runner-key':bindings.UPTIME_RUNNER_KEY}});
 try{
  await start(bindings);
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort()){
   for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  }
  // Admit a real owner without sending mail, then enroll the real runner. These
  // controls also establish valid settings before the two independent failures.
  const admitted=await call('/auth/bootstrap',{method:'POST',body:{token:bindings.SETUP_TOKEN,displayName:'Synthetic Uptime owner',returnTo:'/app'}});
  assert.equal(admitted.status,303,'native bootstrap admits the owner');await admitted.arrayBuffer();
  const body={version:1},stamp=String(Date.now());
  const enrolled=await call('/api/runner/enroll',{method:'POST',body,headers:{'x-runner-key':bindings.UPTIME_RUNNER_KEY,
   'x-sent-at':stamp,'x-runner-signature':createHmac('sha256',bindings.UPTIME_RUNNER_KEY).update(`${stamp}.runner-enrolment.${JSON.stringify(body)}`).digest('hex')}});
  assert.equal(enrolled.status,200,'native signed enrollment accepts valid runner authority');
  const registration=await enrolled.json();assert.equal(registration.scope,'self-runner');
  // Inert retained execution custody makes accidental cleanup observable. No
  // notification job or target is queued by these historical fixture rows.
  await DB.prepare('INSERT INTO notification_claim_custody(claim,delivery_id,created_at,reservation_hash,started_at,released_at) VALUES(?,?,?,?,?,?)')
   .bind('synthetic-uptime-163-claim','synthetic-uptime-163-delivery',1,'synthetic-uptime-163-reservation',1,2).run();
  const health=await call('/health');assert.equal(health.status,200);await health.arrayBuffer();
  const original=await snapshot();
  for(const name of ['oa_bootstrap','oa_operators','oa_sessions','public_rate_limits','notification_claim_custody','runners']){
   assert.ok(original.find(table=>table.name===name)?.rows.length,'admission, authority and custody fixtures are populated');
  }
  assert.equal(outbound.length,0,'valid setup and health perform no outbound work');
  for(const [kind,value] of [['missing',undefined],['malformed',malformed]]){
   await stop();
   const invalid={...bindings};if(value===undefined)delete invalid.MAIL_RELAY_URL;else invalid.MAIL_RELAY_URL=value;
   const logStart=diagnostics.length;await start(invalid);
   const before=await snapshot(),seen=outbound.length;
   assert.deepEqual(before,original,'restart preserves the same populated installation');
   const refusals=[];
   for(const [door,request] of [['health',()=>call('/health')],['runner claim',claim]]){
    const response=await request(),text=await response.text();
    assert.equal(response.status,503,`${kind} MAIL_RELAY_URL: ${door} refuses configuration`);
    assert.match(text,/\bMAIL_RELAY_URL\b/,'diagnostic names the conditional binding');
    assert.equal(response.headers.get('cache-control'),'no-store');
    valueFree(text+'\n'+JSON.stringify([...response.headers]));
    assert.deepEqual(await snapshot(),before,'refusal preserves every durable table, including admission and custody');
    assert.equal(outbound.length,seen,'refusal attempts no mail, target or other outbound request');
    refusals.push({door,status:response.status,diagnostic:text});
   }
   const captured=diagnostics.slice(logStart).join('\n');valueFree(captured);
   assert.ok(Buffer.byteLength(captured)<=65536,'captured request diagnostics remain bounded');
   receipts.push({kind,refusals,tables:before.length,outbound:outbound.length-seen,durableEqual:true,capturedDiagnosticBytes:Buffer.byteLength(captured)});
   console.info(`PROBE STARTUP-001 acceptance-1 MAIL_RELAY_URL ${kind}: health and authenticated native claim -> 503 naming MAIL_RELAY_URL, value-free responses and diagnostics, zero outbound, all ${before.length} durable tables unchanged`);
  }
  await stop();await start(bindings);
  assert.deepEqual(await snapshot(),original,'corrected restart retains admission, custody and all other rows');
  const restored=await call('/health');assert.equal(restored.status,200,'correcting relay settings recovers health');await restored.arrayBuffer();
  // A wrong key cannot reach the idle success, so it is evidence of actual
  // runner authentication rather than a generic healthy response.
  const denied=await call('/api/runner/claim',{method:'POST',body:{},headers:{'x-runner-key':'synthetic-uptime-163-wrong-runner'}});
  assert.equal(denied.status,401,'restored claim still enforces runner authority');await denied.arrayBuffer();
  const beforeClaim=await snapshot(),response=await claim();
  assert.equal(response.status,200,'corrected restart accepts the same native runner claim');
  const idle=await response.json();assert.equal(idle.task,null,'authenticated runner receives no target or mail work');
  const after=await snapshot();
  const contact=(await DB.prepare('SELECT * FROM runner_contact WHERE id=1').first());
  const runner=await DB.prepare('SELECT * FROM runners WHERE runner_id=?').bind(registration.runnerId).first();
  assert.ok(Number.isSafeInteger(contact?.last_contact_at));assert.ok(Number.isSafeInteger(runner.last_contact_at));
  assert.ok(idle.now>=contact.last_contact_at&&idle.now>=runner.last_contact_at,'idle response follows both durable contact writes');
  const work=rows=>rows.filter(table=>!['public_rate_limits','runner_contact','runners'].includes(table.name));
  assert.deepEqual(work(after),work(original),'recovery preserves every table outside admission counters and runner contact');
  const runnerRows=rows=>rows.find(table=>table.name==='runners').rows.map(raw=>{const row=JSON.parse(raw);delete row.last_contact_at;return row});
  assert.deepEqual(runnerRows(after),runnerRows(beforeClaim),'claim changes no runner authority or identity');
  assert.equal(outbound.length,0,'complete refusal and correction journey performs no outbound work');
  valueFree(diagnostics.join('\n'));
  console.info('PROBE STARTUP-001 acceptance-2 MAIL_RELAY_URL: valid HTTPS relay and same persistence restart -> health 200, wrong runner key 401, authenticated idle claim 200, zero outbound and preserved product custody');
  if(process.env.UPTIME_RELAY_URL_EVIDENCE){
   const path=resolve(process.env.UPTIME_RELAY_URL_EVIDENCE);await mkdir(dirname(path),{recursive:true});
   await writeFile(path,JSON.stringify({schema:1,journey:'proveRerRelayUrlStartup',refusals:receipts,recovery:{health:200,wrongKey:401,claim:200,task:null,outbound:0,productCustodyEqual:true},tables:original.map(({name,rows})=>({name,rows:rows.length})),diagnosticsValueFree:true},null,2)+'\n');
  }
 }finally{try{await stop()}finally{await rm(directory,{recursive:true,force:true})}}
}
