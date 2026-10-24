import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {definitionDoor} from './auth-test-support.mjs';
const exec=promisify(execFile);
export async function proveDefinitionCI({directory,origin,cookie,DB,typed}){
 const owner=async(path,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(origin+path,{method,headers:{origin,cookie,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(response.ok,`Owner fixture ${path}: ${response.status}`);return response.json()};
 const issue=scopes=>owner('/api/credentials',{name:'Synthetic definitions deployment',scopes,expiresAt:Date.now()+3600000,environment:'staging',resources:{mode:'selection',monitorIds:[],tags:['ci-team']}});
 const key=await issue(['definitions:preview','definitions:apply']),previewKey=await issue(['definitions:preview']);
 const call=(credential,path,body,environment='staging',extra={})=>fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,authorization:'Bearer '+credential.token,'x-uptime-environment':environment,'content-type':'application/json',...extra},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
 const noScope=await call(key,'/api/definitions/recognise',typed.text,'production');assert.equal(noScope.status,403);
 const deniedBefore=(await DB.prepare('SELECT COUNT(*) n FROM integration_token_usage').first()).n;
 for(const path of ['/api/archive','/api/definitions/export','/api/access/members','/api/v1/monitors'])assert.ok([401,403].includes((await call(key,path)).status));
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM integration_token_usage').first()).n,deniedBefore,'CI scope refusal records no allowed use');
 assert.equal((await call(previewKey,'/api/operator/import/apply',{planId:'unknown',reviewedFingerprint:'x'})).status,403);
 for(const change of [{environment:'production'},{tags:['another-team']},{network:'private',privateGrantRef:'synthetic-denied'}]){const value=structuredClone(typed.document);Object.assign(value.monitors[0],change);assert.equal((await call(key,'/api/definitions/recognise',JSON.stringify(value))).status,403,'source cannot leave credential scope')}
 const before=async()=> (await DB.prepare('SELECT id,revision,definition FROM monitors ORDER BY id').all()).results;
 const initial=await before(),workflow=await readFile('.github/workflows/deploy-definitions.yml','utf8'),shell=workflow.split('        run: |\n')[1].split('\n').map(line=>line.slice(10)).join('\n');
 const execute=async attempt=>{
  const {stdout}=await exec('/bin/bash',['-euo','pipefail','-c',shell],{env:{...process.env,UPTIME_CHECKOUT:process.cwd(),UPTIME_ORIGIN:origin,UPTIME_DEFINITIONS_FILE:resolve(typed.input),UPTIME_ENVIRONMENT:'staging',UPTIME_CI_TOKEN:key.token,UPTIME_SESSION_COOKIE:'',RUNNER_TEMP:resolve(directory),GITHUB_RUN_ID:'synthetic-ci',GITHUB_RUN_ATTEMPT:String(attempt)}});
  const prefix=join(directory,`uptime-definitions-synthetic-ci-${attempt}.preview.json`),preview=JSON.parse(await readFile(prefix,'utf8')),validation=JSON.parse(await readFile(prefix+'.validation','utf8'));
  assert.equal(validation.test.kind,'schema-and-plan-validation');assert.equal(validation.test.runtimeProbesExecuted,false);
  return {preview,result:JSON.parse(stdout.trim().split('\n').at(-1))};
 };
 const deployed=await execute(1);assert.equal(deployed.preview.counts.create,typed.document.monitors.length);assert.equal(deployed.result.report.ok,true);
 const after=await before(),added=after.filter(row=>!initial.some(old=>old.id===row.id));assert.equal(added.length,typed.document.monitors.length);
 for(const row of added){const definition=JSON.parse(row.definition);assert.equal(definition.enabled,false);assert.equal(definition.environment,'staging');assert.deepEqual(definition.tags,['ci-team'])}
 const duplicate=await execute(2);assert.equal(duplicate.result.unchanged,true);assert.deepEqual(await before(),after,'same typed source in the workflow does not create another revision');
 const namespace=deployed.result.preview.namespace,planId=deployed.result.preview.planId;
 assert.equal((await call(key,'/api/operator/import/undo',{planId},'staging',{'x-import-source':namespace})).status,403,'CI cannot undo applied work');
 assert.equal((await call(previewKey,'/api/definitions/plans/'+encodeURIComponent(planId))).status,404,'another key cannot read the plan custody');
 // A CLI apply re-plans and refuses a changed file against the retained review digest.
 const drift=structuredClone(typed.document);drift.monitors[0].intervalMs=120000;const driftPath=join(directory,'ci-drift.json');await writeFile(driftPath,JSON.stringify(drift),{mode:0o600});
 await assert.rejects(exec(process.execPath,['scripts/definitions.mjs','apply','--origin',origin,'--environment','staging','--input',driftPath,'--digest',duplicate.preview.reviewDigest,'--json'],{env:{...process.env,UPTIME_CI_TOKEN:key.token,UPTIME_SESSION_COOKIE:''}}));assert.deepEqual(await before(),after,'drift is refused before native writes');
 // Prepare an unapplied review through the real upload/plan transport, revoke,
 // then resume it with the same token. The next batch cannot use old admission.
 const jobDocument={...typed.document,monitors:Array.from({length:21},(_,index)=>({...typed.document.monitors[0],name:`synthetic-uptime-background-${index+1}`}))};
 const suspended=await issue(['definitions:preview','definitions:apply']),recognised=await call(suspended,'/api/definitions/recognise',JSON.stringify(jobDocument));assert.equal(recognised.status,200);const source=await recognised.json(),bytes=Buffer.from(JSON.stringify(source.text)+'\n'),hash=value=>createHash('sha256').update(value).digest('hex');
 const sent=await call(suspended,'/api/operator/import/uploads',{name:'definitions.ndjson',bundleSha256:hash(bytes),totalBytes:bytes.length,totalChunks:1,index:0,chunkSha256:hash(bytes),base64:bytes.toString('base64')},'staging',{'x-import-source':source.namespace});assert.equal(sent.status,200);const upload=await sent.json();
 const planned=await call(suspended,'/api/operator/import/plan',{uploadId:upload.uploadId},'staging',{'x-import-source':source.namespace});assert.equal(planned.status,200);const saved=await planned.json();
 const firstBatch=await call(suspended,'/api/operator/import/apply',{planId:saved.planId,reviewedFingerprint:saved.fingerprint},'staging',{'x-import-source':source.namespace});assert.equal(firstBatch.status,200);const progress=await firstBatch.json();assert.ok(['applying','queued'].includes(progress.job.state),'21 records require a later batch');
 const authorizedResults=await before();assert.equal(authorizedResults.filter(row=>JSON.parse(row.definition).name.startsWith('synthetic-uptime-background-')).length,20,'first authorized batch persists');
 await owner('/api/credentials/'+suspended.credential.id,undefined,'DELETE');
 const revoked=await call(suspended,'/api/operator/import/apply',{planId:saved.planId,reviewedFingerprint:saved.fingerprint},'staging',{'x-import-source':source.namespace});assert.equal(revoked.status,401);assert.deepEqual(await before(),authorizedResults,'revoked next batch writes no monitor/revision and preserves the authorized batch');
 const batches=(await DB.prepare('SELECT actor_kind,actor_ref FROM definition_batches WHERE id=?').bind(saved.planId).all()).results;assert.ok(batches.every(row=>row.actor_kind==='operator'&&row.actor_ref));
 // A current monitor moved out by its owner is no longer writable by CI.
 const moved=added[0],definition=JSON.parse(moved.definition);await owner('/api/monitors/'+moved.id,{...definition,environment:'production'},'PATCH');
 assert.equal((await call(key,'/api/definitions/recognise',typed.text)).status,403);
 await owner('/api/monitors/'+moved.id,definition,'PATCH');
 // Owners retain ordinary export and preserving undo of the real CI batch.
 const exported=await owner('/api/definitions/export');for(const input of typed.document.monitors)assert.ok(exported.monitors.some(m=>m.name===input.name&&m.environment===input.environment));
 const roundtrip={...exported,monitors:exported.monitors.filter(m=>typed.document.monitors.some(input=>input.name===m.name))},roundtripView=await definitionDoor({origin,cookie}).preview(JSON.stringify(roundtrip),'uptime.monitors');assert.equal(roundtripView.status,200);assert.equal(roundtripView.body.counts.unchanged,typed.document.monitors.length,'typed deployment survives owner export and native preview roundtrip');
 let undone;for(let n=0;n<100;n++){const response=await fetch(origin+'/api/operator/import/undo',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-import-source':namespace},body:JSON.stringify({planId})});assert.equal(response.status,200);undone=await response.json();if(undone.job?.state==='undone')break;assert.ok(['queued','undoing'].includes(undone.job?.state))}assert.equal(undone.job.state,'undone');
 console.log('CODE-001 bounded CI: actual workflow preview/semantic test/apply with least-scope token, typed JSON parity, paused deployment, replay/drift and environment/tag refusals, token revocation before resumed apply, owner export/undo. Runtime probe execution and hosted Actions remain gaps.');
}
