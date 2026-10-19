// A Business-provisioned install through its public doors: Run Edit Run sets RER_IMPORT_DOOR=on with the owner-claim
// trust, the owner's first claim opens the import door, later claims change nothing, the owner still switches it off and
// on, and RER reads the private runner's state at POST /api/rer/runner-status with a signed runner-status grant.
// (Without the variable the first claim leaves the door off: tests/business-import-door.mjs.)
import assert from 'node:assert/strict';
import {randomUUID,webcrypto} from 'node:crypto';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie} from './auth-test-support.mjs';
import {CONTACT_FRESHNESS_MS} from '../src/domain/runner-contact.server.ts';

const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
const pair=()=>webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const rer=await pair(),stranger=await pair(),kid='rer-test';
const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,RER_IMPORT_DOOR:'on',RER_OWNER_CLAIM_ISSUER:'https://rer.example.test',
 RER_OWNER_CLAIM_INSTALLATION_ID:'business-uptime-installation',RER_OWNER_CLAIM_APP_ORIGIN:origin,
 RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:await webcrypto.subtle.exportKey('jwk',rer.publicKey)})};
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(typ,fields,{signer=rer,signerKid=kid}={}){
 const now=Math.floor(Date.now()/1000),input=b64({alg:'ES256',typ,kid:signerKid})+'.'+b64({v:1,iss:bindings.RER_OWNER_CLAIM_ISSUER,aud:origin,
  installationId:bindings.RER_OWNER_CLAIM_INSTALLATION_ID,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat:now,exp:now+300,...fields});
 return input+'.'+Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.privateKey,Buffer.from(input))).toString('base64url');
}
const call=authRequest(origin);
let worker;
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
 assert.equal((await owner('/api/business-import-settings',{enabled:true,revokedKeyIds:[kid]})).status,200);
 assert.equal((await runnerStatus()).status,403,'a key the owner revoked is refused');
 console.log('BUSINESS-PROVISIONED passed: door opened at the first claim only, kept the owner\'s choice across later claims, and runner-status answered never, fresh and stale to signed grants and refused every other request.');
}finally{await worker?.dispose();await cleanupDirectory(directory)}
