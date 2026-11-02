import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {randomUUID,webcrypto} from 'node:crypto';
import {basename,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {readdir} from 'node:fs/promises';

function encodedForms(value){
 const bytes=Buffer.from(value),uri=encodeURIComponent(value);
 const percent=[...bytes].map(byte=>'%'+byte.toString(16).padStart(2,'0')).join('');
 return [value,uri,encodeURIComponent(uri),percent,percent.toUpperCase(),
  bytes.toString('base64'),bytes.toString('base64url'),bytes.toString('hex'),bytes.toString('hex').toUpperCase(),
  JSON.stringify(value).slice(1,-1),value.replaceAll('/','\\/'),
  [...value].map(char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')).join('')];
}
export function assertSecretFree(value,secrets,label){
 const text=typeof value==='string'?value:JSON.stringify(value);
 // Report only the boundary, never the matching value or captured bytes.
 assert.ok(!secrets.some(secret=>encodedForms(secret).some(form=>text.includes(form))),label+' excludes raw and encoded credential material');
}

async function journey(){
 let stage='diagnostic capture',worker,directory,inspector,cleanupDirectory;
 const runtimes=[],spawn=childProcess.spawn;
 // Observe the actual runtime pipes before Miniflare's structured-log parser.
 // The sole launch addition is a loopback inspector for harmless log canaries;
 // no logger, handler, service, binding or persistence helper is replaced.
 childProcess.spawn=function(command,args,options){
  const runtime=basename(String(command))==='workerd';
  const child=spawn.call(this,command,runtime?[...args,'--inspector-addr=127.0.0.1:0']:args,options);
  if(runtime){
   assert.ok(child.stdout?.readable&&child.stderr?.readable&&child.stdio[3]?.readable,'all native runtime diagnostic pipes are available');
   const record={stdout:[],stderr:[],control:'',inspectorPort:null,closed:false};runtimes.push(record);
   for(const stream of ['stdout','stderr'])child[stream].on('data',chunk=>record[stream].push(Buffer.from(chunk)));
   child.stdio[3].on('data',chunk=>{
    record.control+=chunk;
    for(const line of record.control.split('\n').slice(0,-1)){
     const message=JSON.parse(line);
     if(message.event==='listen-inspector')record.inspectorPort=message.port;
    }
   });
   child.once('close',()=>{record.closed=true});
  }
  return child;
 };
 syncBuiltinESMExports();
 const send=value=>new Promise((resolve,reject)=>process.send(value,error=>error?reject(error):resolve()));
 const cleanup=async()=>{
  inspector?.close();
  if(worker){const current=worker;worker=null;await current.dispose()}
  if(directory&&cleanupDirectory){await cleanupDirectory(directory);directory=null}
 };
 process.once('SIGTERM',()=>{void cleanup().finally(()=>process.exit(1))});
 try{
  const {migratedWorker,runtimeDirectory,cleanupDirectory:remove,availablePorts,waitFor}=await import('./notify-acceptance-runtime.mjs');
  cleanupDirectory=remove;
  const {testAuthBindings,authRequest,sessionCookie}=await import('./auth-test-support.mjs');
  const {allDeliveredMessages}=await import('./mail-provider-fixture.mjs');
  const {signJws,seconds,autonomousPolicy,heldPolicy,accessToken,policyEnvelope}=await import('../src/base/modules/agent-door/conformance/crypto.mjs');
  const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const key=await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid='synthetic-uptime-query-token';
  const issuer='https://business.example.test',installationId=randomUUID(),sub=randomUUID(),business=randomUUID();
  directory=await runtimeDirectory();const [port]=await availablePorts(1),origin='http://127.0.0.1:'+port;
  const bindings={...testAuthBindings,RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,
   RER_OWNER_CLAIM_APP_ORIGIN:origin,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:key}),
   RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:origin,subject:installationId,keys:{[kid]:key}})};
  let providerRequests=0;
  stage='native emitted Worker';
  const persist=join(directory,'worker');
  const runtime=await migratedWorker({port,persist,bindings,outboundService:async()=>{
   providerRequests++;throw Error('Unexpected provider traffic in query-token journey');
  }});worker=runtime.worker;const db=runtime.DB;
  stage='native runtime pipe availability';
  assert.ok(runtimes.length>0,'the emitted Worker started a captured native runtime');
  assert.ok(runtimes.every(record=>record.inspectorPort),'every native runtime exposes the diagnostic canary door');
  // Instantiate the emitted user isolate before asking its inspector to log.
  // This anonymous control also establishes that the catalogue needs authority.
  const anonymous=await fetch(origin+'/mcp',{method:'POST',headers:{origin,'content-type':'application/json','mcp-protocol-version':'2026-07-28','mcp-method':'tools/list'},
   body:JSON.stringify({jsonrpc:'2.0',id:0,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})});
  assert.equal(anonymous.status,401,'the native catalogue refuses an anonymous caller');await anonymous.body.cancel();
  stage='native inspector target discovery';
  const active=runtimes.at(-1),inspectorOrigin='http://127.0.0.1:'+active.inspectorPort;
  const targets=await(await fetch(inspectorOrigin+'/json/list',{signal:AbortSignal.timeout(5000)})).json();
  const target=targets.find(item=>item.id?.startsWith('core:user:')&&!item.id.includes('miniflare'));
  assert.ok(target?.webSocketDebuggerUrl,'the actual emitted user Worker is inspectable');
  stage='native inspector connection';
  inspector=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   inspector.addEventListener('open',resolve,{once:true});
   inspector.addEventListener('error',()=>reject(Error('Native diagnostic canary connection unavailable')),{once:true});
  });
  let inspectorId=0;
  const contexts=[];
  inspector.addEventListener('message',event=>{
   const message=JSON.parse(event.data);
   if(message.method==='Runtime.executionContextCreated')contexts.push(message.params.context.id);
  });
  inspector.send(JSON.stringify({id:++inspectorId,method:'Runtime.enable'}));
  await waitFor(()=>contexts.length,'the actual Worker logging execution context',5000);
  const diagnosticCanary=async phase=>{
   stage='native Worker logging canary evaluation '+phase;
   const id=++inspectorId,markers=['log','warn','error'].map(level=>`synthetic-uptime-worker-${level}-${phase}`);
   const answer=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{inspector.removeEventListener('message',receive);reject(Error('Native diagnostic canary unavailable'))},5000);
    function receive(event){const message=JSON.parse(event.data);if(message.id!==id)return;clearTimeout(timer);inspector.removeEventListener('message',receive);resolve(message)}
    inspector.addEventListener('message',receive);
   });
   inspector.send(JSON.stringify({id,method:'Runtime.evaluate',params:{contextId:contexts.at(-1),expression:markers.map((marker,index)=>`console.${['log','warn','error'][index]}(${JSON.stringify(marker)})`).join(';')}}));
   const result=await answer;
   assert.ok(!result.error&&!result.result?.exceptionDetails,'native logging canary evaluates successfully');
   stage='native Worker logging canary raw pipes '+phase;
   await waitFor(()=>markers.every(marker=>runtimes.some(record=>['stdout','stderr'].some(stream=>Buffer.concat(record[stream]).includes(marker)))),'all native Worker log levels reach the captured runtime pipes',5000);
   process.stdout.write(`synthetic-uptime-node-stdout-${phase}\n`);
   process.stderr.write(`synthetic-uptime-node-stderr-${phase}\n`);
  };
  stage='native Worker logging canary before requests';
  await diagnosticCanary('before');
  stage='native sponsor and Business pairing';
  const iat=seconds(),claim=await signJws(pair.privateKey,kid,'rer-owner-claim+jwt',{v:1,iss:issuer,aud:origin,installationId,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat,exp:iat+300});
  const call=authRequest(origin),cookie=sessionCookie(await call('/auth/owner-claim',{token:claim,displayName:'Synthetic Uptime Owner',returnTo:'/app'}));
  const settings=await signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:origin,sub:installationId,business,email:bindings.OWNER_EMAIL,owner_id:sub,jti:randomUUID(),iat,exp:iat+300,rev:1,values:{},logo:null,team:null});
  const paired=await call('/api/rer/business-settings',{settings});assert.equal(paired.status,200,'native signed Business pairing succeeds');await paired.body.cancel();
  const context={origin,signer:{privateKey:pair.privateKey,kid,issuer,installationId},person:{email:bindings.OWNER_EMAIL,cookie,sub},
   business,consent:randomUUID(),agentId:'synthetic-uptime-'+randomUUID(),seq:0,revision:0,
   surface:{specialist:'monitoring-operator',tools:[{scope:'uptime:read'}]}};
  // Mint exactly one fresh, signed, single-sponsor bearer. It crosses no argv,
  // environment, file or diagnostic boundary, including failed assertions.
  const bearer=await accessToken(context),query=new URLSearchParams({access_token:bearer}).toString(),credentialUrl=origin+'/mcp?'+query;
  const secrets=[bearer,query,'?'+query,credentialUrl,'access_token='];
  await send({type:'secrets',values:secrets});
  const responses=[];
  let requestId=0;
  const mcp=async(version,{inQuery=false,inHeader=true}={})=>{
   const response=await fetch(inQuery?credentialUrl:origin+'/mcp',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10_000),
    headers:{origin,accept:'application/json, text/event-stream','content-type':'application/json','mcp-protocol-version':version,'mcp-method':'tools/list',...(inHeader?{authorization:'Bearer '+bearer}:{})},
    body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method:'tools/list',params:version==='2025-11-25'?{}:{_meta:{'io.modelcontextprotocol/protocolVersion':version}}})});
   const text=await response.text(),headers=Object.fromEntries(response.headers);
   responses.push({headers,text});assertSecretFree({headers,text},secrets,'MCP response');
   return {status:response.status,headers,body:JSON.parse(text)};
  };
  const {DatabaseSync}=await import('node:sqlite');
  const sqliteFiles=async(directory,prefix='')=>{
   const files=[];
   for(const entry of await readdir(directory,{withFileTypes:true})){
    const name=join(prefix,entry.name),path=join(directory,entry.name);
    if(entry.isDirectory())files.push(...await sqliteFiles(path,name));
    else if(entry.isFile()&&entry.name.endsWith('.sqlite'))files.push({name,path});
   }
   return files.sort((a,b)=>a.name.localeCompare(b.name));
  };
  const snapshot=async()=>{
   // Read the real persisted SQLite databases, including SQLite sequences and
   // engine metadata that the D1 SQL proxy deliberately makes inaccessible.
   // A read-only transaction gives one consistent view of each whole database.
   const files=await sqliteFiles(persist),state={};
   assert.ok(files.length,'complete durable capture requires real persisted databases');
   for(const {name,path} of files){
    const stored=new DatabaseSync(path,{readOnly:true});
    try{
     stored.exec('BEGIN');
     const schema=stored.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
     const tables={};
     for(const table of schema.filter(row=>row.type==='table'))tables[table.name]=stored.prepare(`SELECT * FROM "${table.name.replaceAll('"','""')}"`).all().map(row=>JSON.stringify(row)).sort();
     state[name]={schema,tables};stored.exec('COMMIT');
    }finally{stored.close()}
   }
   return state;
  };
  let cases=0,refusals=0,tables=0;
  for(const [policyName,document] of [['autonomous',autonomousPolicy()],['held',heldPolicy()]]){
   stage=policyName+' native policy';
   const signed=await policyEnvelope(context,document),adopted=await call('/api/rer/agent-policy',{policy:signed.policy});
   assert.equal(adopted.status,200,'signed native policy is adopted');await adopted.body.cancel();
   context.seq=signed.payload.seq;context.revision=signed.payload.revision;
   for(const version of ['2026-07-28','2025-11-25']){
    stage=policyName+' '+version+' Authorization control';
    const allowed=await mcp(version);
    assert.equal(allowed.status,200,'the same bearer works in Authorization before query refusals');
    assert.ok(allowed.body.result?.tools?.some(tool=>tool.name==='uptime.monitors.list'),'valid authority returns the native tool catalogue');
    const sponsor=await db.prepare('SELECT id FROM oa_operators WHERE email=?').bind(bindings.OWNER_EMAIL).first();
    const admitted=await db.prepare('SELECT sponsor FROM agent_door_agents WHERE id=?').bind(context.agentId).first();
    assert.equal(admitted?.sponsor,sponsor.id,'the token is admitted as its real native sponsor');
    for(const inHeader of [false,true]){
     const label=policyName+' '+version+(inHeader?' query plus valid header':' query only');
     stage=label+' snapshot before';
     const before=await snapshot();tables=Object.values(before).reduce((count,database)=>count+Object.keys(database.tables).length,0);
     assert.ok(Object.values(before).some(database=>database.tables.agent_door_agents?.some(row=>JSON.parse(row).id===context.agentId)),'the durable capture contains the actual natively admitted agent');
     stage=label+' durable exclusion before';
     assertSecretFree(before,secrets,'durable rows before refusal');
     stage=label+' transport refusal';
     const refused=await mcp(version,{inQuery:true,inHeader});
     assert.equal(refused.status,401,'query credentials are refused even with valid Authorization');
     assert.equal(refused.body.error?.code,-32001,'the native transport returns its authentication refusal');
     assert.equal(refused.body.result,undefined,'no catalogue or tool result is disclosed');
     assert.ok(refused.headers['www-authenticate']?.includes('resource_metadata='),'refusal retains the ordinary authentication challenge');
     stage=label+' snapshot after';
     const after=await snapshot();assertSecretFree(after,secrets,'durable rows after refusal');
     // No counters are exempted: query refusal precedes agent admission, and
     // this MCP door has no public rate-limit declaration. Compare every table,
     // including credential, audit, custody and SQLite sequence state.
     stage=label+' durable equality';
     assert.ok(isDeepStrictEqual(after,before),'query refusal preserves the complete durable state with zero admission-counter changes');
     assert.equal(providerRequests,0,'refused requests cause zero provider traffic');
     assert.equal(allDeliveredMessages().length,0,'the unchanged mail edge receives no submission');
     refusals++;
    }
    const stillAllowed=await mcp(version);
    assert.equal(stillAllowed.status,200,'query refusal did not revoke or consume the valid bearer');
    assert.ok(stillAllowed.body.result?.tools?.length,'native authority remains usable');cases++;
   }
  }
  stage='complete diagnostic exclusion';
  await diagnosticCanary('after');
  assertSecretFree(responses,secrets,'all response headers and bodies');
  assertSecretFree(await snapshot(),secrets,'final complete durable state');
  await cleanup();
  await waitFor(()=>runtimes.every(record=>record.closed),'captured runtime streams close completely',5000);
  for(const record of runtimes)for(const stream of ['stdout','stderr'])assertSecretFree(Buffer.concat(record[stream]).toString('utf8'),secrets,'complete raw runtime '+stream);
  assert.equal(providerRequests,0,'the native journey sends nothing to a provider');
  assert.equal(allDeliveredMessages().length,0,'no authentication or notification mail was submitted');
  await send({type:'proof',cases,refusals,unchangedRefusals:refusals,tables,providerRequests,runtimeCapture:true});
 }catch{
  // A fixed stage is enough to diagnose this isolated journey. In particular,
  // never stringify an assertion, Request, response, durable row or child log.
  await send({type:'failure',stage});process.exitCode=1;
 }finally{
  await cleanup();childProcess.spawn=spawn;syncBuiltinESMExports();
  process.disconnect();
 }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await journey();
