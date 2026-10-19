// One public-door journey: synthetic saved UptimeRobot pages, signed grants and the
// owner's session, native zero-write preview, reviewed apply, server readback, both
// undo doors, and Base's copied conformance check through the grant and owner mounts.
import assert from 'node:assert/strict';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,finishSetup} from './auth-test-support.mjs';

const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicKey=await webcrypto.subtle.exportKey('jwk',keys.publicKey),kid='business-test';
const rotated=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),rotatedKid='business-test-2';
const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,RER_OWNER_CLAIM_ISSUER:'https://business.example.test',
 RER_OWNER_CLAIM_INSTALLATION_ID:'synthetic-uptime-installation',RER_OWNER_CLAIM_APP_ORIGIN:origin,
 RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:publicKey,[rotatedKid]:await webcrypto.subtle.exportKey('jwk',rotated.publicKey)})};
const source=Buffer.from(JSON.stringify({data:[
 {id:1001,friendlyName:'Checkout API',type:'HTTP',url:'https://checkout.example.test/health',interval:300,timeout:5,httpMethodType:'GET',successHttpResponseCodes:['200','201']},
 {id:1002,friendlyName:'Storefront',type:'KEYWORD',url:'https://shop.example.test/',interval:300,timeout:5,httpMethodType:'GET',keywordType:'ALERT_NOT_EXISTS',keywordValue:'Add to cart',keywordCaseType:'CaseSensitive'},
 {id:1003,friendlyName:'Legacy ping',type:'PING',url:'https://legacy.example.test/',interval:300},
],nextLink:null})+'\n');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const approval={approvalRecordId:'synthetic-owner-browser-approval',approvedAt:new Date().toISOString()};
// Copied from Base modules/import-kit/src/door/ADOPTING.md (rer 0.2.61); its imports are above.
export async function checkDoor({request, bytes, name, nativeSnapshot,
  assertApplied, assertUndone}) {
  const hash = b => createHash('sha256').update(b).digest('hex');
  const json = async (action, body, review, expected = 200) => {
    const response = await request(action, body, review);
    assert.equal(response.status, expected, `${action}: ${response.status}`);
    return response.json();
  };
  const until = async (action, body, review, state) => {
    for (let batch = 0; batch < 100; batch++) {
      const result = await json(action, body, review);
      if (result.job?.state === state) return result.job;
      assert.ok(['queued','applying','undoing'].includes(result.job?.state));
    }
    assert.fail(`${action} did not finish`);
  };
  assert.ok(bytes.length > 0);
  const before = await nativeSnapshot(), bundleSha256 = hash(bytes);
  const totalChunks = Math.ceil(bytes.length / 65536);
  let uploadId;
  for (let index = 0; index < totalChunks; index++) {
    const chunk = bytes.subarray(index * 65536, (index + 1) * 65536);
    const uploaded = await json('uploads', {uploadId, name, bundleSha256,
      totalBytes:bytes.length, totalChunks, index,
      chunkSha256:hash(chunk), base64:chunk.toString('base64')});
    uploadId = uploaded.uploadId;
  }
  const inventory = await json('uploads', {uploadId});
  assert.equal(inventory.complete, true);
  assert.equal(inventory.bundleSha256, bundleSha256);
  assert.equal(inventory.received.reduce((n,c) => n + c.size, 0), bytes.length);
  const plan = await json('plan', {uploadId});
  assert.equal(plan.bundleSha256, bundleSha256);
  assert.ok(plan.summary.sourceRecords > 0);
  assert.deepEqual(await nativeSnapshot(), before);
  const review = {fingerprint:plan.fingerprint,
    approvalRecordId:randomUUID(), approvedAt:new Date().toISOString()};
  const wrong = (plan.fingerprint[0] === '0' ? '1' : '0') + plan.fingerprint.slice(1);
  await json('apply', {planId:plan.planId, reviewedFingerprint:wrong}, review, 403);
  assert.deepEqual(await nativeSnapshot(), before);
  const job = await until('apply', {planId:plan.planId,
    reviewedFingerprint:plan.fingerprint}, review, 'completed');
  const status = await json('status', {planId:plan.planId});
  assert.equal(status.job.id, job.id);
  assert.equal(status.job.state, 'completed');
  const report = await json('reconcile', {planId:plan.planId});
  assert.equal(report.ok, true);
  assert.equal(report.fingerprint, plan.fingerprint);
  assert.equal(report.bundleSha256, bundleSha256);
  assert.equal(report.counts.sourceRecords, plan.summary.sourceRecords);
  assert.equal(report.counts.present + report.counts.explained, report.counts.sourceRecords);
  assert.equal(report.sourceIds.length, report.counts.sourceRecords);
  await assertApplied(before, await nativeSnapshot(), report);
  await until('undo', {planId:plan.planId}, undefined, 'undone');
  await assertUndone(before, await nativeSnapshot());
}
let worker;
try{
 const runtime=await migratedWorker({port,persist:join(directory,'local'),bindings});worker=runtime.worker;const {DB}=runtime;
 const cookie=sessionCookie(await authRequest(origin)('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Migration owner'}));await finishSetup(origin,cookie);
 const owner=async(path,body)=>{const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 const settings=body=>owner('/api/business-import-settings',body);
 async function grant(action,extra={},namespace='uptimerobot',signer=keys,signerKid=kid){
  const now=Math.floor(Date.now()/1000),header=Buffer.from(JSON.stringify({alg:'ES256',typ:'rer-import-grant+jwt',kid:signerKid})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({v:1,iss:bindings.RER_OWNER_CLAIM_ISSUER,aud:origin,installationId:bindings.RER_OWNER_CLAIM_INSTALLATION_ID,email:bindings.OWNER_EMAIL,
   jti:randomUUID(),iat:now,exp:now+300,action,namespace,maxBytes:2*1024*1024,maxChunks:32,maxRecords:500,...extra})).toString('base64url');
  return header+'.'+payload+'.'+Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.privateKey,Buffer.from(header+'.'+payload))).toString('base64url');
 }
 const door=async(action,body,extra={},namespace)=>{const token=await grant(action,extra,namespace);const r=await fetch(origin+'/api/rer/import/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 const good=async(action,body,extra,namespace)=>{const r=await door(action,body,extra,namespace);assert.equal(r.status,200,`${action}: ${JSON.stringify(r.body)}`);return r.body};
 const snapshot=async()=>{const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'ik_%' AND name<>'_cf_METADATA' ORDER BY name").all()).results.map(row=>row.name);return Object.fromEntries(await Promise.all(names.map(async name=>[name,(await DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results])))};

 function nativeUnchanged(before,after,requests,label){
  const old=before.public_rate_limits,current=after.public_rate_limits;
  assert.deepEqual(current.filter(row=>row.class!=='imports'),old.filter(row=>row.class!=='imports'),'other admission classes stay unchanged');
  const imports=rows=>rows.filter(row=>row.class==='imports');
  assert.equal(imports(current).reduce((n,row)=>n+row.request_count,0)-imports(old).reduce((n,row)=>n+row.request_count,0),requests,'only the expected import requests are counted');
  for(const previous of imports(old)){
   const row=current.find(row=>row.class===previous.class&&row.client_hash===previous.client_hash&&row.window_start===previous.window_start);
   assert.ok(row,'existing admission rows are retained');assert.ok(row.request_count>=previous.request_count);
   assert.deepEqual({...row,request_count:previous.request_count},previous,'admission metadata stays intact');
  }
  assert.deepEqual({...after,public_rate_limits:old},before,label);
 }

 assert.equal((await door('uploads',{})).status,404,'off by default before grant/body admission');
 assert.equal((await settings()).body.enabled,false);
 assert.equal((await fetch(origin+'/api/business-import-settings')).status,401);
 assert.equal((await settings({enabled:true,revokedKeyIds:[]})).status,200);
 // Establish the actual runner using Uptime's ordinary console door.
 assert.equal((await owner('/api/overview')).status,200);
 // One server-owned allow-list serves both mounts; other namespaces are refused before any write.
 const custody=async()=>(await DB.prepare("SELECT (SELECT COUNT(*) FROM ik_door_grants)+(SELECT COUNT(*) FROM ik_door_uploads)+(SELECT COUNT(*) FROM ik_door_scopes) AS n").first()).n;
 const custodyBefore=await custody();
 const foreign=await door('uploads',{},{},'pagerduty');assert.equal(foreign.status,403);assert.equal(foreign.body.error,'unknown_import_source');
 const ownerDoor=async(action,body,{source='uptimerobot',from=origin,session=cookie}={})=>{const r=await fetch(origin+'/api/operator/import/'+action,{method:'POST',
  headers:{origin:from,...(session?{cookie:session}:{}),'content-type':'application/json','x-import-source':source},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 assert.equal((await ownerDoor('status',{planId:'x'},{session:null})).status,401,'anonymous callers are refused');
 assert.equal((await ownerDoor('status',{planId:'x'},{from:'https://elsewhere.example.test'})).body.error,'origin_required','cross-origin calls are refused');
 assert.equal((await ownerDoor('status',{planId:'x'},{source:'pagerduty'})).body.error,'unknown_import_source');
 assert.equal((await fetch(origin+'/api/rer/import/status',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:'{}'})).status,401,'a session never stands in for a Business grant');
 assert.equal(await custody(),custodyBefore,'refused calls write no door custody');
 const upload=await good('uploads',{name:'uptimerobot.synthetic.ndjson',bundleSha256:hash(source),totalBytes:source.length,totalChunks:1,index:0,chunkSha256:hash(source),base64:source.toString('base64')});
 const beforePlan=await snapshot(),plan=await good('plan',{uploadId:upload.uploadId});
 nativeUnchanged(beforePlan,await snapshot(),1,'planning writes no native or installation product state');
 assert.equal(plan.counts.input,3);assert.equal(plan.counts.effects,2);assert.equal(plan.rejected.length,1);
 assert.match(plan.rejected[0].reason,/not supported/);
 assert.equal((await door('apply',{planId:plan.planId,reviewedFingerprint:'0'.repeat(64)},{...approval,fingerprint:plan.fingerprint})).status,403);
 nativeUnchanged(beforePlan,await snapshot(),2,'wrong reviewed fingerprint cannot write');
 let applied=await good('apply',{planId:plan.planId,reviewedFingerprint:plan.fingerprint},{...approval,fingerprint:plan.fingerprint});
 for(let n=0;applied.job.state!=='completed'&&n<10;n++)applied=await good('apply',{planId:plan.planId,reviewedFingerprint:plan.fingerprint},{...approval,fingerprint:plan.fingerprint});
 assert.equal(applied.job.state,'completed');
 const rows=(await DB.prepare('SELECT * FROM monitors ORDER BY id').all()).results;
 assert.equal(rows.length,2);assert.ok(rows.every(row=>JSON.parse(row.definition).enabled===false));
 assert.deepEqual(JSON.parse(rows.find(row=>JSON.parse(row.definition).name==='Checkout API').definition).assertions.status,[200,201]);
 for(const name of ['observations','slots','outbox','notification_jobs','notification_destinations','heartbeat_authority'])assert.deepEqual((await snapshot())[name],beforePlan[name],`${name} stays inert`);
 // The owner's private archive stays exportable with door rows present, and carries no import custody.
 const exported=async label=>{const archive=await owner('/api/archive');assert.equal(archive.status,200,`${label}: ${JSON.stringify(archive.body)}`);
  assert.doesNotMatch(JSON.stringify(archive.body),/ik_(jobs|door|provenance)|uptime_business_import_targets/,`${label}: no import custody in the archive`);return archive.body};
 const ownerId=(await DB.prepare('SELECT id FROM oa_operators').first()).id;
 const importAudit=archive=>[...Object.values(archive.payload.tables),...Object.values(archive.payload.productTables??{})].flat().filter(row=>row?.action?.startsWith?.('business_import_'));
 const afterApply=importAudit(await exported('after apply'));
 assert.equal(afterApply.length,2);assert.ok(afterApply.every(row=>row.action==='business_import_create'&&row.actor_kind==='operator'&&row.actor_ref===ownerId&&row.subject_kind==='monitor'),'door audit names the owner operator');
 const reconciliation=await good('reconcile',{planId:plan.planId});assert.equal(reconciliation.ok,true);assert.equal(reconciliation.counts.sourceRecords,3);assert.equal(reconciliation.counts.nativeTargets,2);
 const status=await good('status',{planId:plan.planId});assert.equal(status.approval.approval_id,approval.approvalRecordId);
 const history=(await owner('/api/definitions/batches')).body,batch=history.find(row=>row.id==='business:'+plan.planId);
 assert.equal(batch.businessApproval.fingerprint,plan.fingerprint);assert.equal(batch.businessApproval.owner,bindings.OWNER_EMAIL);assert.equal(batch.entries.length,2);
 const undone=await good('undo',{planId:plan.planId});assert.equal(undone.job.state,'undone');
 assert.deepEqual((await DB.prepare('SELECT * FROM monitors ORDER BY id').all()).results,rows,'undo keeps paused native monitors and their history');
 assert.equal((await owner('/api/definitions/batches')).body.find(row=>row.id===batch.id).undone,true);
 // Undo released those monitors to Uptime: a changed export of the same records explains them at plan time instead of
 // offering additions an apply would refuse, and the plan is cancelled without a write.
 const changedSource=Buffer.from(source.toString().replaceAll('"timeout":5','"timeout":7'));
 const changedUpload=await good('uploads',{name:'uptimerobot.changed.ndjson',bundleSha256:hash(changedSource),totalBytes:changedSource.length,totalChunks:1,index:0,chunkSha256:hash(changedSource),base64:changedSource.toString('base64')});
 const beforeReplan=await snapshot(),released=await good('plan',{uploadId:changedUpload.uploadId});
 assert.equal(released.counts.effects,0,'released monitors are never offered as additions');
 assert.deepEqual(released.rejected.map(row=>row.sourceId).sort(),['1001','1002','1003']);
 for(const row of released.rejected.filter(row=>row.sourceId!=='1003'))assert.match(row.reason,/released by undo or erasure; it stays in Uptime as its own monitor\. Erase that monitor to import it again\./);
 assert.equal((await good('undo',{planId:released.planId})).state,'cancelled');
 nativeUnchanged(beforeReplan,await snapshot(),2,'planning and cancelling the released export write nothing native');
 assert.ok(importAudit(await exported('after undo')).some(row=>row.action==='business_import_undo'&&row.actor_ref===ownerId));
 // The ordinary owner history remains an undo door after Business is disabled or its key revoked.
 assert.equal((await settings({enabled:false,revokedKeyIds:[kid]})).status,200);
 assert.equal((await door('status',{planId:plan.planId})).status,404);
 assert.equal((await owner('/api/definitions/batches/'+encodeURIComponent(batch.id)+'/undo',{})).status,200);
 assert.equal((await settings({enabled:true,revokedKeyIds:[]})).status,200);
 assert.deepEqual((await settings()).body.revokedKeyIds,[kid]);
 assert.equal((await door('status',{planId:plan.planId})).status,403,'revoked keys remain revoked after re-enabling');
 // Base's public HTTP conformance, once per mount, each on new synthetic source records.
 const definitionFile=async()=>(await owner('/api/definitions/export')).body.monitors.map(m=>JSON.stringify(m)).sort();
 const conformance=(from,names)=>({bytes:Buffer.from(JSON.stringify({data:names.map((name,i)=>({id:from+i,friendlyName:name,type:'HTTP',
  url:`https://s${from+i}.example.test/health`,interval:300,timeout:30,httpMethodType:'GET',successHttpResponseCodes:['200']})),nextLink:null})+'\n'),
  name:'uptimerobot.conformance.ndjson',nativeSnapshot:definitionFile,
  async assertApplied(before,after,report){
   const added=after.filter(row=>!before.includes(row)).map(row=>JSON.parse(row));
   assert.deepEqual(added.map(m=>m.name).sort(),[...names].sort());assert.ok(added.every(m=>m.enabled===false&&m.type==='http'&&m.assertions.status===200));
   assert.equal(report.counts.nativeTargets,(await DB.prepare('SELECT COUNT(*) n FROM uptime_business_import_targets WHERE retired=0').first()).n);
  },
  async assertUndone(before,after){
   // Uptime's undo releases import ownership and keeps the paused monitors and their history.
   const kept=after.filter(row=>!before.includes(row)).map(row=>JSON.parse(row));
   assert.deepEqual(kept.map(m=>m.name).sort(),[...names].sort());assert.ok(kept.every(m=>m.enabled===false));
  }});
 await checkDoor({...conformance(2001,['Grant conformance A','Grant conformance B']),request:async(action,body,review)=>{
  const extra=action==='apply'?{fingerprint:review.fingerprint,approvalRecordId:review.approvalRecordId,approvedAt:review.approvedAt}:{};
  return fetch(origin+'/api/rer/import/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+await grant(action,extra,'uptimerobot',rotated,rotatedKid)},body:JSON.stringify(body)});
 }});
 await checkDoor({...conformance(3001,['Owner conformance A','Owner conformance B']),request:(action,body)=>fetch(origin+'/api/operator/import/'+action,{method:'POST',
  headers:{origin,cookie,'content-type':'application/json','x-import-source':'uptimerobot'},body:JSON.stringify(body)})});
 const owned=(await owner('/api/definitions/batches')).body.filter(row=>row.businessApproval?.via==='owner');
 assert.equal(owned.length,1,'the owner-session import is in the same history');assert.equal(owned[0].undone,true);
 const erased=rows.find(row=>JSON.parse(row.definition).name==='Checkout API');
 const erasure=await owner('/api/monitors/'+erased.id+'/erase',{name:'Checkout API'});assert.equal(erasure.status,200,JSON.stringify(erasure.body));
 assert.equal(await DB.prepare('SELECT id FROM monitors WHERE id=?').bind(erased.id).first(),null);
 assert.deepEqual((await DB.prepare("SELECT json_extract(definition,'$.name') AS name FROM monitors ORDER BY name").all()).results.map(row=>row.name),
  ['Grant conformance A','Grant conformance B','Owner conformance A','Owner conformance B','Storefront'],'peer native monitors survive source custody retirement');
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM ik_door_chunks').first()).n,0,'the whole source original is withdrawn');
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM ik_door_plan_chunks').first()).n,0,'retained door plan copies are withdrawn');
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM ik_jobs').first()).n,0,'affected import custody is retired');
 // An archive that is the only copy naming a monitor goes with that monitor's erasure: its bytes are withdrawn, its header
 // stays, and restore-check answers 410. First the archived upload is still held; then a later plan has settled it away.
 const rotatedDoor=async(action,body,extra={})=>{const token=await grant(action,extra,'uptimerobot',rotated,rotatedKid);const r=await fetch(origin+'/api/rer/import/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 const sent=async bytes=>{const r=await rotatedDoor('uploads',{name:'uptimerobot.ndjson',bundleSha256:hash(bytes),totalBytes:bytes.length,totalChunks:1,index:0,chunkSha256:hash(bytes),base64:bytes.toString('base64')});return r};
 const page=monitors=>Buffer.from(JSON.stringify({data:monitors,nextLink:null})+'\n');
 const archiveHeld=async archiveId=>({chunks:(await DB.prepare('SELECT COUNT(*) n FROM ik_door_archive_chunks WHERE archive_id=?').bind(archiveId).first()).n,headers:(await DB.prepare('SELECT COUNT(*) n FROM ik_door_archives WHERE id=?').bind(archiveId).first()).n});
 for(const [name,settled] of [['Archive only copy',false],['Archive settled copy',true]]){
  const native=await owner('/api/monitors',{name,type:'http',url:'https://archive-copy.example.test/',intervalMs:300000,probes:['local-a'],enabled:false,assertions:{status:200}});assert.equal(native.status,201,JSON.stringify(native.body));
  const archivedUpload=(await sent(page([{id:9001,friendlyName:'Archive peer',type:'HTTP',url:'https://archive-peer.example.test/',interval:300},{id:9002,friendlyName:name,type:'HTTP',url:'https://archive-copy.example.test/',interval:300}])));
  assert.equal(archivedUpload.status,200,JSON.stringify(archivedUpload.body));
  const archive=await rotatedDoor('archive',{uploadId:archivedUpload.body.uploadId,tool:'uptimerobot',takenAt:new Date(Date.now()+(settled?60000:0)).toISOString()});assert.equal(archive.status,200,JSON.stringify(archive.body));
  if(settled){
   const later=await sent(page([{id:9101,friendlyName:'Archive later',type:'HTTP',url:'https://archive-later.example.test/',interval:300}]));
   const laterPlan=await rotatedDoor('plan',{uploadId:later.body.uploadId});assert.equal(laterPlan.status,200,JSON.stringify(laterPlan.body));
   assert.equal(await DB.prepare('SELECT id FROM ik_door_uploads WHERE id=?').bind(archivedUpload.body.uploadId).first(),null,'a later plan settled the archived upload away: the archive is the only copy');
   assert.equal((await rotatedDoor('undo',{planId:laterPlan.body.planId})).body.state,'cancelled');
  }
  assert.deepEqual(await archiveHeld(archive.body.archiveId),{chunks:1,headers:1});
  assert.equal((await rotatedDoor('restore-check',{archiveId:archive.body.archiveId})).status,200);
  const erasedCopy=await owner('/api/monitors/'+native.body.id+'/erase',{name});assert.equal(erasedCopy.status,200,JSON.stringify(erasedCopy.body));
  assert.equal(await DB.prepare('SELECT id FROM ik_door_uploads WHERE id=?').bind(archivedUpload.body.uploadId).first(),null,'the upload naming the erased monitor is withdrawn');
  assert.deepEqual(await archiveHeld(archive.body.archiveId),{chunks:0,headers:1},`${name}: the archive's bytes are withdrawn and its header kept`);
  const withdrawn=await rotatedDoor('restore-check',{archiveId:archive.body.archiveId});
  assert.equal(withdrawn.status,410);assert.equal(withdrawn.body.error,'archive_withdrawn');
 }
 // A bundle rer's UptimeRobot export produced (the released CLI adapter run on a saved response, with only the network faked)
 // keeps a user name, a plain header and a request body, and marks what it removed. Uptime accepts it, imports it with every
 // request field withheld, and still refuses the same response carrying its live credentials.
 const response={data:[
  {id:501,friendlyName:'Exported basic auth',type:'HTTP',url:'https://exported.example.test/health',interval:300,timeout:5,httpMethodType:'POST',successHttpResponseCodes:['200'],
   authType:'BASIC',httpUsername:'exported-robot-user',httpPassword:'exported-live-password',customHttpHeaders:{Authorization:'Bearer exported-live-header',['X-Trace']:'exported-trace-value'},postValueData:'{"exported":"request-body"}'},
  {id:502,friendlyName:'Exported userinfo URL',type:'HTTP',url:'https://admin:exported-url-password@private.example.test/status?api_key=exported-url-key&lang=en',interval:300,timeout:5,httpMethodType:'GET'},
  {id:503,friendlyName:'Exported keyword',type:'KEYWORD',url:'https://keyword.example.test/',interval:300,timeout:5,httpMethodType:'GET',keywordType:'ALERT_NOT_EXISTS',keywordValue:'In stock',keywordCaseType:'CaseSensitive'},
 ],nextLink:null};
 const {exportVendor}=await import(pathToFileURL(join(process.cwd(),'node_modules/@runeditrun/rer/cli/business/vendors/index.mjs')).href);
 const network=globalThis.fetch,exportedParts=[];
 globalThis.fetch=async url=>{assert.equal(String(url),'https://api.uptimerobot.com/v3/monitors?limit=200');return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}})};
 try{for await(const item of exportVendor('uptimerobot',{key:'synthetic-read-only-key'}))exportedParts.push(item.bytes)}finally{globalThis.fetch=network}
 const rerBundle=Buffer.concat(exportedParts),exportedText=rerBundle.toString();
 assert.ok(exportedText.includes('"httpUsername":"exported-robot-user"')&&exportedText.includes('"httpPassword":"[removed]"')&&exportedText.includes('https://removed@private.example.test/status?api_key=removed'),'the released export keeps the user name and marks what it removed');
 const live=['exported-live-password','exported-live-header','exported-url-password','exported-url-key'],withheld=['exported-robot-user','exported-trace-value','request-body'];
 // Every stored string, base64 decoded too; `originals` leaves out the door's byte-exact source originals, which Base keeps
 // under the bundle hash unless they held a credential part.
 const stored=async({originals=true}={})=>{const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA'").all()).results.map(row=>row.name)
  .filter(name=>originals||!['ik_door_chunks','ik_door_archive_chunks'].includes(name));
  const rows=[];for(const name of names)for(const row of (await DB.prepare(`SELECT * FROM "${name}"`).all()).results)rows.push(JSON.stringify(row),...Object.values(row).filter(v=>typeof v==='string'&&/^[A-Za-z0-9+/]+=*$/.test(v)&&v.length%4===0).map(v=>Buffer.from(v,'base64').toString()));return rows.join('\n')};
 const uploadsBefore=(await DB.prepare('SELECT COUNT(*) n FROM ik_door_uploads').first()).n;
 const liveResponse=page(response.data),refusedLive=await sent(liveResponse);
 assert.equal(refusedLive.status,400);assert.equal(refusedLive.body.error,'source_secrets_withheld','a bundle carrying live credentials is still refused');
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM ik_door_uploads').first()).n,uploadsBefore,'and nothing of it is kept');
 const afterRefusal=await stored();for(const value of [...live,...withheld])assert.ok(!afterRefusal.includes(value),`the refused bundle leaves no ${value} anywhere`);
 const exportedUpload=await sent(rerBundle);assert.equal(exportedUpload.status,200,JSON.stringify(exportedUpload.body));assert.equal(exportedUpload.body.complete,true);
 const exportedPlan=await rotatedDoor('plan',{uploadId:exportedUpload.body.uploadId});assert.equal(exportedPlan.status,200,JSON.stringify(exportedPlan.body));
 assert.equal(exportedPlan.body.counts.input,3);assert.equal(exportedPlan.body.counts.effects,2);
 assert.deepEqual(exportedPlan.body.rejected.map(row=>row.sourceId),['502']);assert.match(exportedPlan.body.rejected[0].reason,/without URL credentials/,'a URL that carried credentials is refused alone, with its reason');
 const exportedApproval={fingerprint:exportedPlan.body.fingerprint,approvalRecordId:randomUUID(),approvedAt:new Date().toISOString()};
 let exportedJob=await rotatedDoor('apply',{planId:exportedPlan.body.planId,reviewedFingerprint:exportedPlan.body.fingerprint},exportedApproval);
 for(let n=0;exportedJob.body.job?.state!=='completed'&&n<10;n++)exportedJob=await rotatedDoor('apply',{planId:exportedPlan.body.planId,reviewedFingerprint:exportedPlan.body.fingerprint},exportedApproval);
 assert.equal(exportedJob.body.job?.state,'completed',JSON.stringify(exportedJob.body));
 const definition=async name=>JSON.parse((await DB.prepare("SELECT definition FROM monitors WHERE json_extract(definition,'$.name')=?").bind(name).first()).definition);
 const basic=await definition('Exported basic auth');
 assert.deepEqual(basic.request,{credentialRef:'uptimerobot-501'},'authentication, headers and body are withheld behind a local credential reference');
 assert.equal(basic.method,'POST');assert.equal(basic.enabled,false);
 assert.deepEqual((await definition('Exported keyword')).assertions,{status:['2xx','3xx'],bodyIncludes:'In stock'});
 const everything=await stored(),derived=await stored({originals:false});
 for(const value of live)assert.ok(!everything.includes(value),`no table holds the live credential ${value}`);
 for(const value of withheld)assert.ok(!derived.includes(value),`no monitor, revision, plan, record or history holds ${value}`);
 console.log('Business import door passed: opt-in off 404; synthetic upload, zero-write native plan, fingerprint apply, reconciliation, Business history, undo, durable key revocation; erasure withdraws an archive that is the only copy naming a monitor; a rer UptimeRobot export imports with request fields withheld, its live response is refused.');
}finally{await worker?.dispose();await cleanupDirectory(directory)}
