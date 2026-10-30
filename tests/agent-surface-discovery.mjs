// One native MCP journey: discover the contract surface with Base authority,
// then attempt every unavailable operation against populated durable storage.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {splitSql} from './migration-support.mjs';
import {testAuthBindings,authRequest,sessionCookie,emailSignIn,deliveredLink} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';

// Derive expectations from the acceptance source, never the implementation's
// registry. Published Core declarations and target Core headings both count.
const contract=await readFile('CONTRACT.md','utf8');
const core=new Set([...contract.matchAll(/^- `([A-Z]+-\d{3})`: \*Tier:\* Core/gm)].map(match=>match[1]));
for(const section of contract.split(/^#### /m).slice(1))if(/^\*Tier:\* Core\b/m.test(section))core.add(section.split(' — ')[0]);
const table=contract.slice(contract.indexOf('| Tool | Does |'),contract.indexOf('**Resources.**'));
const expected=table.split('\n').filter(line=>line.startsWith('| `uptime.')).map(line=>{
 const [name,,clauses,declaration]=line.slice(1,-1).split('|').map(cell=>cell.trim());
 return {name:name.replaceAll('`',''),coreClauses:clauses.split(', '),classDeclaration:declaration,classes:[...new Set(declaration.match(/\b(?:standard|external|money|access|security|destructive|live|gated)\b/g))].sort()};
});
const prose=contract.split('**Not tools, and why.**')[1].split('**Limits.**')[0].trim();
const expectedReasons=prose.split(/;\s*|(?<=\))\.\s+/).map(sentence=>({
 coreClauses:[...sentence.matchAll(/[A-Z]+-\d{3}/g)].map(match=>match[0]),
 reason:sentence.replace(/\s*\([A-Z]+-\d{3}(?:, [A-Z]+-\d{3})*\)/g,'').trim().replace(/\.$/,''),
}));
assert.ok(expected.length>0&&core.size>0,'the acceptance source supplies a nonempty surface');
const method=(group,verb)=>[group,verb].join('/');
const initialize={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'synthetic-uptime-1',version:'1'}}};
const list={jsonrpc:'2.0',id:2,method:method('tools','list')};
const directory=await runtimeDirectory(),origin='https://uptime.example.test',outbound=[];
const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,UPTIME_LOCAL_REVIEW:'false',MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-1',OWNER_EMAIL:['synthetic-uptime-1','example.test'].join('@')};
let worker;
try{
 worker=await hostedRuntime(directory,bindings,async request=>{
  outbound.push({url:request.url,method:request.method});
  assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send','only native authentication mail may leave this installation');
  return new Response(null,{status:202});
 });
 const DB=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
 const fetcher=(url,init={})=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url,method:init.method??'GET',headers:{...init.headers,'cf-connecting-ip':'192.0.2.1'},body:init.body})});
 const call=authRequest(origin,fetcher);
 const admitted=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Synthetic monitoring owner'});
 const bootstrap=sessionCookie(admitted);
 await completeSecondFactor(origin,bootstrap,fetcher);
 // Obtain a fresh session through the actual Base mail-link login as well as
 // first-owner admission. The test substitutes only the mail-provider edge.
 let cookie=await emailSignIn(origin,{bindings,fetcher});
 const owner=async(path,body)=>{
  const response=await call(path,body,{cookie});
  const data=await response.json();assert.ok(response.ok,`${path}: ${response.status}`);return data;
 };
 const monitor=await owner('/api/monitors',{name:'synthetic-uptime-monitor',url:'https://example.com/health',probes:['local-a'],intervalMs:60000,retries:0,confirmSlots:1,recoverSlots:1,enabled:false});
 const destination=await owner('/api/notifications/destinations',{name:'synthetic-uptime-recipient',kind:'email',address:['synthetic-uptime-2','example.test'].join('@'),enabled:false});
 const invite=async(role,scopes=[])=>{
  const email=[`synthetic-uptime-${role}`,'example.test'].join('@');
  const sent=await call('/api/access/invitations',{email,displayName:`Synthetic ${role}`,role,scopes},{cookie});
  assert.equal(sent.status,202,'owner explicitly invites the test identity');
  const link=await deliveredLink(call,{email,kind:'invite'});
  const memberCookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
  await completeSecondFactor(origin,memberCookie,fetcher);return memberCookie;
 };
 const adminCookie=await invite('admin'),scopedCookie=await invite('read-only',[{kind:'service',value:'synthetic-uptime-service'}]);
 const productSnapshot=async()=>{
  const tables=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results;
  const result={};
  for(const {name} of tables){
   if(['public_rate_limits','oa_limits'].includes(name))continue;
   result[name]=(await DB.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return result;
 };
 const baseline=await productSnapshot(),traffic=outbound.length;
 assert.ok(baseline.monitors.some(row=>row.id===monitor.id)&&baseline.notification_destinations.some(row=>row.id===destination.id),'the refusal proof protects actual product records');
 const rpc=async(message,{headers={},raw,method='POST',query=''}={})=>{
  const response=await fetcher(origin+'/api/mcp'+query,{method,headers:{origin,cookie,'content-type':'application/json',accept:'application/json, text/event-stream',...headers},...(method==='POST'?{body:raw??JSON.stringify(message)}:{})});
  assert.match(response.headers.get('cache-control')??'',/no-store/,'private discovery is never cached');
  const text=await response.text();return {status:response.status,headers:response.headers,text,data:text?JSON.parse(text):null};
 };
 const initialized=await rpc(initialize);
 assert.equal(initialized.status,200);assert.equal(initialized.data.id,initialize.id);assert.equal(initialized.data.jsonrpc,'2.0');
 assert.equal(initialized.data.result.protocolVersion,initialize.params.protocolVersion);
 assert.deepEqual(initialized.data.result.capabilities,{tools:{listChanged:false}},'only the implemented discovery capability is advertised');
 assert.equal(initialized.data.result._meta.discoveryOnly,true);assert.equal(initialized.data.result._meta.invocation.available,false);
 const protocol=initialized.data.result.protocolVersion;
 assert.equal((await rpc({jsonrpc:'2.0',method:method('notifications','initialized')})).status,202);
 const listed=await rpc(list,{headers:{'mcp-protocol-version':protocol}});
 assert.equal(listed.status,200);assert.equal(listed.data.id,list.id);
 const tools=listed.data.result.tools;
 assert.deepEqual(tools.map(tool=>tool.name).sort(),expected.map(tool=>tool.name).sort(),'exactly the contract tool names, with no aliases or omissions');
 for(const declaration of expected){
  const tool=tools.find(tool=>tool.name===declaration.name);
  assert.deepEqual([...tool._meta.classes].sort(),declaration.classes,`${tool.name}: declared class set`);
  assert.equal(tool._meta.classDeclaration,declaration.classDeclaration,`${tool.name}: conditional class semantics stay visible`);
  assert.deepEqual(tool._meta.coreClauses,declaration.coreClauses,`${tool.name}: Core coverage`);
  assert.equal(tool.inputSchema.type,'object');assert.equal(tool._meta.invocation.available,false);
  assert.match(tool.description,/invocation is unavailable/i);assert.match(tool._meta.invocation.reason,/native adapters and company-policy enforcement/i);
 }
 for(const metadata of [initialized.data.result._meta,listed.data.result._meta]){
  assert.deepEqual(metadata.notTools,expectedReasons,'every explicit reason is published from the contract declaration');
  assert.ok(metadata.notTools.every(entry=>entry.reason&&!/\brisk\b/i.test(entry.reason)),'risk never excludes a Core obligation');
  const covered=new Set([...tools.flatMap(tool=>tool._meta.coreClauses),...metadata.notTools.flatMap(entry=>entry.coreClauses)]);
  assert.deepEqual([...core].filter(id=>!covered.has(id)),[],'every live Core clause has a tool or a specific not-a-tool reason');
 }
 assert.ok(!listed.text.includes(monitor.id)&&!listed.text.includes(destination.id)&&!listed.text.includes(bindings.OWNER_EMAIL),'discovery exposes declarations, never product records or identities');
 console.log(`PROBE SURFACE-001 1: authenticated native initialize and tool discovery -> ${tools.length} contract tools with exact classes and Core ids`);
 console.log(`PROBE SURFACE-001 2: native discovery coverage -> ${core.size} live Core clauses covered with explicit non-risk reasons`);

 // Each declared tool, including reads, is honestly unavailable. Dangerous
 // arguments and concurrent attempts never reach an adapter or a provider.
 const attempt=async(name,id)=>{
  const response=await rpc({jsonrpc:'2.0',id,method:method('tools','call'),params:{name,arguments:{monitorId:monitor.id,destinationId:destination.id,name:'synthetic-uptime-monitor',enabled:true,confirm:true}}});
  assert.equal(response.status,200);assert.equal(response.data.result.isError,true,`${name}: invocation refused`);
  assert.equal(response.data.result._meta.invocation.available,false);assert.match(response.data.result.content[0].text,/native adapters and company-policy enforcement/i);
 };
 for(const [index,tool] of tools.entries())await attempt(tool.name,100+index);
 await Promise.all(['uptime.monitors.save','uptime.erasure.run','uptime.destinations.test'].map((name,index)=>attempt(name,200+index)));
 assert.deepEqual(await productSnapshot(),baseline,'every attempted invocation preserves every application table, including credentials, audit and custody');
 assert.equal(outbound.length,traffic,'no invocation reaches a provider');

 for(const message of [initialize,list,{jsonrpc:'2.0',id:3,method:method('tools','call'),params:{name:'uptime.erasure.run',arguments:{monitorId:monitor.id}}}]){
  for(const [label,headers,status] of [
   ['signed out',{cookie:''},401],['administrator',{cookie:adminCookie},403],['scoped reader',{cookie:scopedCookie},403],
   ['forged owner claims',{cookie:scopedCookie,'x-operator-role':'owner','x-role':'owner'},403],['foreign Origin',{origin:'https://foreign.example.test'},403],
   ['cross-site',{'sec-fetch-site':'cross-site'},403],['missing hosted Origin',{origin:''},403],
   ['runner key',{cookie:'','x-runner-key':bindings.UPTIME_RUNNER_KEY},401],
   ['bearer authority',{cookie:'',authorization:'Bearer synthetic-uptime-3'},403],
  ]){const response=await rpc(message,{headers});assert.equal(response.status,status,label);assert.ok(!response.text.includes('uptime.monitors.read'),`${label}: no registry disclosed`)}
 }
 for(const [label,message,options,status,code] of [
  ['bad JSON',null,{raw:'{'},400],['array batch',null,{raw:'[]'},400],['null body',null,{raw:'null'},400],
  ['wrong envelope',{...list,jsonrpc:'1.0'},{},200,-32600],['bad id',{...list,id:{}},{},200,-32600],
  ['missing id',{jsonrpc:'2.0',method:list.method},{},200,-32600],['bad initialization',{...initialize,params:{}},{},200,-32602],
  ['pagination',{...list,params:{cursor:'synthetic-uptime-1'}},{},200,-32602],
  ['unknown tool',{jsonrpc:'2.0',id:4,method:method('tools','call'),params:{name:'uptime.unknown'}},{},200,-32602],
  ['bad arguments',{jsonrpc:'2.0',id:5,method:method('tools','call'),params:{name:tools[0].name,arguments:[]}},{},200,-32602],
  ['resources not implemented',{jsonrpc:'2.0',id:6,method:['resources','templates','list'].join('/')},{},200,-32601],
  ['unknown query',list,{query:'?token=synthetic-uptime-1'},400],
  ['unsupported protocol',list,{headers:{'mcp-protocol-version':'unknown'}},400],
  ['wrong content type',list,{headers:{'content-type':'text/plain'}},415],
  ['wrong response type',list,{headers:{accept:'text/html'}},406],
  ['stream not implemented',null,{method:'GET'},405],['session deletion not implemented',null,{method:'DELETE'},405],
 ]){
  const response=await rpc(message,options);assert.equal(response.status,status,label);
  if(code)assert.equal(response.data.error.code,code,label);
  assert.ok(!response.text.includes('uptime.monitors.read'),`${label}: no registry disclosed`);
 }
 assert.deepEqual(await productSnapshot(),baseline,'discovery and every malformed or unauthorized message preserve all product state');
 assert.equal(outbound.length,traffic,'discovery and refusals generate no provider traffic');

 // A previously working session is revoked through Base's native door. Every
 // method rechecks it; an initialization response carries no future authority.
 assert.equal((await call('/auth/signout',{}, {cookie})).status,204);
 const revokedState=await productSnapshot(),revokedTraffic=outbound.length;
 for(const message of [initialize,list,{jsonrpc:'2.0',id:7,method:method('tools','call'),params:{name:'uptime.erasure.run',arguments:{monitorId:monitor.id}}}])assert.equal((await rpc(message)).status,401,'revoked Base session refused');
 assert.deepEqual(await productSnapshot(),revokedState,'revoked calls cannot resurrect or mutate product or authority rows');
 assert.equal(outbound.length,revokedTraffic);
 console.log('PROBE SURFACE-001 invocation: every tool plus concurrent write attempts -> unavailable; complete durable product snapshot and provider traffic unchanged');
 console.log('AGENT-SURFACE-DISCOVERY passed: native Base login, contract-derived registry and coverage, unavailable invocation, malformed and foreign requests, signed-out and revoked authority.');
}finally{await worker?.dispose();await cleanupDirectory(directory)}
