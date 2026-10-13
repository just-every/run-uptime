import {testAuthBindings,signInOwner} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash,createHmac} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startLocalWorker} from '../scripts/local-worker.mjs';
import {restore} from '../src/domain/control.server.ts';
import {apiRoutes} from '../src/domain/request-boundary.ts';
import {probeHttp} from '../runners/src/engine.mjs';
import {readGrant} from '../runners/src/grants.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
async function intakePorts(){
  const names=['UPTIME_INTAKE_CONTROL_PORT','UPTIME_INTAKE_FIXTURE_PORT'];
  const ports=names.map(name=>{
    const value=process.env[name];
    if(value===undefined)return undefined;
    if(!/^\d+$/.test(value)||!Number.isInteger(Number(value))||Number(value)<15481||Number(value)>15519)throw Error(`${name} must be an integer port in 15481–15519`);
    return Number(value);
  });
  if(ports[0]!==undefined&&ports[0]===ports[1])throw Error(`${names.join(' and ')} must be distinct (port ${ports[0]})`);
  const reservations=[];
  async function reserve(port,name,explicit){
    const server=createServer(socket=>socket.destroy());
    try{
      server.listen(port,'127.0.0.1');await once(server,'listening');
      reservations.push(server);return true;
    }catch(error){
      if(error.code==='EADDRINUSE'){
        if(explicit)throw Error(`${name} port ${port} is occupied`);
        return false;
      }
      throw Error(`${name} could not reserve port ${port}`);
    }
  }
  try{
    // Reserve intentional choices first; keep the whole pair until selection ends.
    for(let i=0;i<ports.length;i++)if(ports[i]!==undefined)await reserve(ports[i],names[i],true);
    for(let i=0;i<ports.length;i++)if(ports[i]===undefined){
      for(let port=15519;port>=15481;port--){
        if(ports.includes(port))continue;
        if(await reserve(port,names[i],false)){ports[i]=port;break}
      }
      if(ports[i]===undefined)throw Error(`${names[i]} has no free port in 15481–15519`);
    }
    return ports;
  }finally{await Promise.all(reservations.map(server=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))))}
}
const [controlPort,fixturePort]=await intakePorts();
console.log(`INTAKE ports: control=${controlPort} fixture=${fixturePort}`);
const dir=await mkdtemp(join(tmpdir(),'uptime-intake-'));
const grantPath=join(dir,'grant.json');
const origin=`http://127.0.0.1:${controlPort}`;
const runner='synthetic-independent-intake-runner-key-20261002';
const maxBytes=2*1024*1024;
const padding='€'.repeat(750000);
let worker,fixture,fixtureClosed,fixtureFailure,cookie='',passed=0;
const fixtureAbort=new AbortController();

