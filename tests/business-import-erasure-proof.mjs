import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {authRequest,deliveredLink,emailSignIn,sessionCookie} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';

// Extend the registered import journey: populate and erase only through public
// HTTP, then inspect both public exports/history and all actual custody stores.
export async function proveIdentityErasure({origin,DB,bindings,grant}){
 const cookie=await emailSignIn(origin,{bindings});
 const call=async(path,body,{method=body===undefined?'GET':'POST',session=cookie,headers={}}={})=>{
  const response=await fetch(origin+path,{method,headers:{origin,cookie:session,'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 const ok=async(path,body,options)=>{const result=await call(path,body,options);assert.ok(result.status>=200&&result.status<300,`${path}: ${result.status} ${JSON.stringify(result.body)}`);return result.body};
 const door=(action,body)=>call('/api/operator/import/'+action,body,{headers:{'x-import-source':'uptimerobot'}});
 const doorOK=async(action,body)=>{const result=await door(action,body);assert.equal(result.status,200,JSON.stringify(result.body));return result.body};
 const business=async(action,body)=>{
  const response=await fetch(origin+'/api/rer/import/'+action,{method:'POST',headers:{authorization:'Bearer '+await grant(action,{},'uptimerobot'),'content-type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const upload=(bytes,name,uploadId)=>doorOK('uploads',{...(uploadId?{uploadId}:{}),name,bundleSha256:hash(bytes),totalBytes:bytes.length,totalChunks:Math.ceil(bytes.length/65536),index:0,
  chunkSha256:hash(bytes.subarray(0,65536)),base64:bytes.subarray(0,65536).toString('base64')});
 const successor='synthetic-custody-owner-1@example.test';
 await ok('/auth/invite',{email:successor,displayName:'Custody owner',role:'owner'});
 const link=await deliveredLink(authRequest(origin),{email:successor,kind:'invite'});
 const successorCookie=sessionCookie(await authRequest(origin)('/auth/confirm',{token:link.searchParams.get('token')}));
 await completeSecondFactor(origin,successorCookie);
 const second=(await ok('/auth/operators')).find(row=>row.email===successor);assert.ok(second);
 for(const [index,kind] of ['operator','destination'].entries()){
  const identity=kind==='operator'?successor:'synthetic-custody-destination-1@example.test';
  const destination=kind==='destination'?await ok('/api/notifications/destinations',{name:'Imported operations contact',kind:'email',address:identity,enabled:false}):null;
  await ok('/api/business-import-settings',{enabled:true,revokedKeyIds:[]});
  const bytes=Buffer.from(JSON.stringify({data:[
   {id:7001+index*10,friendlyName:`Custody checkout ${kind}`,type:'HTTP',url:'https://custody-checkout.example.test/health',interval:300,timeout:5,custodyContact:identity},
   {id:7002+index*10,friendlyName:identity,type:'PING',url:'https://unsupported.example.test/',interval:300},
  ],nextLink:null})+'\n');
  const uploaded=await upload(bytes,identity+'.ndjson',identity);
  const archivedResult=await business('archive',{uploadId:uploaded.uploadId,tool:'uptimerobot',takenAt:new Date().toISOString()});
  assert.equal(archivedResult.status,200,JSON.stringify(archivedResult.body));const archived=archivedResult.body;
  let planned=await door('plan',{uploadId:uploaded.uploadId});
  if(planned.body.error==='catchup_required')planned=await door('plan',{uploadId:uploaded.uploadId,catchup:true});
  assert.equal(planned.status,200,JSON.stringify(planned.body));const plan=planned.body;
  assert.equal(plan.rejected.length,1,'personal data in a rejected entry is also custody');
  let applied;for(let n=0;n<100;n++){
   applied=await doorOK('apply',{planId:plan.planId,reviewedFingerprint:plan.fingerprint});
   if(applied.job.state==='completed')break;
  }
  assert.equal(applied.job.state,'completed');
  const pendingBytes=Buffer.from(JSON.stringify({data:[{id:7101+index,friendlyName:identity,type:'PING',url:'https://pending.example.test/',interval:300}],nextLink:null})+'\n');
  const pending=await upload(pendingBytes,identity+'.pending.ndjson');
  const partial=await upload(Buffer.from(identity+'\n'+'x'.repeat(70000)),identity+'.partial.ndjson');
  assert.equal(partial.complete,false);
  const before=(await ok('/api/definitions/batches')).find(row=>row.id==='business:'+plan.planId);
  assert.equal(before.businessApproval.owner,bindings.OWNER_EMAIL);
  const header=await DB.prepare('SELECT * FROM ik_door_plans WHERE id=?').bind(plan.planId).first();
  const archiveHeader=await DB.prepare('SELECT * FROM ik_door_archives WHERE id=?').bind(archived.archiveId).first();
  const native=await ok('/api/definitions/export');
  await ok('/api/business-import-settings',{enabled:false,revokedKeyIds:['synthetic-revoked-1']});
  const erased=kind==='operator'?await ok('/api/operators/'+second.id+'/erase',{}):await ok('/api/notifications/destinations/'+destination.id,undefined,{method:'DELETE'});
  assert.equal(erased.erased,true);
  for(const table of ['ik_door_approvals','ik_door_chunks','ik_door_uploads','ik_door_plan_chunks','ik_door_archive_chunks','ik_jobs'])assert.ok(erased.receipt.counts[table]>0,`${kind}: populated ${table} counted`);
  const after=(await ok('/api/definitions/batches')).find(row=>row.id===before.id);
  assert.equal(after.withdrawn,true);assert.deepEqual(after.entries,[]);
  assert.equal(after.businessApproval.owner,'Erased identity');
  for(const field of ['approvedAt','fingerprint','via'])assert.equal(after.businessApproval[field],before.businessApproval[field],`${kind}: approval ${field} remains`);
  assert.notEqual(after.businessApproval.approvalId,before.businessApproval.approvalId);
  assert.deepEqual(await DB.prepare('SELECT * FROM ik_door_plans WHERE id=?').bind(plan.planId).first(),header,'opaque fingerprint, bundle hash, previous/job ids and plan lineage stay exact');
  const remainingArchive=await DB.prepare('SELECT * FROM ik_door_archives WHERE id=?').bind(archived.archiveId).first();
  assert.deepEqual(remainingArchive,{...archiveHeader,name:'Withdrawn',tool:'withdrawn',upload_id:archiveHeader.id},'archive receipt stays with anonymous labels and upload reference');
  assert.deepEqual(await ok('/api/definitions/export'),native,'peer native monitors and their fields survive');
  const archive=await ok('/api/archive');assert.ok(!JSON.stringify(archive).includes(identity));
  for(const table of [...Object.keys(archive.payload.tables),...Object.keys(archive.payload.productTables??{})])assert.ok(!table.startsWith('ik_')&&!table.startsWith('uptime_business_import_'),'only opaque per-table erasure counts travel, never import custody');
  for(const action of ['status','apply','reconcile','undo']){
   const refused=await door(action,{planId:plan.planId,...(action==='apply'?{reviewedFingerprint:plan.fingerprint}:{})});
   assert.equal(refused.status,['status','undo'].includes(action)?409:410,`${kind}: old ${action} cannot recover custody`);
   assert.equal(refused.body.error,['status','undo'].includes(action)?'plan_custody_mismatch':'snapshot_withdrawn');
  }
  for(const item of [uploaded,pending,partial])assert.equal((await door('uploads',{uploadId:item.uploadId})).status,404);
  const oldUndo=await call('/api/definitions/batches/'+encodeURIComponent(before.id)+'/undo',{});
  assert.equal(oldUndo.status,400);assert.match(oldUndo.body.error,/custody was erased/);
  const token=await grant('restore-check',{},'uptimerobot');
  const disabled=await fetch(origin+'/api/rer/import/restore-check',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({archiveId:archived.archiveId})});
  assert.equal(disabled.status,404);
  const settings=await ok('/api/business-import-settings');assert.equal(settings.enabled,false);assert.ok(settings.revokedKeyIds.includes('synthetic-revoked-1'));
  await ok('/api/business-import-settings',{enabled:true,revokedKeyIds:[]});
  const restored=await business('restore-check',{archiveId:archived.archiveId});assert.equal(restored.status,410);assert.equal(restored.body.error,'archive_withdrawn');
  await ok('/api/business-import-settings',{enabled:false,revokedKeyIds:[]});
  // Decode binary custody too: a text-only scan would miss an original's bytes.
  const tables=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'ik_*'").all()).results;
  const strings=[],visit=value=>{
   if(typeof value==='string'){strings.push(value);for(const part of value.match(/[A-Za-z0-9+/]{16,}={0,2}/g)??[])strings.push(Buffer.from(part,'base64').toString())}
   else if(value instanceof ArrayBuffer)strings.push(Buffer.from(value).toString());
   else if(Array.isArray(value)&&value.length&&value.every(v=>typeof v==='number'))strings.push(Buffer.from(value).toString());
   else if(value&&typeof value==='object')Object.values(value).forEach(visit);
  };
  for(const {name} of tables)visit((await DB.prepare(`SELECT * FROM "${name}"`).all()).results);
  for(const personal of [identity,bindings.OWNER_EMAIL])assert.ok(!strings.join('\n').includes(personal),`${kind}: personal identity is absent from every door/kit store`);
  if(kind==='operator')assert.equal((await call('/api/overview',undefined,{session:successorCookie})).status,401,'erased owner loses access');
  // Candidate browser evidence is optional output, outside the public checkout.
  if(process.env.UPTIME_IMPORT_ERASURE_EVIDENCE){
   const {chromium}=await import('playwright');
   const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
   try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const [name,...value]=cookie.split('=');await context.addCookies([{name,value:value.join('='),url:origin}]);
    const page=await context.newPage();await page.goto(origin+'/app/archive');
    await page.locator('#definition-batches').getByText('Import custody erased (history only)',{exact:false}).first().waitFor();
    assert.equal(await page.locator('#definition-batches .definition-undo').count(),0);
    assert.ok(!(await page.locator('#definition-batches').innerText()).includes(identity));
    await mkdir(process.env.UPTIME_IMPORT_ERASURE_EVIDENCE,{recursive:true});
    for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:join(process.env.UPTIME_IMPORT_ERASURE_EVIDENCE,`${kind}-history-${width}.png`),fullPage:true})}
   }finally{await browser.close()}
  }
 }
 // Monitor erasure still works after anonymous history was retained.
 const monitor=(await ok('/api/definitions/export')).monitors.find(row=>row.name==='Custody checkout destination');
 const rows=(await ok('/api/overview')).monitors;
 const target=rows.find(row=>row.definition.name===monitor.name);
 await ok('/api/monitors/'+target.id+'/erase',{name:monitor.name});
 assert.ok(!(await ok('/api/definitions/export')).monitors.some(row=>row.name===monitor.name));
}
