// U2: extend the registered Business-door journey on a fresh test installation.
// All import/native mutations and observations use public HTTP doors. Only the
// checked service is synthetic; the signed Node runner creates real run history.
import assert from 'node:assert/strict';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts,waitFor,fixtureProcess} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,finishSetup} from './auth-test-support.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';

export async function proveBoundedCatchup(){
 const directory=await runtimeDirectory(),[port,fixturePort]=await availablePorts(2),origin=`http://127.0.0.1:${port}`;
 const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),kid='synthetic-catchup-1';
 const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,UPTIME_SYNTHETIC_PORT:String(fixturePort),
  RER_OWNER_CLAIM_ISSUER:'https://business.example.test',RER_OWNER_CLAIM_INSTALLATION_ID:'synthetic-catchup-1',
  RER_OWNER_CLAIM_APP_ORIGIN:origin,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:await webcrypto.subtle.exportKey('jwk',keys.publicKey)})};
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),grantPath=join(directory,'grant.json');
 let worker,fixture;
 try{
  ({worker}=await migratedWorker({port,persist:join(directory,'local'),bindings}));
  const cookie=sessionCookie(await authRequest(origin)('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Catch-up owner'}));
  await finishSetup(origin,cookie);
  const owner=async(path,body,method=body===undefined?'GET':'POST')=>{
   const response=await fetch(origin+path,{method,headers:{origin,cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
   assert.ok(response.ok,`${method} ${path}: ${response.status}`);return response.json();
  };
  const door=async(action,body,extra={})=>{
   const now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
   const input=encode({alg:'ES256',typ:'rer-import-grant+jwt',kid})+'.'+encode({v:1,iss:bindings.RER_OWNER_CLAIM_ISSUER,aud:origin,
    installationId:bindings.RER_OWNER_CLAIM_INSTALLATION_ID,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat:now,exp:now+300,
    action,namespace:'uptimerobot',maxBytes:2*1024*1024,maxChunks:32,maxRecords:100,...extra});
   const signature=Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,Buffer.from(input))).toString('base64url');
   const response=await fetch(origin+'/api/rer/import/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+input+'.'+signature},body:JSON.stringify(body)});
   return {status:response.status,body:await response.json()};
  };
  const good=async(action,body,extra)=>{
   const result=await door(action,body,extra);assert.equal(result.status,200,`${action}: ${JSON.stringify(result.body)}`);return result.body;
  };
  const until=async(action,plan,approval,state)=>{
   for(let batch=0;batch<100;batch++){
    const result=await good(action,{planId:plan.planId,...(action==='apply'?{reviewedFingerprint:plan.fingerprint}:{})},
     action==='apply'?{...approval,fingerprint:plan.fingerprint}:undefined);
    if(result.job.state===state)return result.job;
    assert.ok(['queued','applying','undoing'].includes(result.job.state));
   }
   assert.fail(`${action} did not finish`);
  };
  const uploaded=async records=>{
   const bytes=Buffer.from(JSON.stringify({data:records,nextLink:null})+'\n');
   const upload=await good('uploads',{name:'uptimerobot.synthetic-catchup.ndjson',bundleSha256:hash(bytes),totalBytes:bytes.length,
    totalChunks:1,index:0,chunkSha256:hash(bytes),base64:bytes.toString('base64')});
   assert.equal(upload.complete,true);return {uploadId:upload.uploadId,bundleSha256:hash(bytes)};
  };
  const definitions=async()=>(await owner('/api/definitions/export')).monitors.sort((a,b)=>a.name.localeCompare(b.name));
  const monitor=async id=>(await owner('/api/overview')).monitors.find(row=>row.id===id),history=async id=>owner('/api/monitors/'+id+'/history');
  const revisions=async id=>owner('/api/monitors/'+id+'/revisions');
  const batches=async()=>owner('/api/definitions/batches');
  await owner('/api/business-import-settings',{enabled:true,revokedKeyIds:[]});
  await owner('/api/overview');

  // A real run precedes the import; adopting this paused native monitor must not
  // delete its immutable revision, slot, assignment or signed observation.
  fixture=fixtureProcess(fixturePort,grantPath,directory);
  await waitFor(async()=>(await fetch(`http://127.0.0.1:${fixturePort}/health`)).ok,'catch-up checked service');
  const native=await owner('/api/monitors',{name:'Checkout API',type:'http',url:`http://127.0.0.1:${fixturePort}/health`,
   intervalMs:300000,probes:['local-a'],retries:0,confirmSlots:2,recoverSlots:2,assertions:{status:200}});
  await runRunner({origin,key:bindings.UPTIME_RUNNER_KEY,grantPath,localReview:true,once:true});
  const runHistory=await history(native.id);
  assert.equal(runHistory.length,1);assert.equal(runHistory[0].status,'complete');
  assert.ok(runHistory[0].observations.length>0&&runHistory[0].observations.every(row=>row.outcome==='pass'));
  const paused=await owner('/api/monitors/'+native.id,{...native.definition,enabled:false},'PATCH');
  const originalRevisions=await revisions(native.id);
  const initial=await definitions();
  const base=Array.from({length:50},(_,i)=>({id:6001+i,friendlyName:i===0?'Checkout API':`Store ${i} ${i%2?'catalog':'health'}`,
   type:i%2?'KEYWORD':'HTTP',url:`https://store${i}.example.test/${i%2?'catalog':'health'}`,interval:[60,300,900][i%3],timeout:5,
   httpMethodType:'GET',successHttpResponseCodes:['200'],status:'PAUSED',
   ...(i%2?{keywordType:'ALERT_NOT_EXISTS',keywordValue:'In stock',keywordCaseType:'CaseSensitive'}:{}),
   assignedAlertContacts:[{id:71,type:'Email',value:'synthetic-catchup-1@example.test',threshold:0,recurrence:0}]}));
  const explicit={approvalRecordId:'synthetic-catchup-review-1',approvedAt:new Date().toISOString()};
  const standing={catchup:'bounded',approvalRecordId:'synthetic-catchup-standing-1',approvedAt:new Date().toISOString()};
  const firstUpload=await uploaded(base),first=await good('plan',{uploadId:firstUpload.uploadId});
  assert.equal(first.bundleSha256,firstUpload.bundleSha256);assert.equal(first.counts.effects,50);assert.deepEqual(first.rejected,[]);
  assert.deepEqual(await definitions(),initial,'baseline plan has no native effects');
  await until('apply',first,explicit,'completed');
  const baseline=await definitions();assert.equal(baseline.length,50);assert.ok(baseline.every(row=>row.enabled===false));
  for(const record of base){
   const row=baseline.find(row=>row.name===record.friendlyName);assert.equal(row.intervalMs,record.interval*1000);
   assert.equal(row.url,record.url);assert.equal(row.assertions.status,200);
   if(record.type==='KEYWORD')assert.equal(row.assertions.bodyIncludes,record.keywordValue);
  }
  assert.equal((await monitor(native.id)).definition.name,'Checkout API','adoption preserves native identity');
  const reconciled=async(plan,upload,records)=>{
   const report=await good('reconcile',{planId:plan.planId});assert.equal(report.ok,true);
   assert.equal(report.bundleSha256,upload.bundleSha256);assert.equal(report.fingerprint,plan.fingerprint);
   assert.equal(report.counts.sourceRecords,records.length);assert.equal(report.counts.present+report.counts.explained,records.length);
   assert.equal(report.counts.nativeTargets,records.length);
   const explained=report.sourceIds.filter(row=>row.status==='explained');
   assert.ok(explained.length>0&&explained.every(row=>/alert contact.*not imported/.test(row.reason)),'contact omissions are explained on changed records; unchanged records retain their earlier targets');
   assert.deepEqual(report.sourceIds.map(row=>row.sourceId).sort(),records.map(row=>String(row.id)).sort());
  };
  await reconciled(first,firstUpload,base);
  const inert=async()=>{
   assert.deepEqual(await history(native.id),runHistory,'import and undo preserve the exact completed run');
   const archive=await owner('/api/archive');
   for(const table of ['notification_destinations','notification_jobs','outbox'])assert.deepEqual(archive.payload.productTables?.[table]??archive.payload.tables[table],[],`${table}: contacts remain inert`);
  };
  await inert();

  const changed={...base[0],interval:600,timeout:7,url:'https://checkout.example.test/v2/health'};
  const added={...base[2],id:6101,friendlyName:'Payments worker',url:'https://payments.example.test/health',interval:120};
  const secondRecords=[changed,...base.slice(1),added];
  const beforeRefusal=async()=>({definitions:await definitions(),history:await history(native.id),revisions:await revisions(native.id),batches:await batches()});
  const refused=async(records,reason)=>{
   const upload=await uploaded(records),before=await beforeRefusal();
   const result=await door('plan',{uploadId:upload.uploadId,catchup:true},standing);
   assert.equal(result.status,409,JSON.stringify(result.body));assert.equal(result.body.error,'catchup_requires_proposal:'+reason);
   assert.deepEqual(await beforeRefusal(),before,'refused standing catch-up leaves native data and approved history intact');
  };
  // A removed vendor record never authorizes deletion. This exact second bundle
  // needs a separate owner proposal, despite its otherwise permitted changes.
  await refused(secondRecords.filter(row=>row.id!==base.at(-1).id),'source_records_gone');
  await refused(secondRecords.map(row=>row.id===base[1].id?{...row,interval:1800}:row),'change_must_be_under_five_percent');
  const secondUpload=await uploaded(secondRecords),beforePlan=await beforeRefusal();
  const second=await good('plan',{uploadId:secondUpload.uploadId,catchup:true},standing);
  assert.deepEqual(await beforeRefusal(),beforePlan,'bounded planning does not mutate native data');
  assert.deepEqual(second.summary,{sourceRecords:51,created:1,updated:1,unchanged:49,gone:0});
  const wrongStanding=await door('apply',{planId:second.planId,reviewedFingerprint:second.fingerprint},
   {...standing,approvalRecordId:'synthetic-catchup-other-1',fingerprint:second.fingerprint});
  assert.equal(wrongStanding.status,403);assert.equal(wrongStanding.body.error,'standing_approval_mismatch');
  assert.deepEqual(await beforeRefusal(),beforePlan,'another standing approval cannot apply the plan');
  await until('apply',second,standing,'completed');await reconciled(second,secondUpload,secondRecords);await inert();
  const after=await definitions(),replacement=after.find(row=>row.name===changed.friendlyName);
  assert.equal(replacement.url,changed.url);assert.equal(replacement.intervalMs,600000);assert.equal(replacement.timeoutMs,7000);
  assert.ok(after.every(row=>row.enabled===false));assert.equal(after.find(row=>row.name===added.friendlyName).url,added.url);
  assert.deepEqual(after.filter(row=>![changed.friendlyName,added.friendlyName].includes(row.name)),baseline.filter(row=>row.name!==changed.friendlyName));
  const approved=(await batches()).filter(row=>[first,second].some(plan=>row.id==='business:'+plan.planId));
  assert.equal(approved.length,2);assert.equal(approved.find(row=>row.id==='business:'+second.planId).businessApproval.approvalId,standing.approvalRecordId);
  // An owner edit is outside the standing allowance even when only one source
  // record would change. Leave that edit in place through both undo layers.
  const peer=(await owner('/api/overview')).monitors.find(row=>row.definition.name===base[2].friendlyName);
  const handEdited=await owner('/api/monitors/'+peer.id,{...peer.definition,timeoutMs:8000},'PATCH');
  await refused(secondRecords.map(row=>row.id===base[2].id?{...row,timeout:9}:row),'native_or_mapping_conflict');
  assert.deepEqual((await monitor(peer.id)).definition,handEdited.definition,'standing approval preserves the owner edit');
  const appliedRevisions=await revisions(native.id);
  const beforeOldFirst=await definitions();
  const oldFirst=await door('undo',{planId:first.planId});assert.equal(oldFirst.status,409);assert.equal(oldFirst.body.error,'import_superseded');
  assert.deepEqual(await definitions(),beforeOldFirst,'oldest-first undo writes nothing');
  await until('undo',second,undefined,'undone');
  const afterUndo=await definitions();
  assert.deepEqual(afterUndo.filter(row=>![added.friendlyName,base[2].friendlyName].includes(row.name)),baseline.filter(row=>row.name!==base[2].friendlyName),'newest undo restores the preceding definitions');
  assert.equal(afterUndo.find(row=>row.name===added.friendlyName).enabled,false,'new monitor remains paused under Uptime undo policy');
  await until('undo',first,undefined,'undone');await inert();
  const finalDefinitions=await definitions();
  assert.equal(finalDefinitions.length,51);assert.ok(finalDefinitions.every(row=>row.enabled===false),'undo keeps the imported monitors paused rather than deleting them');
  assert.deepEqual((await monitor(peer.id)).definition,handEdited.definition,'layered undo preserves the owner edit');
  assert.deepEqual((await monitor(native.id)).definition,paused.definition,'baseline undo restores its pre-import native definition');
  const finalRevisions=await revisions(native.id);
  for(const revision of [...originalRevisions,...appliedRevisions])assert.deepEqual(finalRevisions.find(row=>row.revision===revision.revision),revision,'immutable revisions survive layered undo');
  for(const prior of approved){
   const retained=(await batches()).find(row=>row.id===prior.id);assert.ok(retained.undone);
   assert.deepEqual(retained.businessApproval,prior.businessApproval,'approvals and fingerprints remain in owner history');
  }
  console.log('Bounded signed catch-up passed: 50 paused monitors, real signed run retained; changed/additional monitor reconciled; gone, over-allowance and manual-edit refusals; newest-first undo retains revisions and approvals.');
 }finally{await fixture?.stop();await worker?.dispose();await cleanupDirectory(directory)}
}