async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
function assertFixtureLive(){
  if(fixtureFailure)throw fixtureFailure;
  if(!fixture.pid||fixture.exitCode!==null||fixture.signalCode!==null)throw Error(`Synthetic fixture port ${fixturePort} is not running (pid ${fixture.pid??'unavailable'}, exit ${fixture.exitCode}, signal ${fixture.signalCode})`);
}
async function waitForFixture(){
  const deadline=AbortSignal.timeout(160*125);
  for(let i=0;i<160;i++){
    assertFixtureLive();
    let grant,ready=false;
    try{grant=await readGrant(grantPath,controlPort)}catch{}
    assertFixtureLive();
    if(grant?.port===fixturePort&&grant.pid===fixture.pid){
      try{
        const response=await fetch(`http://127.0.0.1:${fixturePort}/health`,{signal:AbortSignal.any([fixtureAbort.signal,deadline])});
        ready=response.ok&&response.headers.get('x-uptime-fixture')===grant.identity;
        await response.body?.cancel();
      }catch{}
    }
    assertFixtureLive();
    if(ready){console.log(`INTAKE fixture ready: port=${fixturePort} pid=${fixture.pid}`);return}
    if(deadline.aborted)break;
    await new Promise(resolve=>setTimeout(resolve,125));
  }
  assertFixtureLive();
  throw Error(`Synthetic fixture unavailable: port ${fixturePort}, pid ${fixture.pid}`);
}
async function api(path,method='GET',value,headers={}){
  const response=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',cookie,...headers},body:value===undefined?undefined:JSON.stringify(value)});
  const text=await response.text();
  let data;try{data=JSON.parse(text)}catch{data={raw:text}}
  return {status:response.status,headers:response.headers,data};
}
function chunked(path,body,headers={},chunkSize=16381){
  return new Promise((resolve,reject)=>{
    const bytes=Buffer.from(body,'utf8');
    const request=http.request(origin+path,{method:'POST',agent:false,headers:{origin,'content-type':'application/json','transfer-encoding':'chunked','connection':'close',cookie,...headers}},response=>{
      let text='';response.setEncoding('utf8');
      response.on('data',chunk=>text+=chunk);
      response.on('end',()=>{
        let data;try{data=JSON.parse(text)}catch{data={raw:text}}
        resolve({status:response.statusCode,headers:response.headers,data,requestContentLength:request.getHeader('content-length')??null,requestEncoding:request.getHeader('transfer-encoding'),bytes:bytes.byteLength,characters:body.length});
      });
      response.on('error',reject);
    });
    request.on('error',reject);
    (async()=>{
      try{
        for(let offset=0;offset<bytes.length&&!request.destroyed;offset+=chunkSize){
          if(!request.write(bytes.subarray(offset,offset+chunkSize)))await once(request,'drain');
        }
        if(!request.destroyed)request.end();
      }catch(error){if(!request.destroyed)request.destroy(error)}
    })();
  });
}
async function signed(body){
  const timestamp=String(Date.now());
  return chunked('/api/runner/results',body,{
    'x-runner-key':runner,
    'x-sent-at':timestamp,
    'x-runner-signature':createHmac('sha256',runner).update(timestamp+'.'+body,'utf8').digest('hex'),
  },7);
}

