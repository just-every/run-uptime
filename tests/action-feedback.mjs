import {testAuthBindings,signInOwner} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createActionFeedback} from '../public/action-feedback.mjs';
import {startLocalWorker} from '../scripts/local-worker.mjs';

// Exercise the controller used by the console with observable request ordering,
// then a real HTTP/D1 restore rejection. No DOM, browser, runner or probe traffic.
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.UPTIME_ACTION_CONTROL_PORT??15510);
const fixturePort=Number(process.env.UPTIME_ACTION_FIXTURE_PORT??15511);
if([port,fixturePort].some(p=>!Number.isInteger(p)||p<15480||p>15519)||port===fixturePort)throw Error('Distinct assigned local ports required');
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
function harness(load=async()=>({revision:1}),onRender=()=>{}){
 const snapshots=[],renders=[],locks=[];
 const controller=createActionFeedback({load,render:(value,options)=>{renders.push({value,options});onRender(value,options);},publish:state=>snapshots.push(state),lock:value=>locks.push(value)});
 return {controller,snapshots,renders,locks,last:()=>snapshots.at(-1)};
}
let passed=0;
async function check(name,run){await run();passed++;console.log('PASS '+name);}

await check('rejected action survives reconciliation, contact announcement and later polling',async()=>{
 let contact='Never seen',previousContact=null;
 const h=harness(async()=>({contact}),value=>{if(previousContact!==null&&previousContact!==value.contact)h.controller.announceBackground(`Runner contact: ${value.contact}.`);previousContact=value.contact;});
 await h.controller.refresh();contact='Fresh contact';
 const result=await h.controller.run(async()=>{throw Error('Restore requires empty installation');});
 assert.deepEqual(result,{accepted:true,ok:false,result:undefined});
 assert.deepEqual(h.last().action,{state:'error',message:'Restore requires empty installation'});
 assert.equal(h.last().background.message,'Runner contact: Fresh contact.','the reconciliation render must have announced its contact transition');
 contact='Stale contact';await h.controller.refresh();
 assert.equal(h.last().action.message,'Restore requires empty installation');
 assert.equal(h.last().background.message,'Runner contact: Stale contact.');
 assert.equal(h.last().read.state,'ready');
});

await check('mutations stay excluded and replacement renders stay locked through reconciliation',async()=>{
 const reconciliation=deferred();let reads=0,secondCalls=0;
 const h=harness(()=>{reads++;return reconciliation.promise;});
 const first=h.controller.run(async()=>({id:'created'}),{pending:'Restoring…',success:'Archive restored; monitors remain paused.'});
 await nextTurn();assert.equal(reads,1);assert.equal(h.controller.busy,true);assert.equal(h.last().busy,true);
 assert.deepEqual(await h.controller.run(async()=>{secondCalls++;}),{accepted:false,ok:false});
 assert.equal(await h.controller.refresh(),false);assert.equal(reads,1);assert.equal(secondCalls,0);
 assert.ok(h.locks.length>0&&h.locks.every(locked=>locked),'controls cannot unlock before reconciliation');
 reconciliation.resolve({revision:2});assert.equal((await first).ok,true);
 assert.equal(h.renders.at(-1).options.busy,true,'reconciliation render must identify replacement controls as locked');
 assert.equal(h.locks.at(-1),false);assert.equal(h.controller.busy,false);
 assert.equal(h.last().action.message,'Archive restored; monitors remain paused.');
});

for(const oldOutcome of ['success','failure'])await check(`pre-action ${oldOutcome} read cannot replace reconciled observations or feedback`,async()=>{
 const oldRead=deferred();let calls=0;
 const h=harness(()=>++calls===1?oldRead.promise:Promise.resolve({revision:2}));
 const oldRefresh=h.controller.refresh();
 const result=await h.controller.run(async()=>({revision:2}),{success:'Monitor paused.'});assert.equal(result.ok,true);
 const renderCount=h.renders.length,publishCount=h.snapshots.length,lockCount=h.locks.length;
 if(oldOutcome==='success')oldRead.resolve({revision:1});else oldRead.reject(Error('Old overview failed'));
 assert.equal(await oldRefresh,false);assert.equal(h.renders.length,renderCount);assert.equal(h.snapshots.length,publishCount);assert.equal(h.locks.length,lockCount);
 assert.equal(h.renders.at(-1).value.revision,2);assert.equal(h.last().action.message,'Monitor paused.');assert.equal(h.last().read.state,'ready');
});

await check('read failure and recovery remain visible independently of rejected action',async()=>{
 let fail=false;const h=harness(async()=>{if(fail)throw Error('Overview unavailable');return {revision:1};});
 await h.controller.refresh();fail=true;
 await h.controller.run(async()=>{throw Error('Restore requires empty installation');});
 assert.equal(h.last().action.state,'error');assert.equal(h.last().action.message,'Restore requires empty installation');
 assert.equal(h.last().read.state,'unavailable');assert.match(h.last().read.message,/Overview unavailable.*Unknown/);
 assert.deepEqual(h.renders.at(-1).value,{revision:1});assert.equal(h.renders.at(-1).options.readUnavailable,true);
 fail=false;await h.controller.refresh();
 assert.equal(h.last().read.state,'recovered');assert.match(h.last().read.message,/Refresh recovered/);
 assert.equal(h.last().action.message,'Restore requires empty installation');assert.equal(h.renders.at(-1).options.readUnavailable,false);
});

