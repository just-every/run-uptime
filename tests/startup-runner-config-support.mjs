import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import http from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,listen,close} from './signed-runner-runtime.mjs';
import {cleanup} from './resilience/support.mjs';

// Observe the wire independently; every control response comes from the real
// migrated emitted Worker. Children execute the shipped command without preloads.
export async function proveRunnerStartupConfiguration(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-startup-'));
 const key='synthetic-uptime-146-valid-runner-key',command=resolve('runners/src/private-runner.mjs');
 const requests=[],targetRequests=[];
 let worker,DB,origin,bridgeError,active;
 const target=http.createServer((request,response)=>{targetRequests.push(request.url);response.end('synthetic-uptime-146-target')});
 const control=http.createServer(async(request,response)=>{
  const record={path:request.url};requests.push(record);
  try{
   let body='';for await(const chunk of request)body+=chunk;
   const stamp=request.headers['x-sent-at'];
   record.authenticated=request.headers['x-runner-key']===key;
   if(request.url==='/api/runner/enroll')record.signed=request.headers['x-runner-signature']===createHmac('sha256',key).update(`${stamp}.runner-enrolment.${body}`).digest('hex');
   const result=await worker.dispatchFetch('http://localhost/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+request.url,method:request.method,headers:request.headers,body})});
   record.status=result.status;
   const text=await result.text();record.data=JSON.parse(text);
   response.writeHead(result.status,Object.fromEntries(result.headers));response.end(text);
  }catch(error){bridgeError=error;response.writeHead(500);response.end('Emitted Worker request failed')}
 });
 async function snapshot(){
  const tables=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_METADATA' ORDER BY name").all()).results;
  return Promise.all(tables.map(async({name})=>[name,(await DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results]));
 }
 function start(cwd,env){
  const child=spawn(process.execPath,[command],{cwd,env,stdio:['ignore','pipe','pipe']});
  let output='',bytes=0;
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes<=65536)output+=chunk.toString();else child.kill('SIGKILL')});
  const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal,output,bytes}))});
  const deadline=setTimeout(()=>child.kill('SIGKILL'),15000);
  ended.finally(()=>clearTimeout(deadline));
  return {child,ended,async stop(){
   if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);try{return await ended}finally{clearTimeout(timer)}}
   return ended;
  }};
 }
 function withheld(output,values){
  for(const value of values)for(const encoded of new Set([value,value.trim(),encodeURIComponent(value),Buffer.from(value).toString('base64'),Buffer.from(value).toString('base64url'),JSON.stringify(value).slice(1,-1)])){
   if(encoded)assert.ok(!output.includes(encoded),'startup output withholds raw and encoded supplied values');
  }
 }
 try{
  const targetOrigin=`http://127.0.0.1:${await listen(target)}`;
  origin=`http://127.0.0.1:${await listen(control)}`;
  worker=await emittedRunnerWorker(directory,{...testAuthBindings,UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key});
  DB=await worker.getD1Database('DB');
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const initial=await snapshot();
  assert.deepEqual(initial.find(([name])=>name==='runners')[1],[],'no runner exists before the command enrolls');
  const cases=[
   ['UPTIME_CONTROL_ORIGIN','missing',undefined],
   ['UPTIME_CONTROL_ORIGIN','malformed',origin+'/synthetic-uptime-146-origin?value=synthetic-uptime-146%2Borigin'],
   ['UPTIME_RUNNER_KEY','missing',undefined],
   ['UPTIME_RUNNER_KEY','malformed',' synthetic-uptime-146-key+ /? '],
  ];
  for(const [binding,kind,value] of cases){
   const cwd=await mkdtemp(join(directory,'child-'));
   // No inherited application settings, credentials, Node options or proxies.
   const valid={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:cwd,
    UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,UPTIME_LOCAL_REVIEW:'true',
    UPTIME_RUNNER_BROWSER:'off',UPTIME_FLOW_DIR:join(cwd,'flows'),UPTIME_GRANT_FILE:join(cwd,'data','synthetic-grant.json'),
    UPTIME_START_URL:targetOrigin+'/synthetic-uptime-146-target'};
   const invalid={...valid};if(value===undefined)delete invalid[binding];else invalid[binding]=value;
   const before=await snapshot(),seen=requests.length,hits=targetRequests.length;
   active=start(cwd,invalid);const refused=await active.ended;active=undefined;
   assert.equal(refused.signal,null,'configuration refusal exits without a timeout or signal');
   assert.notEqual(refused.code,0,'invalid required configuration stops the actual runner command');
   assert.match(refused.output,new RegExp(`Invalid or missing configuration: ${binding}\\b`),'diagnostic names the offending binding');
   assert.ok(refused.bytes<=65536,'startup diagnostics remain bounded');
   withheld(refused.output,[origin,key,valid.UPTIME_START_URL,...(value===undefined?[]:[value])]);
   assert.equal(requests.length,seen,'invalid startup sends no control request');
   assert.equal(targetRequests.length,hits,'invalid startup sends no target request');
   assert.deepEqual(await snapshot(),before,'invalid startup creates or changes no runner or product rows');
   assert.deepEqual(await readdir(cwd),[],'invalid startup creates no flow workspace, grant or execution journal');
   console.info(`PROBE STARTUP-001 acceptance-1 ${binding} ${kind}: private-runner command -> nonzero, named value-free diagnostic, zero traffic, unchanged database and empty custody`);

   active=start(cwd,valid);
   for(let attempt=0;attempt<200&&!requests.slice(seen).some(record=>record.path==='/api/runner/claim'&&record.status===200);attempt++){
    assert.equal(active.child.exitCode,null,'corrected runner remains available until its idle claim');
    await new Promise(resolve=>setTimeout(resolve,25));
   }
   const corrected=await active.stop();active=undefined;
   assert.equal(bridgeError,undefined);
   assert.equal(corrected.code,0,'SIGTERM cleanly stops the corrected runner');assert.equal(corrected.signal,null);
   const wire=requests.slice(seen),enroll=wire.find(record=>record.path==='/api/runner/enroll'),claim=wire.find(record=>record.path==='/api/runner/claim');
   assert.equal(enroll?.status,200,'real Worker accepts ordinary authenticated enrollment');
   assert.equal(enroll.authenticated,true);assert.equal(enroll.signed,true);assert.equal(enroll.data.scope,'self-runner');
   assert.match(enroll.data.runnerId,/^self-[0-9a-f-]{36}$/);
   assert.equal(claim?.status,200);assert.equal(claim.authenticated,true);assert.equal(claim.data.task,null,'corrected runner receives an idle claim');
   const runners=(await DB.prepare('SELECT * FROM runners').all()).results;
   assert.equal(runners.length,1);assert.equal(runners[0].runner_id,enroll.data.runnerId);assert.ok(runners[0].last_contact_at!==null);
   assert.equal(targetRequests.length,0,'correction and clean shutdown perform no target work');
   const after=await snapshot();
   const product=rows=>rows.filter(([name])=>!['runners','runner_contact','public_rate_limits'].includes(name));
   assert.deepEqual(product(after),product(initial),'idle enrollment creates no monitor, execution, observation or notification work');
   withheld(corrected.output,[key]);
   console.info(`PROBE STARTUP-001 acceptance-2 ${binding} ${kind}: corrected command in the same directory -> authenticated enrollment 200, idle claim 200, clean exit 0, no target work`);
  }
 }finally{
  await cleanup(()=>active?.stop(),[()=>close(control),()=>close(target)],()=>worker?.dispose(),()=>rm(directory,{recursive:true,force:true}));
 }
}
