import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {randomBytes} from 'node:crypto';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,outboxLink} from './auth-test-support.mjs';

// Run against the emitted application and a fresh migrated D1 store. The native
// Base auth reader has an 8192-byte bound, separate from Uptime's /api reader.
// Set TMPDIR to the task's private scratch directory when collecting evidence.
const nativeLimit=8192,displayName='所有者 € café ✓ 🦉';
const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:'test-only-auth-boundary-runner-key-0001'};
const requests=new Set();
let directory,worker,submissions=0;

function chunked(origin,path,value,chunkSize=1){
 const body=JSON.stringify(value),bytes=Buffer.from(body,'utf8');
 return new Promise((resolve,reject)=>{
  const request=httpRequest(origin+path,{
   method:'POST',agent:false,headers:{origin,'content-type':'application/json','transfer-encoding':'chunked',connection:'close'},
  },response=>{
   const chunks=[];
   response.on('data',chunk=>chunks.push(chunk));
   response.on('error',reject);
   response.on('end',()=>resolve({
    response:new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers}),
    contentLength:request.getHeader('content-length')??null,
    encoding:request.getHeader('transfer-encoding'),bytes:bytes.byteLength,characters:body.length,
   }));
  });
  requests.add(request);
  request.once('close',()=>requests.delete(request));
  request.on('error',reject);
  request.setTimeout(30000,()=>request.destroy(Error('Local chunked auth request timed out')));
  // Each write is an HTTP chunk; one-byte chunks split every multibyte codepoint.
  // All fixtures are below 10 KiB, so buffering this bounded input is deliberate.
  for(let offset=0;offset<bytes.length;offset+=chunkSize)request.write(bytes.subarray(offset,offset+chunkSize));
  request.end();
 });
}
function assertChunked(result){
 assert.equal(result.contentLength,null,'raw HTTP has no Content-Length');
 assert.equal(result.encoding,'chunked','raw HTTP uses chunked transfer encoding');
}
async function authSnapshot(DB){
 const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'oa_*' OR name='rer_mail_development_outbox') ORDER BY name").all()).results;
 return Promise.all(names.map(async({name})=>{
  assert.ok(/^[a-z_]+$/.test(name),'auth table identifier is safe');
  return [name,(await DB.prepare(`SELECT * FROM ${name} ORDER BY 1`).all()).results];
 }));
}
async function ownerRecord(DB){
 const owners=(await DB.prepare('SELECT email,display_name,role,status FROM oa_operators').all()).results;
 assert.deepEqual(owners,[{email:bindings.OWNER_EMAIL,display_name:displayName,role:'owner',status:'active'}],'exact Unicode owner identity is durable');
}