try{
  await check('restore rejects a digest-valid oversized UTF8 archive before database access',async()=>{
    const payload={schemaVersion:2,target:'uptime-worker-d1',createdAt:Date.now(),tables:{migrations:[],monitors:[],revisions:[],slots:[],observations:[],outbox:[]},padding};
    const value={payload,sha256:createHash('sha256').update(JSON.stringify(payload),'utf8').digest('hex')};
    assert.ok(JSON.stringify(value).length<maxBytes&&Buffer.byteLength(JSON.stringify(value))>maxBytes);
    await assert.rejects(restore({DB:{prepare(){throw Error('Database accessed before byte guard')}}},value),/Invalid archive integrity\/version/);
  });

  worker=await startLocalWorker({root,port:controlPort,persist:join(dir,'control'),assets:true,bindings:{
    ...testAuthBindings,UPTIME_RUNNER_KEY:runner,
    UPTIME_SYNTHETIC_PORT:String(fixturePort),
  }});
  const DB=await worker.getD1Database('DB');
  for(const name of (await readdir(join(root,'migrations'))).filter(name=>name.endsWith('.sql')).sort()){
    const sql=await readFile(join(root,'migrations',name),'utf8');
    for(const statement of splitSql(sql))await DB.prepare(statement).run();
  }
  fixture=spawn(process.execPath,[join(root,'runners/src/synthetic.mjs')],{cwd:dir,env:{...process.env,UPTIME_SYNTHETIC_PORT:String(fixturePort),UPTIME_GRANT_FILE:grantPath},stdio:'ignore'});
  fixtureClosed=new Promise(resolve=>fixture.once('close',resolve));
  fixture.once('error',()=>{fixtureFailure=Error(`Synthetic fixture failed to spawn on port ${fixturePort}`);fixtureAbort.abort()});
  fixture.once('exit',(code,signal)=>{fixtureFailure=Error(`Synthetic fixture port ${fixturePort} exited (pid ${fixture.pid}, exit ${code}, signal ${signal})`);fixtureAbort.abort()});
  await waitForFixture();
  cookie=await signInOwner(origin);
  await check('chunked body without Content-Length rejects bytes above2MiB despite fewer characters',async()=>{
    const result=await chunked('/api/auth/sign-out',JSON.stringify({padding}));
    assert.ok(result.characters<maxBytes&&result.bytes>maxBytes);
    assert.equal(result.requestContentLength,null);assert.equal(result.requestEncoding,'chunked');
    assert.equal(result.status,413,JSON.stringify(result.data));
  });
  await check('the first ordinary HTTP request immediately after413 still signs out',async()=>{
    const result=await api('/api/auth/sign-out','POST',{});
    assert.equal(result.status,200,JSON.stringify(result.data));
    assert.match(result.headers.get('set-cookie'),/Max-Age=0/);cookie=await signInOwner(origin);
  });
  await check('archive import rejects malformed and truncated UTF8 before JSON interpretation',async()=>{
    const before=(await api('/api/archive')).data;
    const malformed=[
      Buffer.concat([Buffer.from('{"padding":"'),Buffer.from([0xc3,0x28]),Buffer.from('"}')]),
      Buffer.concat([Buffer.from('{"padding":"'),Buffer.from([0xe2,0x82])]),
    ];
    for(const body of malformed){
      const result=await chunked('/api/restore',body,{},1);
      assert.equal(result.status,400);
      assert.deepEqual(result.data,{error:'Invalid UTF-8 request body'});
      assert.equal(result.requestContentLength,null);assert.equal(result.requestEncoding,'chunked');
    }
    const after=await api('/api/archive');assert.equal(after.status,200,'ordinary HTTP remains usable after malformed UTF8');
    assert.deepEqual(after.data.payload.tables,before.payload.tables,'malformed archive input leaves durable tables unchanged');
  });
  let monitor;
  await check('chunked native JSON mutation persists a Unicode monitor definition',async()=>{
    const definition={name:'レビュー € café',url:`http://127.0.0.1:${fixturePort}/health`,intervalMs:86400000,retries:0,confirmSlots:1,recoverSlots:1};
    const result=await chunked('/api/monitors',JSON.stringify(definition),{},1);
    assert.equal(result.status,201,JSON.stringify(result.data));assert.equal(result.data.definition.name,definition.name);monitor=result.data;
  });
  // BASE-INPUT-001 / BASE-SECRET-001: every route in the Worker's route table refuses an invalid path parameter, an undeclared
  // query, a stray or malformed body with a 400 in the standard format, before any service and with nothing durable changed; a
  // refusal never repeats what was sent, here a credential-shaped value.
  await check('every route refuses invalid path, query and body input at its boundary without echo or effect',async()=>{
    const tables=async()=>JSON.stringify(await Promise.all((await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB '_cf*' AND name NOT IN ('public_rate_limits','oa_limits','runner_contact') ORDER BY name").all()).results.map(async({name})=>(await DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results)));
    const secret='planted-credential-0001',before=await tables();
    // Parser diagnostics can truncate the input, so even its short prefix must stay private.
    const send=async(method,path,body)=>{const response=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',cookie,'x-runner-key':runner},...(body===undefined?{}:{body})});const text=await response.text();assert.equal(response.status,400,`${method} ${path}: ${text}`);assert.ok(/^\{"error":"[^"]+"\}$/.test(text)&&!text.includes(secret.slice(0,7)),`${method} ${path} answers the standard error without the input`)};
    for(const route of apiRoutes){
      const at=id=>route.path.replace(':id',id),valid=at(route.params?.id?.(monitor.id)?monitor.id:'00000000-0000-4000-8000-000000000000'),body=route.body==='none'?undefined:'{}';
      if(route.params)await send(route.method,at(encodeURIComponent(secret+'\u0001')),body);
      await send(route.method,`${valid}?${secret}=1`,body);
      if(route.body==='none'&&route.method!=='GET')await send(route.method,valid,JSON.stringify({secret}));
      if(route.body==='empty')await send(route.method,valid,JSON.stringify({secret}));
      if(route.body==='object')for(const malformed of [secret,`["${secret}"]`,`{"value":"${secret}"`])await send(route.method,valid,malformed);
    }
    await send('POST','/api/definitions/preview?source=uptime.monitors',secret);
    await send('POST',`/api/definitions/apply?source=uptime.monitors&digest=${'0'.repeat(64)}`,secret);
    assert.equal(await tables(),before,'no refused input changed anything durable');
  });
  const claimed=await api('/api/runner/claim','POST',{}, {'x-runner-key':runner});
  assert.equal(claimed.status,200);const task=claimed.data.task;assert.equal(task.monitorId,monitor.id);
  const grant=await readGrant(grantPath,controlPort);
  const observation={...await probeHttp({...task.definition,fixtureIdentity:grant.identity},'local-a',[fixturePort]),attempt:0};
  assert.equal(observation.outcome,'pass');
  observation.checks[0].reason+='; 証拠 € café ✓';
  const value={slotId:task.id,leaseOwner:task.leaseOwner,attempts:[observation]};
  await check('signed runner intake rejects over40,000 UTF8 bytes below40,000 characters',async()=>{
    const body=JSON.stringify({...value,padding:'€'.repeat(14000)});
    assert.ok(body.length<40000&&Buffer.byteLength(body)>40000);
    assert.equal((await signed(body)).status,403);
  });
  await check('valid chunked Unicode HMAC authenticates exact UTF8 bytes and persists real probe',async()=>{
    const result=await signed(JSON.stringify(value));assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.accepted,true);
    const history=await api('/api/monitors/'+monitor.id+'/history');assert.equal(history.status,200);
    assert.equal(history.data[0].observations[0].checks[0].reason,observation.checks[0].reason);
    assert.equal(history.data[0].observations[0].outcome,'pass');
  });
  await check('export counts UTF8 bytes before returning a multibyte archive',async()=>{
    const before=await api('/api/archive');assert.equal(before.status,200,JSON.stringify(before.data));
    const {state}=await DB.prepare('SELECT state FROM monitors WHERE id=?').bind(monitor.id).first();
    const oversizedState=JSON.stringify({...JSON.parse(state),reason:padding});
    const oversizedArchive=structuredClone(before.data);
    oversizedArchive.payload.tables.monitors.find(row=>row.id===monitor.id).state=oversizedState;
    assert.ok(JSON.stringify(oversizedArchive).length<maxBytes&&Buffer.byteLength(JSON.stringify(oversizedArchive))>maxBytes);
    // Seed only the size boundary in real D1; export uses the owner HTTP door,
    // including the installation's real journal and archive projections.
    await DB.prepare('UPDATE monitors SET state=? WHERE id=?').bind(oversizedState,monitor.id).run();
    try{
      const result=await api('/api/archive');assert.equal(result.status,400);
      assert.match(result.data.error,/Archive exceeds 2 MiB/);
      assert.equal((await DB.prepare('SELECT state FROM monitors WHERE id=?').bind(monitor.id).first()).state,oversizedState,'export refusal preserves the stored evidence');
    }finally{
      await DB.prepare('UPDATE monitors SET state=? WHERE id=?').bind(state,monitor.id).run();
    }
    const after=await api('/api/archive');assert.equal(after.status,200,JSON.stringify(after.data));
    assert.deepEqual(after.data.payload.tables,before.data.payload.tables);
    assert.deepEqual(after.data.payload.productTables,before.data.payload.productTables);
    assert.deepEqual(after.data.payload.erasureFence,before.data.payload.erasureFence);
  });
  console.log(`INTAKE-001 passed: ${passed} UTF8 byte, chunked HTTP, post413 lifecycle, actualD1 and signed real-probe checks on the recommended emitted Worker path.`);
}finally{
  try{
    if(fixture?.pid&&fixture.exitCode===null&&fixture.signalCode===null)fixture.kill('SIGTERM');
    await fixtureClosed;
  }finally{
    try{if(worker)await worker.dispose()}finally{await rm(dir,{recursive:true,force:true})}
  }
}
