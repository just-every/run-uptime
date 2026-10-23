import {completeSecondFactor} from './mfa-auth-support.mjs';
// A Business-provisioned install through its public doors: Run Edit Run sets RER_IMPORT_DOOR=on with the owner-claim
// trust, the owner's first claim opens the import door, later claims change nothing, the owner still switches it off and
// on, RER reads the private runner's state at POST /api/rer/runner-status with a signed runner-status grant, and the
// cutover checks read deliveries and created records since a time at POST /api/rer/cutover-status.
// (Without the variable the first claim leaves the door off: tests/business-import-door.mjs.)
import assert from 'node:assert/strict';
import {randomUUID,webcrypto} from 'node:crypto';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts,waitFor,fixtureProcess} from './notify-acceptance-runtime.mjs';
import {acceptanceReceiver,loopbackWireTransport} from './notify-acceptance-receivers.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
import {testAuthBindings,authRequest,sessionCookie} from './auth-test-support.mjs';
import {CONTACT_FRESHNESS_MS} from '../src/domain/runner-contact.server.ts';

const directory=await runtimeDirectory(),[port,acceptPort,failPort,fixturePort]=await availablePorts(4),origin=`http://127.0.0.1:${port}`;
const pair=()=>webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const rer=await pair(),stranger=await pair(),kid='rer-test';
const grantPath=join(directory,'grant.json');
const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,UPTIME_SYNTHETIC_PORT:String(fixturePort),RER_IMPORT_DOOR:'on',RER_OWNER_CLAIM_ISSUER:'https://rer.example.test',
 RER_OWNER_CLAIM_INSTALLATION_ID:'business-uptime-installation',RER_OWNER_CLAIM_APP_ORIGIN:origin,
 RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:await webcrypto.subtle.exportKey('jwk',rer.publicKey)})};
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(typ,fields,{signer=rer,signerKid=kid}={}){
 const now=Math.floor(Date.now()/1000),input=b64({alg:'ES256',typ,kid:signerKid})+'.'+b64({v:1,iss:bindings.RER_OWNER_CLAIM_ISSUER,aud:origin,
  installationId:bindings.RER_OWNER_CLAIM_INSTALLATION_ID,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat:now,exp:now+300,...fields});
 return input+'.'+Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.privateKey,Buffer.from(input))).toString('base64url');
}
const call=authRequest(origin);
let worker,accepting,failing,fixture;
try{
 const runtime=await migratedWorker({port,persist:join(directory,'local'),bindings});worker=runtime.worker;const {DB}=runtime;
 // The import door's Business mount: 404 while the door is off, a grant check once it is on.
 const door=async()=>(await fetch(origin+'/api/rer/import/uploads',{method:'POST',headers:{'content-type':'application/json',
  authorization:'Bearer '+await token('rer-import-grant+jwt',{action:'uploads',namespace:'uptimerobot',maxBytes:1024,maxChunks:1,maxRecords:1})},body:'{}'})).status;
 const status=async(authorization,init={})=>{const response=await fetch(origin+'/api/rer/runner-status',{method:'POST',
  headers:{'content-type':'application/json',...(authorization?{authorization:'Bearer '+authorization}:{})},body:'{}',...init});return {status:response.status,text:await response.text()}};
 const runnerStatus=async(fields={},options)=>status(await token('rer-import-grant+jwt',{action:'runner-status',...fields},options));

 assert.equal(await door(),404,'the door is off before any owner claim');
 assert.equal((await call('/auth/bootstrap',{token:'not-the-setup-token',displayName:'Intruder'})).status,403);
 assert.equal(await door(),404,'a refused claim leaves the door off');
 const cookie=sessionCookie(await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Business owner'}));
 await completeSecondFactor(origin,cookie);
 assert.notEqual(await door(),404,'the owner\'s first claim opens the door');
 const owner=async(path,body)=>{const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 assert.equal((await owner('/api/business-import-settings')).body.enabled,true,'the owner sees Business imports on');

 // The owner turns it off; neither claim door nor the owner's console reopens it.
 assert.equal((await owner('/api/business-import-settings',{enabled:false,revokedKeyIds:[]})).status,200);
 assert.equal(await door(),404);
 assert.equal((await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Second claimant'})).status,409);
 assert.equal((await call('/auth/owner-claim',{token:await token('rer-owner-claim+jwt',{}),displayName:'Signed claimant'})).status,409);
 assert.equal((await fetch(origin+'/app',{redirect:'manual',headers:{cookie}})).status<400,true);
 assert.equal(await door(),404,'a later claim or owner visit leaves the owner\'s choice');
 assert.equal((await owner('/api/business-import-settings')).body.enabled,false);
 assert.equal((await owner('/api/business-import-settings',{enabled:true,revokedKeyIds:[]})).status,200);
 assert.notEqual(await door(),404,'the owner turns it back on');

 // RER's signed runner-status read.
 assert.deepEqual(JSON.parse((await runnerStatus()).text),{state:'never',lastContactAt:null});
 const contactAt=Date.now();
 assert.equal((await fetch(origin+'/api/runner/claim',{method:'POST',headers:{'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY},body:'{}'})).status,200);
 const fresh=await runnerStatus(),freshBody=JSON.parse(fresh.text);
 assert.equal(fresh.status,200);assert.deepEqual(Object.keys(freshBody).sort(),['lastContactAt','state']);assert.equal(freshBody.state,'fresh');
 assert.ok(Date.parse(freshBody.lastContactAt)>=contactAt-1000&&Date.parse(freshBody.lastContactAt)<=Date.now());
 assert.ok(!fresh.text.includes(bindings.UPTIME_RUNNER_KEY),'the runner key never leaves the console');
 await DB.prepare('UPDATE runner_contact SET last_contact_at=? WHERE id=1').bind(Date.now()-CONTACT_FRESHNESS_MS-1000).run();
 assert.equal(JSON.parse((await runnerStatus()).text).state,'stale','contact older than the console\'s 2-minute window is stale');
 const now=Math.floor(Date.now()/1000),refused=[
  ['unsigned',await status(null),401],
  ['a door action',await runnerStatus({action:'status'}),403],
  ['another action',await runnerStatus({action:'runner-state'}),403],
  ['a door-shaped grant',await runnerStatus({namespace:'runner',maxBytes:1,maxChunks:1,maxRecords:1}),403],
  ['expired',await runnerStatus({iat:now-400,exp:now-100}),403],
  ['another installation',await runnerStatus({installationId:'another-installation'}),403],
  ['another owner',await runnerStatus({email:'someone@example.test'}),403],
  ['another key',await runnerStatus({},{signer:stranger}),403],
  ['an unknown key id',await runnerStatus({},{signer:stranger,signerKid:'stranger'}),403],
  ['an owner claim',await status(await token('rer-owner-claim+jwt',{action:'runner-status'})),403],
  ['GET',await status(await token('rer-import-grant+jwt',{action:'runner-status'}),{method:'GET',body:undefined}),405],
 ];
 for(const [label,response,expected] of refused){assert.equal(response.status,expected,label);assert.ok(!response.text.includes('state'),label)}
 // RER's signed cutover-status read: per destination, deliveries that made an attempt since `since` and those the
 // receiver accepted, and monitors and incidents created since. A real runner sends through a loopback wire edge.
 const newURL='https://alerts.example.com/intake/uptime-path-secret',oldURL='https://old-pager.example.net/hook/path-secret';
 accepting=await acceptanceReceiver(acceptPort,()=>{});failing=await acceptanceReceiver(failPort,()=>{});failing.setDisposition('failed');
 // The checked service is the local synthetic target, switched to failing so the new monitor opens an incident.
 fixture=fixtureProcess(fixturePort,grantPath,directory);await waitFor(async()=>(await fetch(`http://127.0.0.1:${fixturePort}/health`)).ok,'synthetic target');
 assert.equal((await fetch(`http://127.0.0.1:${fixturePort}/control`,{method:'POST',body:JSON.stringify({mode:'failing'})})).status,200);
 const transport=loopbackWireTransport(new Map([[newURL,{port:acceptPort,path:'/receiver'}],[oldURL,{port:failPort,path:'/receiver'}]]));
 let second;
 const runOnce=async()=>{await runRunner({origin,key:bindings.UPTIME_RUNNER_KEY,grantPath,localReview:true,transport,once:true});if(second)await runRunner({origin,key:second.key,runnerId:second.runnerId,grantPath,localReview:true,transport,once:true})};
 const created=async(path,body)=>{const r=await owner(path,body);assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.body)}`);return r.body};
 const cutover=async(body,fields={},options)=>{const response=await fetch(origin+'/api/rer/cutover-status',{method:'POST',headers:{'content-type':'application/json',
  authorization:'Bearer '+await token('rer-import-grant+jwt',{action:'cutover-status',...fields},options)},body:typeof body==='string'?body:JSON.stringify(body)});return {status:response.status,text:await response.text()}};
 const read=async since=>{const r=await cutover({since});assert.equal(r.status,200,r.text);return {text:r.text,body:JSON.parse(r.text)}};
 const receiver=await created('/api/notifications/destinations',{name:'Lamp alert intake',kind:'webhook',url:newURL,enabled:false});
 const old=await created('/api/notifications/destinations',{name:'Old pager',kind:'webhook',url:oldURL,enabled:false});
 const inbox=await created('/api/notifications/destinations',{name:'Ops inbox',kind:'email',address:'ops-inbox@example.test',enabled:false});
 await created('/api/monitors',{name:'Paused before cutover',url:`http://127.0.0.1:${fixturePort}/health`,probes:['local-a'],intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1,enabled:false});
 // A test send accepted before `since` is not counted.
 await created(`/api/notifications/destinations/${receiver.id}/test`,{});
 await waitFor(async()=>{await runOnce();return accepting.records.length===1},'the earlier test send reaches the receiver');
 await new Promise(resolve=>setTimeout(resolve,20));
 const since=new Date().toISOString();
 await created(`/api/notifications/destinations/${receiver.id}/test`,{});await created(`/api/notifications/destinations/${old.id}/test`,{});
 const first=(await owner('/api/runners')).body.find(r=>r.revokedAt===null);second=await created('/api/runners',{networkLabel:'synthetic-uptime-2'});
 const monitor=await created('/api/monitors',{name:'Checkout behind cutover',url:`http://127.0.0.1:${fixturePort}/api/status`,probes:['local-a','local-b'],assignments:{'local-a':{runnerId:first.runnerId},'local-b':{runnerId:second.runnerId}},intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1,freshnessMs:15000});
 const answer=await waitFor(async()=>{await runOnce();const r=await read(since);
  return r.body.created_since.incidents===1&&r.body.deliveries.every(d=>d.sent_since===(d.destination_id===inbox.id?0:1))&&r.body.deliveries.find(d=>d.destination_id===receiver.id).ok_since===1?r:null},
  'deliveries and the incident since the cutover began');
 assert.equal(accepting.records.length,2);assert.ok(failing.records.length>=1,'the old endpoint saw the attempt and refused it');
 assert.equal((await owner(`/api/monitors/${monitor.id}/incidents`)).body.length,1,'one scheduled incident since');
 assert.deepEqual(Object.keys(answer.body).sort(),['created_since','deliveries']);
 assert.deepEqual([...answer.body.deliveries].sort((a,b)=>a.destination_id.localeCompare(b.destination_id)),[
  {destination_id:receiver.id,host:'alerts.example.com',sent_since:1,ok_since:1},
  {destination_id:old.id,host:'old-pager.example.net',sent_since:1,ok_since:0},
  {destination_id:inbox.id,host:null,sent_since:0,ok_since:0},
 ].sort((a,b)=>a.destination_id.localeCompare(b.destination_id)));
 assert.deepEqual(answer.body.created_since,{monitors:1,incidents:1},'the monitor paused before `since` is not counted');
 for(const value of ['Lamp alert intake','Old pager','Ops inbox','ops-inbox@example.test','path-secret','Checkout behind cutover','Paused before cutover',receiver.signingSecret,old.signingSecret,bindings.UPTIME_RUNNER_KEY])
  assert.ok(!answer.text.includes(value),'counts, ids and hosts only: no names, addresses, endpoint paths, secrets or monitor content');
 const later=(await read(new Date(Date.now()+60000).toISOString())).body;
 assert.ok(later.deliveries.every(d=>d.sent_since===0&&d.ok_since===0));assert.deepEqual(later.created_since,{monitors:0,incidents:0});
 const quiet=await DB.prepare("SELECT (SELECT count(*) FROM notification_jobs)+(SELECT count(*) FROM integration_attempts)+(SELECT count(*) FROM revisions)+(SELECT count(*) FROM outbox) n").first();
 await read(since);
 assert.deepEqual(await DB.prepare("SELECT (SELECT count(*) FROM notification_jobs)+(SELECT count(*) FROM integration_attempts)+(SELECT count(*) FROM revisions)+(SELECT count(*) FROM outbox) n").first(),quiet,'the read writes nothing');
 const cutoverRefused=[
  ['unsigned',await fetch(origin+'/api/rer/cutover-status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({since})}),401],
  ['a runner-status grant',await cutover({since},{action:'runner-status'}),403],
  ['a door action',await cutover({since},{action:'status'}),403],
  ['expired',await cutover({since},{iat:now-400,exp:now-100}),403],
  ['another installation',await cutover({since},{installationId:'another-installation'}),403],
  ['another owner',await cutover({since},{email:'someone@example.test'}),403],
  ['another key',await cutover({since},{},{signer:stranger}),403],
  ['an unknown key id',await cutover({since},{},{signer:stranger,signerKid:'stranger'}),403],
  ['GET',await fetch(origin+'/api/rer/cutover-status',{headers:{authorization:'Bearer '+await token('rer-import-grant+jwt',{action:'cutover-status'})}}),405],
  ['no since',await cutover({}),400],['a date that is not ISO',await cutover({since:'yesterday'}),400],['extra fields',await cutover({since,content:true}),400],['not JSON',await cutover('since'),400],
 ];
 for(const [label,response,expected] of cutoverRefused){assert.equal(response.status,expected,label);const text=typeof response.text==='string'?response.text:await response.text();assert.ok(!text.includes('deliveries'),label)}
 assert.equal((await owner('/api/business-import-settings',{enabled:true,revokedKeyIds:[kid]})).status,200);
 assert.equal((await runnerStatus()).status,403,'a key the owner revoked is refused');
 assert.equal((await cutover({since})).status,403,'a key the owner revoked is refused');
 console.log('BUSINESS-PROVISIONED passed: door opened at the first claim only, kept the owner\'s choice across later claims, and runner-status answered never, fresh and stale to signed grants, cutover-status counted deliveries and created records since a time with ids and hosts only, and both refused every other request.');
}finally{await worker?.dispose();await accepting?.close();await failing?.close();await fixture?.stop();await cleanupDirectory(directory)}
