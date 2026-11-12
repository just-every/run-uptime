import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,dirname,parse} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {Miniflare,convertV4MiniflareOptions,Log,LogLevel} from 'miniflare';
import {splitSql} from './migration-support.mjs';

// This installation owns its migrations, bindings, persistence and observations.
// Only the transport envelope is synthetic; it invokes the emitted application.
export async function proveMailSenderStartup(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-mail-sender-'));
 const emitted=resolve('dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
 const at=String.fromCharCode(64),sentinel='synthetic-uptime-165-planted-sender';
 const malformed=`Synthetic Uptime <${sentinel}>`;
 const settings={UPTIME_ORIGIN:'https://synthetic-uptime-165.example.test',UPTIME_LOCAL_REVIEW:'false',
  OWNER_EMAIL:'synthetic-uptime-165-owner'+at+'example.test',
  SESSION_SECRET:'synthetic-uptime-165-session-secret',SETUP_TOKEN:'synthetic-uptime-165-bootstrap-secret',
  UPTIME_RUNNER_KEY:'synthetic-uptime-165-runner-key',MAIL_PROVIDER:'rer',
  MAIL_API_KEY:'synthetic-uptime-165-mail-key',MAIL_RELAY_URL:'https://relay.synthetic-uptime-165.test/mail',
  MAIL_FROM:'Synthetic Uptime <synthetic-uptime-165-sender'+at+'example.test>'};
 // Neither request URL nor Host is constructed from the sender under test.
 const requestOrigin='https://synthetic-uptime-165.example.test',requestHost='synthetic-uptime-165.example.test';
 const outbound=[],diagnostics=[],cases=[];
 let worker,DB,runnerId;
 class CapturedLog extends Log{log(message){diagnostics.push(String(message))}}
 const wrapper=join(directory,'request-envelope.mjs');
 await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};
 export default {async fetch(request,env,ctx){const input=await request.json();
 return app.fetch(new Request(input.url,{method:input.method,headers:input.headers,...(input.body===undefined?{}:{body:input.body})}),env,ctx)}};`);
 const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},
  ...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))];
 async function start(bindings){
  worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,
   compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,host:'127.0.0.1',port:0,
   assets:{directory:resolve(emitted,config.assets.directory),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true},
   d1Databases:{DB:'startup-mail-sender'},resourcePersistencePath:join(directory,'state'),bindings,cf:{},
   log:new CapturedLog(LogLevel.VERBOSE),handleStructuredLogs:entry=>diagnostics.push(JSON.stringify(entry)),
   unsafeLocalExplorer:false,unsafeObservability:false,
   outboundService:request=>{outbound.push({method:request.method,url:request.url});return new Response(null,{status:502})}}));
  await worker.ready;DB=await worker.getD1Database('DB');
 }
 async function stop(){await worker?.dispose();worker=undefined}
 const call=(path,{body,headers={}}={})=>worker.dispatchFetch('http://localhost/',{
  method:'POST',redirect:'manual',headers:{'content-type':'application/json'},
  body:JSON.stringify({url:requestOrigin+path,method:body===undefined?'GET':'POST',
   headers:{host:requestHost,origin:requestOrigin,'cf-connecting-ip':'192.0.2.165',
    ...(body===undefined?{}:{'content-type':'application/json'}),...headers},
   ...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const claim=(key=settings.UPTIME_RUNNER_KEY)=>call('/api/runner/claim',{body:{},headers:{'x-runner-id':runnerId,'x-runner-key':key}});
 async function snapshot(){
  // D1 forbids its private platform metadata. Include every readable table,
  // including SQLite sequences; no application table is filtered out.
  const tables=(await DB.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name <> '_cf_METADATA' ORDER BY name").all()).results;
  return Promise.all(tables.map(async({name,sql})=>({name,sql,rows:(await DB.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.map(row=>JSON.stringify(row)).sort()})));
 }
 const equal=(actual,expected,label)=>assert.ok(isDeepStrictEqual(actual,expected),label);
 const rows=(state,name)=>state.find(table=>table.name===name).rows.map(raw=>JSON.parse(raw));
 const inventory=state=>state.map(table=>({name:table.name,rows:table.rows.length,sha256:createHash('sha256').update(JSON.stringify(table)).digest('hex')}));
 function valueFree(text){
  for(const value of [sentinel,malformed,...Object.values(settings).filter(value=>value.length>=8)]){
   for(const encoded of new Set([value,encodeURIComponent(value),Buffer.from(value).toString('base64'),Buffer.from(value).toString('base64url'),JSON.stringify(value).slice(1,-1)]))
    assert.ok(!text.includes(encoded),'responses and captured diagnostics withhold supplied values');
  }
 }
 async function noWork(){
  assert.equal(outbound.length,0,'independent outbound edge saw no mail, target or other external request');
  for(const table of ['monitors','slots','notification_jobs'])assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM "${table}"`).first()).n,0,'startup never creates target or mail work');
 }
 // Check each permitted write precisely instead of ignoring entire contact or
 // admission tables. Old counter windows and every unrelated identity survive.
 function recovered(before,after,{admission,contact=false,started,ended}){
  equal(after.map(({name,sql})=>({name,sql})),before.map(({name,sql})=>({name,sql})),'recovery changes no table schema or inventory');
  for(const table of before){
   if(table.name==='public_rate_limits')continue;
   if(contact&&['runner_contact','runners'].includes(table.name))continue;
   equal(after.find(item=>item.name===table.name),table,'recovery preserves every unrelated durable table and sequence');
  }
  const previous=rows(before,'public_rate_limits'),current=rows(after,'public_rate_limits');
  const key=row=>JSON.stringify([row.class,row.client_hash,row.window_start]);
  for(const old of previous){
   const next=current.find(row=>key(row)===key(old));assert.ok(next,'existing admission counter remains');
   equal({...next,request_count:old.request_count},old,'admission changes only its request count');
   assert.ok(next.request_count>=old.request_count,'admission never decrements');
  }
  for(const row of current.filter(row=>!previous.some(old=>key(row)===key(old)))){
   assert.equal(row.class,admission,'only this door may add an admission window');
   assert.ok(previous.some(old=>old.class===admission&&old.client_hash===row.client_hash),'new window retains the established client identity');
   assert.equal(row.request_count,1);assert.equal(row.expires_at,row.window_start+60_000);
   assert.ok(row.window_start<=ended&&row.window_start+60_000>started,'admission window includes the request');
  }
  for(const group of new Set([...previous,...current].map(row=>row.class))){
   const total=data=>data.filter(row=>row.class===group).reduce((n,row)=>n+row.request_count,0);
   assert.equal(total(current)-total(previous),Number(group===admission),'only the named admission class advances once');
  }
  if(contact){
   const oldRunners=rows(before,'runners'),newRunners=rows(after,'runners');
   const withoutContact=data=>data.map(row=>row.runner_id===runnerId?{...row,last_contact_at:null}:row);
   equal(withoutContact(newRunners),withoutContact(oldRunners),'runner identity, scope, keys and other runners are unchanged');
   const row=newRunners.find(row=>row.runner_id===runnerId);
   assert.ok(Number.isSafeInteger(row.last_contact_at)&&row.last_contact_at>=started&&row.last_contact_at<=ended,'authenticated runner contact is recorded inside this request');
   const contactRows=rows(after,'runner_contact');assert.equal(contactRows.length,1);
   equal(Object.keys(contactRows[0]).sort(),['id','last_contact_at']);assert.equal(contactRows[0].id,1);
   assert.ok(Number.isSafeInteger(contactRows[0].last_contact_at)&&contactRows[0].last_contact_at>=started&&contactRows[0].last_contact_at<=ended,'installation contact is recorded inside this request');
  }
 }
 async function recoverDoor(request,{status,admission,contact=false}){
  const before=await snapshot(),started=Date.now(),response=await request(),text=await response.text(),ended=Date.now();
  assert.equal(response.status,status,'corrected settings retain the native door result');
  const after=await snapshot();recovered(before,after,{admission,contact,started,ended});await noWork();
  if(status===200&&contact){const idle=JSON.parse(text);assert.equal(idle.task,null,'authenticated runner is idle');assert.ok(idle.now>=started&&idle.now<=ended)}
  return {status,admission,contact,tables:inventory(after)};
 }
 try{
  await start(settings);
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())
   for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const admitted=await call('/auth/bootstrap',{body:{token:settings.SETUP_TOKEN,displayName:'Synthetic Uptime owner',returnTo:'/app'}});
  assert.equal(admitted.status,303,'native bootstrap admits the owner');
  assert.match(admitted.headers.get('set-cookie'),/HttpOnly/,'native admission establishes session custody');await admitted.arrayBuffer();
  const body={version:1},stamp=String(Date.now());
  const enrollment=await call('/api/runner/enroll',{body,headers:{'x-runner-key':settings.UPTIME_RUNNER_KEY,'x-sent-at':stamp,
   'x-runner-signature':createHmac('sha256',settings.UPTIME_RUNNER_KEY).update(`${stamp}.runner-enrolment.${JSON.stringify(body)}`).digest('hex')}});
  assert.equal(enrollment.status,200,'native signed enrollment succeeds');const registration=await enrollment.json();
  assert.equal(registration.scope,'self-runner');runnerId=registration.runnerId;assert.ok(runnerId);
  const healthy=await call('/health');assert.equal(healthy.status,200);await healthy.arrayBuffer();
  const idle=await claim();assert.equal(idle.status,200);assert.equal((await idle.json()).task,null,'valid control establishes an authenticated idle runner');
  await DB.prepare('INSERT INTO notification_claim_custody(claim,delivery_id,created_at,reservation_hash,started_at,released_at) VALUES(?,?,?,?,?,?)')
   .bind('synthetic-uptime-165-claim','synthetic-uptime-165-delivery',1,'synthetic-uptime-165-reservation',1,2).run();
  let baseline=await snapshot();
  for(const name of ['oa_bootstrap','oa_operators','oa_sessions','public_rate_limits','runners','runner_contact','notification_claim_custody'])
   assert.ok(rows(baseline,name).length>0,'native admission, authority, contact and retained custody are populated');
  assert.ok(baseline.some(table=>table.name==='sqlite_sequence'),'complete snapshots include SQLite sequence state');
  await noWork();
  for(const [kind,value] of [['missing',undefined],['malformed',malformed]]){
   await stop();const invalid={...settings};if(value===undefined)delete invalid.MAIL_FROM;else invalid.MAIL_FROM=value;
   const logStart=diagnostics.length;await start(invalid);
   equal(await snapshot(),baseline,'invalid restart retains the same populated persistence');
   const refusals=[];
   for(const [door,request] of [['health',()=>call('/health')],['authenticated runner claim',()=>claim()]]){
    const before=await snapshot(),response=await request(),text=await response.text();
    assert.equal(response.status,503,`${kind} MAIL_FROM: ${door} refuses configuration`);
    assert.match(text,/\bMAIL_FROM\b/,'configuration refusal names the mandatory sender binding');
    assert.equal(response.headers.get('cache-control'),'no-store');valueFree(text+'\n'+JSON.stringify([...response.headers]));
    equal(await snapshot(),before,'each refusal preserves all readable durable tables, sequences, admission and custody');await noWork();
    refusals.push({door,status:response.status,diagnostic:text,tablesBefore:inventory(before),tablesAfter:inventory(await snapshot())});
   }
   await stop();valueFree(diagnostics.slice(logStart).join('\n'));
   await start(settings);equal(await snapshot(),baseline,'sender correction restarts the exact same persistence');
   const health=await recoverDoor(()=>call('/health'),{status:200,admission:'health'});
   const wrongKey=await recoverDoor(()=>claim('synthetic-uptime-165-wrong-runner'),{status:401,admission:'runner'});
   const authenticated=await recoverDoor(()=>claim(),{status:200,admission:'runner',contact:true});
   cases.push({kind,refusals,recovery:{health,wrongKey,authenticated},outboundRequests:outbound.length});
   baseline=await snapshot();
   console.info(`PROBE STARTUP-001 acceptance-1 MAIL_FROM ${kind}: health and authenticated claim -> 503 naming MAIL_FROM; value-free diagnostics; zero outbound; ${baseline.length} readable durable tables unchanged`);
   console.info(`PROBE STARTUP-001 acceptance-2 MAIL_FROM ${kind}: corrected sender and same persistence restart -> health 200, wrong key 401, authenticated idle claim 200; only named admission counts and contact fields change; zero mail or target work`);
  }
  await stop();valueFree(diagnostics.join('\n'));assert.equal(outbound.length,0,'teardown performs no outbound work');
  const receipt={schema:1,journey:'proveMailSenderStartup',cases,capturedDiagnostics:diagnostics,outboundRequests:outbound.length,
   durableTables:baseline.length,sequenceIncluded:true,omittedTable:'_cf_METADATA (D1 platform forbids reading)',diagnosticsValueFree:true};
  if(process.env.UPTIME_MAIL_SENDER_EVIDENCE){const path=resolve(process.env.UPTIME_MAIL_SENDER_EVIDENCE);await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(receipt,null,2)+'\n')}
  console.info('STARTUP_MAIL_SENDER_PASS '+JSON.stringify({cases:cases.length,durableTables:baseline.length,sequenceIncluded:true,outboundRequests:outbound.length,diagnosticsValueFree:true}));
  return receipt;
 }finally{try{await stop()}finally{await rm(directory,{recursive:true,force:true})}}
}
