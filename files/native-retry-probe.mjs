import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [root,receiptPath]=process.argv.slice(2);
const load=path=>import(pathToFileURL(join(root,path)).href);
const {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts}=await load('tests/notify-acceptance-runtime.mjs');
const {testAuthBindings,signInOwner}=await load('tests/auth-test-support.mjs');
const {nativeHttp}=await load('tests/agent-conformance/http.mjs');
const {allDeliveredMessages}=await load('tests/mail-provider-fixture.mjs');
const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin='http://127.0.0.1:'+port;
const provider=[];let worker;
try{
 const runtime=await migratedWorker({port,persist:join(directory,'worker'),bindings:testAuthBindings,
  outboundService:async request=>{provider.push({method:request.method,origin:new URL(request.url).origin});throw Error('Unexpected provider request')}});
 worker=runtime.worker;const db=runtime.DB;
 const cookie=await signInOwner(origin),http=nativeHttp({request:fetch,origin,cookie});
 const owner=await http.json('/api/access/self');assert.equal(owner.role,'owner');
 const definition={name:'synthetic-uptime-monitor-retry',type:'api',network:'public',url:'https://auth.example.test/setup',
  api:{variables:{},steps:[
   {name:'Create synthetic fixture',phase:'setup',url:'https://auth.example.test/setup',method:'POST',assertions:{status:201}},
   {name:'Read synthetic fixture',phase:'request',url:'https://auth.example.test/fixture',method:'GET',assertions:{status:200}},
   {name:'Remove synthetic fixture',phase:'cleanup',url:'https://auth.example.test/fixture',method:'DELETE',assertions:{status:200}},
  ]},intervalMs:86400000,timeoutMs:10000,retries:1,probes:['local-a'],failureQuorum:1,
  confirmSlots:2,recoverSlots:1,freshnessMs:86400000,enabled:true};
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results.map(row=>row.name);
  const results=await db.batch(tables.map(name=>db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"')));
  return Object.fromEntries(tables.map((name,i)=>[name,results[i].results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
 };
 const before=await snapshot(),mail=allDeliveredMessages().length;
 const response=await http.send('/api/monitors',definition),body=await response.json();
 const after=await snapshot();
 const changedTables=Object.keys(before).filter(name=>JSON.stringify(before[name])!==JSON.stringify(after[name]));
 for(const name of ['monitors','monitor_revisions','cleanup_debt','slots','observations','uptime_agent_manual'])assert.deepEqual(after[name],before[name],name+' is unchanged after creation refusal');
 assert.deepEqual(provider,[],'creation refusal reaches no provider');
 assert.equal(allDeliveredMessages().length,mail,'creation refusal sends no mail');
 const baseline=await http.json('/api/monitors',{...definition,name:'synthetic-uptime-zero-retry-control',retries:0});
 const saved=(await http.json('/api/monitors/'+baseline.id+'/revisions')).find(row=>row.revision===baseline.revision);
 assert.equal(saved.definition.type,'api');assert.equal(saved.definition.retries,0);
 assert.deepEqual(saved.definition.probes,['local-a']);
 assert.equal(saved.definition.api.steps.filter(step=>step.phase==='cleanup').length,1);
 const debts=await http.json('/api/monitors/'+baseline.id+'/cleanup-debt');assert.equal(debts.open.length,0);assert.equal(debts.limit,3);
 const receipt={schema:1,tag:'sd-uptime-c-f173',door:'POST /api/monitors',role:owner.role,
  selectedCell:{type:'api',probes:1,cleanupSteps:1,monitorRetries:1},
  requested:{expectedStatus:200,actualStatus:response.status,body},changedTables,
  nativeDataUnchanged:true,providerRequests:provider.length,mailDelta:allDeliveredMessages().length-mail,
  zeroRetryControl:{created:true,savedRetries:saved.definition.retries,probes:saved.definition.probes,
   cleanupSteps:saved.definition.api.steps.filter(step=>step.phase==='cleanup').length,openDebts:debts.open.length,limit:debts.limit},
  selectedCellReachable:response.status===200};
 await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));
 assert.equal(response.status,200,'one monitor retry must be accepted through owner creation to establish the requested saved retry-debt cell');
}finally{await worker?.dispose();await cleanupDirectory(directory)}
