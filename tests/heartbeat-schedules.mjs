import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory,ownerAPI} from './notify-acceptance-runtime.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
let worker;
process.env.UPTIME_RUNNER_BROWSER='off';
try{
 let DB;({worker,DB}=await migratedWorker({port,persist:join(directory,'worker')}));
 const owner=ownerAPI(origin);await owner.signIn();const api=owner.api;
 const runners=[];for(const networkLabel of ['Backup East','Backup West']){const result=await api('/api/runners','POST',{networkLabel},{origin});assert.equal(result.status,201);runners.push(result.data)}
 const created=await api('/api/monitors','POST',{name:'Acme nightly database backup',type:'heartbeat',heartbeat:{cron:'0 2 * * *',timeZone:'America/New_York',graceMs:900000,maxAgeMs:30000},intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1,probes:['local-a','local-b'],assignments:{'local-a':runners[0].runnerId,'local-b':runners[1].runnerId}},{origin});assert.equal(created.status,201);const id=created.data.id;
 const preview=async at=>{const r=await api(`/api/monitors/${id}/heartbeat-runs?previewFrom=${Date.parse(at)}`);assert.equal(r.status,200);return r.data.schedule.upcoming};
 const spring=await preview('2027-03-13T08:00:00Z');assert.equal(spring[0].expectedAt,Date.parse('2027-03-15T06:00:00Z'));assert.equal(spring[0].deadlineAt,Date.parse('2027-03-15T06:15:00Z'));
 const configured=await api(`/api/monitors/${id}/heartbeat-settings`,'POST',{cron:'30 1 * * *',timeZone:'America/New_York',graceMs:900000},{origin});assert.equal(configured.status,200);
 const fall=await preview('2026-11-01T00:00:00Z');assert.equal(fall[0].expectedAt,Date.parse('2026-11-01T05:30:00Z'));assert.equal(fall[1].expectedAt,Date.parse('2026-11-02T06:30:00Z'));
 assert.equal((await api(`/api/monitors/${id}/heartbeat-settings`,'POST',{cron:'0 2 31 2 *',timeZone:'America/New_York'},{origin})).status,400);
 const issue=await api(`/api/monitors/${id}/heartbeat-key`,'POST',{}, {origin});assert.equal(issue.status,200);const issued=issue.data;
 const receipt=async(suffix='',method='GET',body,headers={})=>fetch(origin+issued.capabilityPath+suffix,{method,headers,body});
 assert.equal((await receipt()).status,200);assert.equal((await receipt('','HEAD')).status,200);assert.equal((await receipt('/start','POST')).status,200);
 const secret=randomBytes(24).toString('hex');const failure=await receipt('/fail/3','POST',`token=${secret} customer@example.test ${"4"+"1".repeat(15)}`,{'content-type':'text/plain'});assert.equal(failure.status,200);
 const failures=(await api(`/api/monitors/${id}/heartbeat-runs`)).data.runs;assert.equal(failures[0].exitCode,3);assert.ok(!failures[0].output.includes(secret)&&!failures[0].output.includes('customer@')&&!failures[0].output.includes('4111'));
 const state=async()=>(await api('/api/overview')).data.monitors.find(m=>m.id===id).state.state;
 assert.equal(await state(),'Unknown','receipt ingestion never projects health');
 const evaluate=async()=>{for(const runner of runners)await runRunner({origin,key:runner.key,runnerId:runner.runnerId,localReview:true,once:true})};
 await evaluate();assert.equal(await state(),'Failing','real signed heartbeat probes confirm the explicit failure');
 assert.equal((await receipt()).status,200);await evaluate();assert.equal(await state(),'Healthy');
 const protectedHeaders={authorization:`Bearer ${issued.token}`,'x-heartbeat-sequence':'100'};
 assert.equal((await fetch(origin+issued.receiptPath,{headers:protectedHeaders})).status,200);assert.equal((await fetch(origin+issued.receiptPath,{headers:protectedHeaders})).status,400);
 const stored=JSON.stringify((await DB.prepare('SELECT * FROM heartbeat_authority').all()).results);assert.ok(!stored.includes(issued.token)&&!stored.includes(issued.urlToken));
 const snippets=issued.snippets;const sample=snippets.find(s=>s.id==='curl');assert.ok(sample);
 // Execute each POSIX wrapper unchanged against the actual receipt endpoint.
 for(const snippet of snippets.filter(s=>['curl','wget','bash'].includes(s.id))){
  if(snippet.id==='wget'){const available=spawn('which',['wget']);if((await once(available,'exit'))[0]!==0)continue}
  const path=join(directory,snippet.id+'.sh');await writeFile(path,snippet.code,{mode:0o700});const child=spawn(snippet.id==='bash'?'bash':'sh',[path],{stdio:['ignore','pipe','pipe']});let size=0;child.stdout.on('data',b=>size+=b.length);child.stderr.on('data',b=>size+=b.length);assert.equal((await once(child,'exit'))[0],0,`generated ${snippet.id} executes (private diagnostics ${size} bytes)`);
 }
 const exported=await api('/api/archive');assert.equal(exported.status,200);assert.ok(!JSON.stringify(exported.data).includes(issued.urlToken));
 const rotated=await api(`/api/monitors/${id}/heartbeat-key`,'POST',{}, {origin});assert.equal(rotated.status,200);assert.equal((await receipt()).status,400);assert.equal((await fetch(origin+issued.receiptPath,{headers:{...protectedHeaders,'x-heartbeat-sequence':'200'}})).status,400);
 const robot=JSON.stringify({data:[{type:'HEARTBEAT',friendlyName:'Migrated robot backup',interval:86400,gracePeriod:3600}],nextLink:null});
 const better=JSON.stringify({data:[{type:'heartbeat',attributes:{name:'Migrated Better Stack backup',period:86400,grace:900}}]});
 for(const [source,body,grace] of [['uptimerobot',robot,3600000],['betterstack-heartbeats',better,900000]]){const response=await api(`/api/definitions/preview?source=${source}`,'POST',JSON.parse(body),{origin});assert.equal(response.status,200);const plan=response.data;assert.equal(plan.entries[0].target.heartbeat.maxAgeMs,86400000);assert.equal(plan.entries[0].target.heartbeat.graceMs,grace);const applied=await api(`/api/definitions/apply?source=${source}&digest=${plan.digest}`,'POST',JSON.parse(body),{origin});assert.equal(applied.status,201);const imported=(await api('/api/overview')).data.monitors.find(m=>m.definition.name.startsWith(source==='uptimerobot'?'Migrated robot':'Migrated Better'));assert.equal(imported.definition.enabled,false);assert.equal(imported.definition.heartbeat.graceMs,grace)}
 console.log('HEARTBEAT-002: public Worker cron/DST preview, hashed rotated URL authority, GET/HEAD/POST, protected replay refusal, redacted history and real signed failure/recovery passed.');
}finally{await worker?.dispose();await cleanupDirectory(directory)}
