import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import yaml from 'js-yaml';
import {heartbeatSnippets} from '../src/domain/heartbeat-snippets.mjs';
import {join} from 'node:path';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory,ownerAPI} from './notify-acceptance-runtime.mjs';
import {definitionDoor} from './auth-test-support.mjs';
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
 // Execute generated commands unchanged; public history must show both receipts.
 const command=async(executable,args,environment={})=>{
  const child=spawn(executable,args,{env:{...process.env,...environment},stdio:['ignore','pipe','pipe']});
  let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
  return {code,output,diagnosticBytes:Buffer.byteLength(output)+Buffer.byteLength(errors)};
 };
 const successful=async(executable,args,environment={})=>{
  const result=await command(executable,args,environment);
  assert.equal(result.code,0,`${executable} succeeds (${result.diagnosticBytes} private diagnostic bytes)`);return result.output;
 };
 const history=async()=>{const response=await api(`/api/monitors/${id}/heartbeat-runs`);assert.equal(response.status,200);return response.data.runs};
 const executeSnippet=async(snippet,expectedExit)=>{
  const before=new Set((await history()).map(run=>run.id));let result;
  if(['curl','wget','bash'].includes(snippet.id)){
   const path=join(directory,`${snippet.id}-${expectedExit}.sh`);await writeFile(path,snippet.code,{mode:0o700});
   result=await command(snippet.id==='bash'?'bash':'sh',[path]);
  }else if(snippet.id==='github-actions'){
   const workflow=yaml.load(snippet.code),step=workflow.jobs.job.steps[0];
   assert.equal(typeof step.run,'string');assert.ok(workflow.on.schedule.length>0);
   const path=join(directory,`github-${expectedExit}.sh`);await writeFile(path,step.run,{mode:0o700});
   result=await command(step.shell,['--noprofile','--norc','-e','-o','pipefail',path],{UPTIME_HEARTBEAT_URL:origin+issued.capabilityPath});
  }else if(snippet.id==='kubernetes'){
   const manifest=yaml.load(snippet.code),container=manifest.spec.jobTemplate.spec.template.spec.containers[0];
   assert.equal(manifest.kind,'CronJob');assert.equal(manifest.spec.schedule,configured.data.definition.heartbeat.cron);
   assert.equal(manifest.spec.timeZone,'America/New_York');assert.ok(Array.isArray(container.command)&&Array.isArray(container.args));
   result=await command(container.command[0],[...container.command.slice(1),...container.args]);
  }else if(snippet.id==='systemd'){
   const installation=join(directory,`systemd-${expectedExit}`);await mkdir(installation,{mode:0o700});
   const script=join(directory,`systemd-install-${expectedExit}.sh`);
   const boundary=snippet.code.indexOf('\nsystemctl --user daemon-reload');assert.ok(boundary>0);
   await writeFile(script,snippet.code.slice(0,boundary),{mode:0o700});
   await successful('sh',[script],{HOME:installation});
   const unitDirectory=join(installation,'.config/systemd/user');
   const parsed=JSON.parse(await successful('python3',['-c',
    "import configparser,json,sys;from pathlib import Path;p=Path(sys.argv[1]);s=configparser.ConfigParser(interpolation=None);s.read(p/'uptime-heartbeat-job.service');t=configparser.ConfigParser(interpolation=None);t.read(p/'uptime-heartbeat-job.timer');print(json.dumps({'command':s['Service']['ExecStart'],'calendar':t['Timer']['OnCalendar'],'persistent':t['Timer'].getboolean('Persistent')}))",unitDirectory]));
   assert.equal(parsed.persistent,false);
   await successful('systemd-analyze',['calendar','--iterations=2',parsed.calendar]);
   result=await command(parsed.command.replaceAll('%h',installation),[]);
  }else assert.fail('unexpected executable scheduler');
  assert.equal(result.code,expectedExit,`${snippet.id} preserves the job exit (${result.diagnosticBytes} private diagnostic bytes)`);
  const added=(await history()).filter(run=>!before.has(run.id)).sort((a,b)=>a.sequence-b.sequence);
  assert.deepEqual(added.map(run=>run.state),['start',expectedExit===0?'success':'fail'],`${snippet.id} records start and completion`);
  assert.equal(added[1].exitCode,expectedExit===0?null:expectedExit);assert.equal(added[1].startedAt,added[0].receivedAt);
  assert.equal(added[1].durationMs,added[1].receivedAt-added[0].receivedAt);assert.ok(added[1].durationMs>=0);
  assert.equal(added[1].revision,issued.revision);assert.equal(added[1].output,'');
 };
 await successful('wget',['--version']);
 const executableIds=['curl','wget','bash','github-actions','kubernetes','systemd'];
 for(const id of executableIds){const snippet=snippets.find(s=>s.id===id);assert.ok(snippet,`${id} example is generated`);await executeSnippet(snippet,0)}
 // The buyer supplies a failing job to the same renderer; no receipt is mocked.
 for(const snippet of heartbeatSnippets({baseUrl:origin+issued.capabilityPath,cron:'30 1 * * *',timeZone:'America/New_York',command:'return 7'}).filter(s=>executableIds.includes(s.id)))await executeSnippet(snippet,7);
 const exported=await api('/api/archive');assert.equal(exported.status,200);assert.ok(!JSON.stringify(exported.data).includes(issued.urlToken));
 const rotated=await api(`/api/monitors/${id}/heartbeat-key`,'POST',{}, {origin});assert.equal(rotated.status,200);assert.equal((await receipt()).status,400);assert.equal((await fetch(origin+issued.receiptPath,{headers:{...protectedHeaders,'x-heartbeat-sequence':'200'}})).status,400);
 const robot=JSON.stringify({data:[{type:'HEARTBEAT',friendlyName:'Migrated robot backup',interval:86400,gracePeriod:3600}],nextLink:null});
 const better=JSON.stringify({data:[{type:'heartbeat',attributes:{name:'Migrated Better Stack backup',period:86400,grace:900}}]});
 for(const [source,body,grace] of [['uptimerobot',robot,3600000],['betterstack-heartbeats',better,900000]]){const imports=definitionDoor({origin,cookie:owner.cookie}),response=await imports.preview(body,source);assert.equal(response.status,200);const plan=response.body;assert.equal(plan.entries[0].target.heartbeat.maxAgeMs,86400000);assert.equal(plan.entries[0].target.heartbeat.graceMs,grace);const applied=await imports.apply(plan);assert.equal(applied.status,200);const imported=(await api('/api/overview')).data.monitors.find(m=>m.definition.name.startsWith(source==='uptimerobot'?'Migrated robot':'Migrated Better'));assert.equal(imported.definition.enabled,false);assert.equal(imported.definition.heartbeat.graceMs,grace)}
 console.log('HEARTBEAT-002: public Worker cron/DST preview, hashed rotated URL authority, GET/HEAD/POST, protected replay refusal, redacted history and real signed failure/recovery passed.');
}finally{await worker?.dispose();await cleanupDirectory(directory)}
