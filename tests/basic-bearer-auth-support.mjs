import assert from 'node:assert/strict';
import {readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {authFixture} from './tls-auth-support.mjs';

// One native credential lifecycle, including unsafe uses, through owner and signed runner doors.
export async function basicBearerAuthJourney(){
 const logs=[],streams=[process.stdout,process.stderr],writers=streams.map(stream=>stream.write);
 for(const [i,stream] of streams.entries())stream.write=function(chunk,...args){logs.push(Buffer.isBuffer(chunk)?chunk.toString():String(chunk));return writers[i].call(this,chunk,...args)};
 const sentinels=[],reads=[],proof=[];let edge,expected,applicationFailure=false,redirect=false;
 const variants=value=>[value,encodeURIComponent(value),Buffer.from(value).toString('base64'),Buffer.from(value).toString('base64url'),[...value].map(c=>'&#'+c.codePointAt(0)+';').join('')];
 function clean(value,label){const text=typeof value==='string'?value:JSON.stringify(value);for(const secret of new Set(sentinels.flatMap(variants)))assert.ok(!text.includes(secret),`${label} excludes planted credential material`)}
 try{
  edge=await authFixture((record,res)=>{
   if(record.url==='/credential-sink'){res.end('operational');return}
   if(record.headers.authorization!==expected){res.writeHead(401,{'www-authenticate':'Basic realm="native"'});res.end('authentication required');return}
   if(redirect){res.writeHead(302,{location:edge.url('/credential-sink','token.example.test')});res.end();return}
   if(applicationFailure){
    res.writeHead(503,{'content-type':'text/html','x-auth-mirror':record.headers.authorization});
    const current=sentinels.at(-1);
    res.end(`<p>Application unavailable</p><p>${current}</p><p>${encodeURIComponent(current)}</p><p>${variants(current).at(-1)}</p><p>${record.headers.authorization}</p>`);return;
   }
   res.end('operational');
  });
  const {f,create,claim,run,submit,url,write,records}=edge;
  const read=async path=>{const response=await f.request(path);assert.equal(response.status,200);reads.push(response.data);return response.data};
  async function scheduled(monitor,{outcome='pass',state='Healthy',reason,status,noRequest=false}={}){
   const current=(await read('/api/overview')).monitors.find(row=>row.id===monitor.id);
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,current.nextDue-Date.now()+25)));
   const task=await claim(monitor.id),before=records.length,result=await run(task);
   assert.equal(result.outcome,outcome);if(status!==undefined)assert.equal(result.status,status);
   if(reason)assert.match(result.checks.find(check=>!check.pass)?.reason??'',reason);
   if(noRequest){assert.equal(result.checks[0].assertion,'credential');assert.equal(records.length,before,'credential refusal precedes every target request')}
   clean(task,'claim');clean(result,'production result');await submit(task,result);
   const history=await read(`/api/monitors/${monitor.id}/history`),slot=history.find(row=>row.id===task.id);
   assert.ok(slot,'the owner reads the actual completed slot');assert.equal(slot.status,'complete');assert.equal(slot.manual,0);
   assert.equal(slot.revision,monitor.revision);assert.deepEqual(slot.definition,task.definition);
   const retained=slot.observations.find(row=>row.id===result.id);
   assert.ok(retained);assert.equal(retained.outcome,outcome);assert.deepEqual(retained.checks,result.checks);
   assert.equal((await f.state(monitor.id)).state,state);
   clean(history,'owner history');proof.push({mode:monitor.definition.name,outcome,state});
   return {result,retained,slot};
  }
  for(const [index,type] of ['basic','bearer'].entries()){
   const reference='native-'+type,monitor=await create({name:type+' credential lifecycle',intervalMs:5000,url:url('/native-'+type,'auth.example.test'),request:{credentialRef:reference}});
   const username='synthetic-uptime-'+(index*4+1)+'-principal',original='synthetic-uptime-'+(index*4+2)+'+initial',rotated='synthetic-uptime-'+(index*4+3)+'+rotated';
   sentinels.push(username,original);
   const auth=value=>type==='basic'?{type,username,password:value}:{type,token:value};
   const header=value=>type==='basic'?'Basic '+Buffer.from(username+':'+value).toString('base64'):'Bearer '+value;
   sentinels.push(...(type==='basic'?[username+':'+original]:[]));
   const credential=value=>({monitorId:monitor.id,origin:new URL(monitor.definition.url).origin,auth:auth(value)});
   await write(reference,credential(original));expected=header(original);
   await scheduled(monitor);assert.ok(records.at(-1).headers.authorization===expected,'the verified endpoint accepts this monitor credential');
   // Revocation at the endpoint must remain an authentication failure, not an application failure.
   expected=header(rotated);await scheduled(monitor,{outcome:'target_failure',state:'Failing',status:401,reason:/Authentication rejected/});
   sentinels.push(...(type==='basic'?[username+':'+rotated]:[]),rotated);
   await write(reference,credential(rotated));await scheduled(monitor);
   const oldRecords=records.length;
   await write(reference,{...credential(rotated),expiresAt:Date.now()-1});
   await scheduled(monitor,{outcome:'runner_error',state:'Unknown',noRequest:true});
   assert.equal(records.length,oldRecords);
   await write(reference,credential(rotated));await scheduled(monitor);
   await rm(join(edge.directory,reference+'.json'));
   await scheduled(monitor,{outcome:'runner_error',state:'Unknown',noRequest:true});
   await write(reference,credential(rotated));await scheduled(monitor);
   applicationFailure=true;
   const failed=await scheduled(monitor,{outcome:'target_failure',state:'Failing',status:503});
   assert.ok(failed.result.checks.every(check=>!check.reason.includes('Authentication rejected')),'an accepted credential does not relabel an application outage');
   assert.ok(failed.retained.failureSnapshot.body.includes('Application unavailable'),'redacted evidence retains the real application failure');
   assert.equal(failed.retained.failureSnapshot.requestHeaders.authorization,'[redacted]');
   assert.equal(failed.retained.failureSnapshot.responseHeaders['x-auth-mirror'],'[redacted]');
   applicationFailure=false;await scheduled(monitor);
   redirect=true;const start=records.length;await scheduled(monitor);redirect=false;
   const hops=records.slice(start);assert.equal(hops.length,2);assert.ok(hops[0].headers.authorization===expected);
   assert.ok(hops[1].host.startsWith('token.example.test:'));assert.equal(hops[1].headers.authorization,undefined);assert.equal(hops[1].body,'');
   const incidents=await read(`/api/monitors/${monitor.id}/incidents`);
   assert.equal(incidents.length,2);assert.ok(incidents.every(incident=>incident.recovery),'the two genuine outages retain their recoveries');
   await read(`/api/monitors/${monitor.id}/revisions`);await read(`/api/monitors/${monitor.id}/failure-snapshots`);
   for(const incident of incidents)await read(`/api/incidents/${incident.trigger.id}/failure-report`);
   await f.pause(monitor);
   for(const host of ['auth.example.test','token.example.test']){
    const foreign=await create({name:type+' foreign credential refusal',url:url('/native-'+type,host),request:{credentialRef:reference}});
    const refused=await scheduled(foreign,{outcome:'runner_error',state:'Unknown',noRequest:true});
    if(host==='auth.example.test'){assert.equal(refused.result.credentialBinding.boundElsewhere,true);assert.equal(refused.result.credentialBinding.monitorId,foreign.id)}
    assert.deepEqual(await read(`/api/monitors/${foreign.id}/incidents`),[],'a refused credential cannot fabricate a target outage');
    await f.pause(foreign);
   }
   // The credential remains only in its owner-only runner file, not in the product persistence tree.
   assert.ok((await readFile(join(edge.directory,reference+'.json'),'utf8')).includes(rotated));
  }
  const names=(await f.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA' ORDER BY name").all()).results;
  let populated=0;
  for(const {name} of names){const rows=(await f.DB.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results;if(rows.length)populated++;clean(rows,'durable '+name)}
  assert.ok(populated>0);
  const archive=await read('/api/archive');assert.ok(archive.payload.tables.observations.length>0);assert.ok(archive.payload.productTables.failure_snapshots.length>0);
  clean(archive,'populated archive');clean(reads,'public owner reads');clean(logs.join(''),'captured native logs');
  async function scanFiles(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())await scanFiles(path);else if(entry.isFile())clean((await readFile(path)).toString(),'product persistence file')}}
  await scanFiles(f.directory);
  console.log('Basic and bearer native lifecycle PASS '+JSON.stringify({scheduledOutcomes:proof.length,scannedTables:names.length,populatedTables:populated,ownerReads:reads.length,archiveObservations:archive.payload.tables.observations.length}));
 }finally{
  try{await edge?.close()}finally{for(const [i,stream] of streams.entries())stream.write=writers[i]}
 }
}