try{
 directory=await runtimeDirectory();
 const [port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
 const runtime=await migratedWorker({port,persist:join(directory,'native-auth'),bindings,outboundService:()=>{
  submissions++;throw Error('External transport forbidden in native auth boundary test');
 }});
 worker=runtime.worker;
 const {DB}=runtime,call=authRequest(origin);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM oa_operators').first()).n,0,'fresh installation has no owner');
 assert.equal((await call('/api/overview')).status,401,'private overview requires native authority');

 // Native claim errors keep Base's refusal and authority while presenting the
 // same retry form accessibly. Admission counters are the only expected writes.
 const durableSnapshot=async()=>{
  // _cf_METADATA is provider-owned, unreadable D1 installation metadata, as
  // classified in archive-inventory.ts. Keep every application table except
  // the two admission counters, including installation-local authority.
  const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('oa_limits','public_rate_limits','_cf_METADATA') ORDER BY name").all()).results;
  return Promise.all(names.map(async({name})=>{
   assert.ok(/^[a-z0-9_]+$/i.test(name),'durable table identifier is safe');
   return [name,(await DB.prepare(`SELECT * FROM "${name}" ORDER BY 1`).all()).results];
  }));
 };
 const unclaimed=await durableSnapshot(),wrongToken=randomBytes(24).toString('hex');
 const claimPage=await call('/claim'),claimHeaders=claimPage.headers;
 assert.equal(claimPage.status,200);
 const refusedJson=await call('/auth/bootstrap',{token:wrongToken,displayName});
 assert.equal(refusedJson.status,403);
 assert.deepEqual(await refusedJson.json(),{error:'invalid_setup_token'},'JSON claim clients keep their original denial');
 const nativeClaim=(path='/auth/bootstrap',headers={},method='POST')=>fetch(origin+path,{
  method,redirect:'manual',headers:{origin,'content-type':'application/x-www-form-urlencoded; charset=UTF-8',...headers},
  ...(method==='POST'?{body:new URLSearchParams({token:wrongToken,displayName,returnTo:'/setup'})}:{}),
 });
 const refusedForm=await nativeClaim(),refusedHtml=await refusedForm.text();
 assert.equal(refusedForm.status,refusedJson.status,'native claim keeps the Base denial status');
 assert.ok(refusedForm.headers.get('content-type').startsWith('text/html'));
 for(const header of ['cache-control','x-content-type-options','x-robots-tag'])assert.equal(refusedForm.headers.get(header),refusedJson.headers.get(header),'Base denial header is retained');
 for(const header of ['content-security-policy','referrer-policy'])assert.equal(refusedForm.headers.get(header),claimHeaders.get(header),'retry form uses the existing claim document policy');
 assert.ok(/<html\b[^>]*lang="en"/.test(refusedHtml)&&/<title>[^<]+<\/title>/.test(refusedHtml)&&/<h1>[^<]+<\/h1>/.test(refusedHtml),'refusal is a titled semantic document');
 const tokenInput=refusedHtml.match(/<input[^>]*name="token"[^>]*>/)?.[0]??'';
 const description=tokenInput.match(/aria-describedby="([^"]+)"/)?.[1];
 assert.ok(tokenInput.includes('aria-invalid="true"')&&description&&refusedHtml.includes(`id="${description}"`),'token field is linked to its error');
 assert.ok(!tokenInput.includes('value=')&&!refusedHtml.includes(wrongToken)&&!refusedHtml.includes(displayName),'refusal clears rather than reflects submitted values');
 assert.equal(refusedForm.headers.has('set-cookie'),false,'native denial issues no session');
 for(const [path,headers,method,status,error] of [
  ['/auth/bootstrap',{origin:'https://foreign.example'},'POST',403,'invalid_origin'],
  ['/auth/bootstrap',{'sec-fetch-site':'cross-site'},'POST',403,'invalid_origin'],
  ['/auth/bootstrap?token=duplicate-source',{},'POST',400,'invalid_input'],
  ['/auth/bootstrap',{},'GET',405,'method_not_allowed'],
 ]){
  const denied=await nativeClaim(path,headers,method);
  assert.equal(denied.status,status,'other native authority and input denials keep their status');
  assert.deepEqual(await denied.json(),{error},'only wrong setup tokens become a retry document');
  assert.equal(denied.headers.has('set-cookie'),false);
 }
 assert.ok(isDeepStrictEqual(await durableSnapshot(),unclaimed),'claim refusals leave all durable tables unchanged except admission counters');
 assert.equal((await call('/api/overview')).status,401,'claim refusal creates no private authority');

 const bootstrap=await chunked(origin,'/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName,returnTo:'/'});
 assertChunked(bootstrap);
 const firstCookie=sessionCookie(bootstrap.response);
 await ownerRecord(DB);
 assert.deepEqual((await DB.prepare('SELECT kind,revoked_at,source_token_id FROM oa_sessions').all()).results,[{kind:'native',revoked_at:null,source_token_id:null}],'bootstrap creates one native session');
 assert.equal((await call('/api/overview',undefined,{cookie:firstCookie})).status,200,'chunked Unicode bootstrap admits private overview');

 const signout=await call('/auth/signout',{}, {cookie:firstCookie});
 assert.equal(signout.status,204,'native sign-out revokes bootstrap session');
 assert.ok(/Max-Age=0/.test(signout.headers.get('set-cookie')??''),'sign-out clears its cookie');
 assert.ok((await DB.prepare('SELECT revoked_at FROM oa_sessions').first()).revoked_at!==null,'revocation is durable');
 assert.equal((await call('/api/overview',undefined,{cookie:firstCookie})).status,401,'revoked bootstrap cookie cannot read private overview');

 const before=await authSnapshot(DB);
 const oversized=await chunked(origin,'/auth/magic-link',{email:bindings.OWNER_EMAIL,returnTo:'/',padding:'€'.repeat(3000)},127);
 assertChunked(oversized);
 assert.ok(oversized.characters<nativeLimit&&oversized.bytes>nativeLimit,'valid-email JSON is below 8192 characters and above 8192 UTF8 bytes');
 assert.equal(oversized.response.status,413,'Base rejects the native 8192-byte boundary');
 assert.deepEqual(await oversized.response.json(),{error:'input_too_large'});
 assert.equal(oversized.response.headers.has('set-cookie'),false,'oversized request grants no cookie');
 // Compare as a boolean so assertion output cannot expose token hashes or mail.
 assert.ok(isDeepStrictEqual(await authSnapshot(DB),before),'oversized input leaves every auth, token, limit and development-outbox row unchanged');

 // This is the very next HTTP request after the 413. D1 snapshot reads above do
 // not make a request to the application listener or mask a lost-next-request bug.
 const accepted=await call('/auth/magic-link',{email:bindings.OWNER_EMAIL,returnTo:'/'});
 assert.equal(accepted.status,202,'first ordinary HTTP request after 413 accepts native magic-link sign-in');
 assert.equal(accepted.headers.has('set-cookie'),false,'link request does not authenticate before confirmation');
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM oa_tokens').first()).n,1,'only the accepted request creates a token');
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM rer_mail_development_outbox').first()).n,1,'only the accepted request creates captured mail');
 const link=await outboxLink(call,{email:bindings.OWNER_EMAIL});
 assert.ok(link.origin===origin,'development link remains within the isolated local Worker');
 const preview=await call(link.pathname+link.search);
 assert.equal(preview.status,200,'actual captured link previews successfully');
 assert.equal(preview.headers.has('set-cookie'),false,'preview creates no session cookie');
 assert.equal((await DB.prepare('SELECT consumed_at FROM oa_tokens').first()).consumed_at,null,'preview preserves the one-time token');

 const confirmed=await chunked(origin,'/auth/confirm',{token:link.searchParams.get('token')});
 assertChunked(confirmed);
 const secondCookie=sessionCookie(confirmed.response);
 assert.ok(secondCookie!==firstCookie,'confirmation issues a new session credential');
 const sessions=(await DB.prepare('SELECT kind,revoked_at,source_token_id FROM oa_sessions').all()).results;
 assert.equal(sessions.length,2,'confirmation adds exactly one session');
 assert.ok(sessions.every(session=>session.kind==='native'),'all sessions use native Base admission');
 assert.equal(sessions.filter(session=>session.revoked_at===null&&session.source_token_id!==null).length,1,'one live native session comes from the captured token');
 assert.ok((await DB.prepare('SELECT consumed_at FROM oa_tokens').first()).consumed_at!==null,'confirmation consumes its real token');
 await ownerRecord(DB);
 assert.equal((await call('/api/overview',undefined,{cookie:secondCookie})).status,200,'confirmed native session reads private overview');
 assert.equal((await call('/api/overview',undefined,{cookie:firstCookie})).status,401,'confirmation does not resurrect revoked authority');
 // BASE-ACCESS-001: a link goes only to an allow-listed operator; any other address gets the same answer and no token or mail.
 const counts=async()=>[(await DB.prepare('SELECT COUNT(*) n FROM oa_tokens').first()).n,(await DB.prepare('SELECT COUNT(*) n FROM rer_mail_development_outbox').first()).n];
 const listed=await counts(),unlisted=await call('/auth/magic-link',{email:'not-an-operator@example.test',returnTo:'/'});
 assert.equal(unlisted.status,202,'an unlisted address gets the same acknowledgement');assert.ok(!unlisted.headers.has('set-cookie'));
 assert.deepEqual(await counts(),listed,'an unlisted address gets no link and no mail');
 // No passwords are stored: no column of any table can hold one, and a password offered with a link request is kept nowhere.
 const offeredValue=randomBytes(16).toString('hex'),offered=await call('/auth/magic-link',{email:bindings.OWNER_EMAIL,password:offeredValue});
 assert.ok(!offered.headers.has('set-cookie'),'a password never signs in');
 const tables=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB '_cf*' AND name NOT GLOB 'sqlite_*'").all()).results.map(row=>row.name);
 const columns=[];for(const table of tables){
  assert.ok(/^[a-z0-9_]+$/.test(table),'table identifier is safe');
  columns.push(...(await DB.prepare(`PRAGMA table_info(${table})`).all()).results.map(column=>column.name));
  assert.ok(!JSON.stringify((await DB.prepare(`SELECT * FROM ${table}`).all()).results).includes(offeredValue),`${table} keeps no offered password`);
 }
 assert.ok(columns.length>100&&!columns.some(name=>/pass|pwd/i.test(name)),'no stored column can hold a password');
 assert.equal(submissions,0,'development sign-in never submits to an external provider');
 console.log('AUTH-INPUT-BOUNDARY passed: one-byte Unicode native bootstrap, durable owner/native authority, 8192 UTF8-byte rejection without auth/outbox changes, immediate post413 magic-link recovery, no link for an unlisted address and no stored password, real development outbox preview and chunked native confirmation; external submissions=0.');
}finally{
 for(const request of requests)request.destroy();
 try{await worker?.dispose()}finally{if(directory)await cleanupDirectory(directory)}
}
