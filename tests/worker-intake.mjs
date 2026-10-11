import {testAuthBindings,signInOwner} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash,createHmac} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startLocalWorker} from '../scripts/local-worker.mjs';
import {archive,restore} from '../src/domain/control.server.ts';
import {TABLES,columns} from '../src/domain/archive-schema.ts';
import {installationLocalTables} from '../src/domain/archive-inventory.ts';
import {probeHttp} from '../runners/src/engine.mjs';
import {readGrant} from '../runners/src/grants.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const controlPort=Number(process.env.UPTIME_INTAKE_CONTROL_PORT??15510);
const fixturePort=Number(process.env.UPTIME_INTAKE_FIXTURE_PORT??15511);
if([controlPort,fixturePort].some(p=>!Number.isInteger(p)||p<15481||p>15519)||controlPort===fixturePort)throw Error('Distinct assigned local intake-test ports required');
const dir=await mkdtemp(join(tmpdir(),'uptime-intake-'));
const grantPath=join(dir,'grant.json');
const origin=`http://127.0.0.1:${controlPort}`;
const runner='synthetic-independent-intake-runner-key-20261002';
const maxBytes=2*1024*1024;
const padding='€'.repeat(750000);
let worker,fixture,cookie='',logs='',passed=0;

async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
async function wait(fn){
  for(let i=0;i<160;i++){
    try{if(await fn())return}catch{}
    await new Promise(resolve=>setTimeout(resolve,125));
  }
  throw Error('Synthetic fixture unavailable: '+logs.slice(-4000));
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
  await check('export counts UTF8 bytes before returning a multibyte archive',async()=>{
    const definition=JSON.stringify({name:'UTF8 byte-bound fixture',url:'http://127.0.0.1:15511/health',intervalMs:86400000});
    const rows=Object.fromEntries(TABLES.map(name=>[name,[]]));
    rows.monitors=[{id:'utf8-byte-bound-fixture',revision:1,definition,next_due:0,state:JSON.stringify({state:'Unknown',confirmedFailure:false,notificationOpen:false,reason:padding})}];
    rows.revisions=[{monitor_id:'utf8-byte-bound-fixture',revision:1,definition,created_at:0}];
    const sourceColumns={...columns,notification_destinations:['id','name','kind','enabled','credential_id','created_at','deleted_at'],notification_jobs:[...columns.notification_jobs,'credential_id','claim','claim_until'],integration_deliveries:[...columns.integration_deliveries,'fingerprint','destination_hash','claim','claim_until'],integration_replays:[...columns.integration_replays,'fingerprint']};
    const physicalTables=[...TABLES,...Object.keys(installationLocalTables)];
    const DB={
      prepare(sql){return {sql,async all(){return {results:physicalTables.map(name=>({name}))}},async first(){return {n:0}}}},
      async batch(statements){
        if(statements[0]?.sql.startsWith('PRAGMA table_info('))return statements.map(({sql})=>{const name=sql.slice('PRAGMA table_info('.length,-1);return {results:sourceColumns[name].map(name=>({name}))}});
        return TABLES.map(name=>({results:rows[name]}));
      },
    };
    assert.ok(padding.length<maxBytes&&Buffer.byteLength(padding)>maxBytes);
    await assert.rejects(archive({DB}),/Archive exceeds 2 MiB/);
  });
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
  fixture=spawn(process.execPath,[join(root,'runners/src/synthetic.mjs')],{cwd:dir,env:{...process.env,UPTIME_SYNTHETIC_PORT:String(fixturePort),UPTIME_GRANT_FILE:grantPath},stdio:'pipe'});
  fixture.stdout.on('data',chunk=>logs+=chunk);fixture.stderr.on('data',chunk=>logs+=chunk);
  await wait(async()=> (await fetch(`http://127.0.0.1:${fixturePort}/health`)).ok);
  cookie=await signInOwner(origin);
  await check('valid chunked owner sign-out preserves UTF8 split into one-byte HTTP chunks',async()=>{
    const result=await chunked('/api/auth/sign-out',JSON.stringify({note:'€日本語✓ café'}),{},1);
    assert.equal(result.status,200,JSON.stringify(result.data));
    assert.equal(result.requestContentLength,null);assert.equal(result.requestEncoding,'chunked');
    assert.match(result.headers['set-cookie'][0],/Max-Age=0/);cookie=await signInOwner(origin);
  });
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
  console.log(`INTAKE-001 passed: ${passed} UTF8 byte, chunked HTTP, post413 lifecycle, actualD1 and signed real-probe checks on the recommended emitted Worker path.`);
}finally{
  if(fixture&&fixture.exitCode===null&&fixture.signalCode===null){fixture.kill('SIGTERM');await once(fixture,'exit')}
  if(worker)await worker.dispose();
  await rm(dir,{recursive:true,force:true});
}
