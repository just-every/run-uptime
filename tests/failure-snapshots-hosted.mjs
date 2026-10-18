// EVIDENCE-002: emitted hosted Worker probes use the same separate diagnostic store.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';

test('hosted HTTP failure capture, unavailable diagnostics and retention preserve the monitoring result',{timeout:45000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'uptime-snapshots-hosted-')),origin='https://uptime.example.test',secret=randomBytes(24).toString('hex');let worker;
 try{
  worker=await hostedRuntime(directory,{...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:randomBytes(24).toString('hex')},request=>{
   const url=new URL(request.url);if(url.hostname==='cloudflare-dns.com')return Response.json({Status:0,Answer:[{type:1,data:'93.184.215.14'}]});
   if(url.hostname==='public.example.test')return new Response(`Service Unavailable\napi_key=${secret}`,{status:503,headers:{'content-type':'text/plain','set-cookie':`session=${secret}`}});
   return new Response('canary ready',{status:200});
  });
  const DB=await worker.getD1Database('DB');for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const call=async(path,body,cookie,method=body===undefined?'GET':'POST')=>{
   const response=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method,headers:{origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
   return response;
  };
  const auth=await call('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Hosted owner'});assert.equal(auth.status,303);const cookie=auth.headers.get('set-cookie').split(';')[0];
  const create=async url=>{const response=await call('/api/monitors',{name:'Hosted API',url,canaryUrl:'https://canary.example.test/',intervalMs:60000,retries:0,confirmSlots:1,recoverSlots:1},cookie);assert.equal(response.status,201);return response.json()};
  const monitor=await create('https://public.example.test/health');
  const snapshots=async()=>{const response=await call(`/api/monitors/${monitor.id}/failure-snapshots`,undefined,cookie);assert.equal(response.status,200);return response.json()};
  let read;for(let i=0;i<100;i++){read=await snapshots();if(read.items.length)break;await new Promise(r=>setTimeout(r,50))}
  assert.equal(read.items.length,1);assert.equal(read.items[0].snapshot.status,503);assert.ok(!JSON.stringify(read).includes(secret));assert.ok(read.items[0].snapshot.body.includes('Service Unavailable'));
  const observations=(await DB.prepare('SELECT evidence FROM observations').all()).results;assert.ok(observations.every(row=>!row.evidence.includes(secret)&&!row.evidence.includes('failureSnapshot')));
  const unusual=await create('https://public.example.test/%ZZ');let unavailable;
  for(let i=0;i<100;i++){const response=await call(`/api/monitors/${unusual.id}/failure-snapshots`,undefined,cookie);unavailable=await response.json();if(unavailable.items.length)break;await new Promise(r=>setTimeout(r,50))}
  assert.equal(unavailable.items[0].snapshot.unavailable,'capture_limit');assert.equal(JSON.parse((await DB.prepare('SELECT state FROM monitors WHERE id=?').bind(unusual.id).first()).state).targetState,'Failing','artifact failure cannot hide the outage');
  await DB.prepare('UPDATE failure_snapshots SET expires_at=? WHERE monitor_id=?').bind(Date.now()-1,monitor.id).run();
  assert.equal((await snapshots()).items.length,0,'expired snapshots cannot be read before cleanup');
  const archiveResponse=await call('/api/archive',undefined,cookie);assert.equal(archiveResponse.status,200);assert.ok(!(await archiveResponse.json()).payload.productTables.failure_snapshots.some(row=>row.monitor_id===monitor.id));
  const scheduled=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(scheduled.status,204);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM failure_snapshots WHERE monitor_id=?').bind(monitor.id).first()).n,0);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM observations WHERE slot_id IN(SELECT id FROM slots WHERE monitor_id=?)').bind(monitor.id).first()).n,1);
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
});