await check('specific manual-run success and independent published snapshots are retained',async()=>{
 const h=harness();const pending=deferred();
 const running=h.controller.run(()=>pending.promise,{pending:'Requesting manual run…',success:result=>`Manual run ${result.id} requested; scheduled confirmation and recovery do not advance.`});
 const working=h.last();pending.resolve({id:'manual-1'});await running;
 assert.equal(working.action.state,'working');assert.equal(working.action.message,'Requesting manual run…');assert.equal(working.busy,true);
 assert.equal(h.last().action.message,'Manual run manual-1 requested; scheduled confirmation and recovery do not advance.');
 // Consumers cannot mutate a published copy and thereby change controller state.
 h.last().action.message='Consumer mutation';h.last().read.state='Consumer mutation';h.last().background.message='Consumer mutation';
 h.controller.announceBackground('Runner contact: Stale contact.');
 assert.equal(h.last().action.message,'Manual run manual-1 requested; scheduled confirmation and recovery do not advance.');
 assert.equal(h.last().read.state,'ready');assert.equal(h.last().background.message,'Runner contact: Stale contact.');
});

await check('an explicitly superseding read retains its observations when an earlier read resolves later',async()=>{
 const earlier=deferred(),later=deferred();let calls=0;
 const h=harness(()=>++calls===1?earlier.promise:later.promise);
 const first=h.controller.refresh(),second=h.controller.refresh({supersede:true});later.resolve({revision:2});assert.equal(await second,true);
 earlier.resolve({revision:1});assert.equal(await first,false);assert.equal(h.renders.length,1);assert.equal(h.renders[0].value.revision,2);
});

await check('ordinary polling cannot indefinitely supersede a pending read failure',async()=>{
 const read=deferred();let calls=0;const h=harness(()=>{calls++;return read.promise;});
 const current=h.controller.refresh();assert.equal(await h.controller.refresh(),false);assert.equal(await h.controller.refresh(),false);assert.equal(calls,1);
 read.reject(Error('Read deadline exceeded'));assert.equal(await current,false);assert.equal(h.last().read.state,'unavailable');assert.match(h.last().read.message,/Read deadline exceeded.*Unknown/);
});
await check('unavailable read retains the last successful receipt time alongside action outcome',async()=>{
 let fail=false;const now=Date.now(),h=harness(async()=>{if(fail)throw Error('Offline');return {now};});await h.controller.refresh();fail=true;
 await h.controller.run(async()=>{throw Error('Restore requires empty installation');});assert.match(h.last().read.message,/Last successful refresh/);assert.equal(h.last().action.message,'Restore requires empty installation');
});

const directory=await mkdtemp(join(tmpdir(),'uptime-action-feedback-'));
let worker;
try{
 await check('actual HTTP/D1 nonempty restore error survives controller refresh and background feedback',async()=>{
  const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:'synthetic-action-feedback-runner-20261002',UPTIME_SYNTHETIC_PORT:String(fixturePort)};
  worker=await startLocalWorker({root,port,persist:join(directory,'control'),bindings});
  const DB=await worker.getD1Database('DB');
  for(const name of (await readdir(join(root,'migrations'))).filter(name=>name.endsWith('.sql')).sort())for(const statement of splitSql(await readFile(join(root,'migrations',name),'utf8')))await DB.prepare(statement).run();
  const origin=`http://127.0.0.1:${port}`;let cookie='';
  async function request(path,method='GET',body){
   const response=await fetch(origin+path,{method,headers:{'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
   return {status:response.status,body:await response.json(),headers:response.headers};
  }
  cookie=await signInOwner(origin,{bindings});
  const created=await request('/api/monitors','POST',{name:'Disabled action feedback fixture',url:`http://127.0.0.1:${fixturePort}/health`,enabled:false});assert.equal(created.status,201);
  const archive=await request('/api/archive');assert.equal(archive.status,200);
  const h=harness(async()=>{const response=await request('/api/overview');assert.equal(response.status,200);return response.body;});
  await h.controller.refresh();const before=(await DB.prepare('SELECT * FROM monitors ORDER BY id').all()).results;let restoreStatus;
  const outcome=await h.controller.run(async()=>{const response=await request('/api/restore','POST',archive.body);restoreStatus=response.status;if(response.status>=400)throw Error(response.body.error);return response.body;},{pending:'Restoring private archive…',success:'Archive restored; monitors remain paused.'});
  assert.equal(restoreStatus,400);assert.equal(outcome.accepted,true);assert.equal(outcome.ok,false);
  assert.deepEqual(h.last().action,{state:'error',message:'Restore requires empty installation'});
  h.controller.announceBackground('Overview observations refreshed.');await h.controller.refresh();
  assert.equal(h.last().action.message,'Restore requires empty installation');assert.equal(h.last().read.state,'ready');
  assert.deepEqual((await DB.prepare('SELECT * FROM monitors ORDER BY id').all()).results,before);
  assert.equal(h.renders.at(-1).value.monitors[0].state.state,'Paused');assert.equal(h.renders.at(-1).value.runner.contact.state,'Never seen');
  for(const table of ['slots','observations','outbox'])assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
 });
 console.log(`ACTION-FEEDBACK-001 passed: ${passed} asynchronous outcome/read/control and actual HTTP/D1 restore rejection checks; no browser or probe traffic.`);
}finally{if(worker)await worker.dispose();await rm(directory,{recursive:true,force:true});}
