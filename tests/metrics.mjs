// METRICS-001: authenticated real Worker scrape, same report engines and provider-edge export.
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {signInOwner} from './auth-test-support.mjs';
import {metricsFixture} from './metrics-fixture.mjs';
import {runMetricsExport} from '../scripts/metrics-export.mjs';
import {proveGrafanaPrometheus} from './metrics-grafana-support.mjs';
const directory=await runtimeDirectory();let worker,foreign;
try{
 ({worker}=await migratedWorker({persist:join(directory,'worker')}));const origin=(await worker.ready).origin,db=await worker.getD1Database('DB'),cookie=await signInOwner(origin);
 const owner=(path,method='GET',data)=>fetch(origin+path,{method,headers:{cookie,origin,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
 assert.equal((await fetch(origin+'/api/v1/metrics')).status,401);
 const created=await owner('/api/metrics/keys','POST',{name:'Production dashboards'});assert.equal(created.status,201);const key=await created.json(),headers={authorization:'Bearer '+key.token};
 const archive=await owner('/api/archive');assert.equal(archive.status,200);assert.ok(!(await archive.text()).includes(key.token));
 assert.equal((await owner('/api/metrics/keys','POST',{name:'Overreach',scopes:['owner']})).status,400);assert.equal((await(await owner('/api/metrics/keys')).json()).length,1);
 const {ids,from,to}=await metricsFixture(db,origin),query=new URLSearchParams({period:'custom',from:String(from),to:String(to),timeZone:'America/Chicago'});
 const read=async(format='json',extra='')=>fetch(origin+'/api/v1/metrics?'+query+'&format='+format+extra,{headers});
 const raw=await read();assert.equal(raw.status,200);const snapshot=await raw.json();assert.equal(snapshot.monitors.length,3);
 for(const monitor of snapshot.monitors){
  const report=await(await owner('/api/v1/monitors/'+monitor.id+'/report?'+query+'&bucket=1d')).json();assert.deepEqual(monitor.availability,report.availability);assert.deepEqual(monitor.latency.statistics,report.latency.statistics);assert.deepEqual(monitor.incidents,report.incidentSummary);assert.equal(monitor.deliveries.find(d=>d.state==='uncertain').count,1);
  assert.equal(monitor.current.probes[0].contactFresh,false);assert.ok(monitor.current.probes.every(p=>p.runnerId));
 }
 assert.equal(snapshot.monitors.find(m=>m.id===ids[0]).current.state,'Unknown');assert.equal(snapshot.monitors.find(m=>m.id===ids[1]).current.state,'Healthy');assert.equal(snapshot.monitors.find(m=>m.id===ids[2]).current.state,'Degraded');
 const scrape=await read('prometheus');assert.equal(scrape.status,200);assert.match(scrape.headers.get('content-type'),/text\/plain/);const text=await scrape.text();
 assert.ok(!text.includes('shop.example.test')&&!text.includes('Checkout API')&&!text.includes('us-east-test'));
 for(const m of snapshot.monitors){assert.ok(text.includes(`uptime_availability_observed_seconds{monitor_id="${m.id}"} ${m.availability.observedMs/1000}`));assert.ok(text.includes(`uptime_availability_unknown_seconds{monitor_id="${m.id}"} ${m.availability.unknownMs/1000}`));}
 assert.equal((await read('json','&monitor=foreign-installation-monitor')).status,404);assert.equal((await read('json','&unexpected=true')).status,400);
 assert.equal((await fetch(origin+'/api/v1/metrics?monitor='+Array.from({length:101},(_,i)=>'monitor-'+i).join(','),{headers})).status,400);
 const emptyKey=await owner('/api/metrics/keys','POST',{name:'Soon expired',expiresAt:Date.now()+1000});assert.equal(emptyKey.status,201);const expired=await emptyKey.json();await db.prepare('UPDATE integration_tokens SET expires_at=? WHERE id=?').bind(Date.now()-1,expired.credential.id).run();assert.equal((await fetch(origin+'/api/v1/metrics',{headers:{authorization:'Bearer '+expired.token}})).status,401);
 for(const [method,path,body] of [['POST','/api/monitors',{}],['DELETE','/api/metrics/keys/'+key.credential.id],['GET','/api/archive']])assert.equal((await fetch(origin+path,{method,headers:{...headers,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})).status,403);
 // Hash-only custody and no automatic checkpoint mutation from a scrape.
 const stored=await db.prepare('SELECT token_hash FROM integration_tokens WHERE id=?').bind(key.credential.id).first();assert.notEqual(stored.token_hash,key.token);assert.equal((await db.prepare('SELECT COUNT(*) n FROM attempt_checkpoints').first()).n,0);
 const meta=await(await owner('/api/metrics/keys')).json();assert.ok(meta.find(m=>m.id===key.credential.id).lastUsedAt);assert.ok(!JSON.stringify(meta).includes(key.token));
 ({worker:foreign}=await migratedWorker({persist:join(directory,'foreign')}));const foreignOrigin=(await foreign.ready).origin;await signInOwner(foreignOrigin);assert.equal((await fetch(foreignOrigin+'/api/v1/metrics',{headers})).status,401);
 const env={UPTIME_METRICS_TOKEN:key.token,DATADOG_API_KEY:randomBytes(32).toString('base64url'),UPTIME_METRICS_WEBHOOK_SECRET:randomBytes(32).toString('base64url')};let wire,sends=0,status=202;
 const transport={async send(value){wire=value;sends++;return {status,headers:{},body:''}}};
 const opts={origin,monitors:ids,period:'custom',from:String(from),to:String(to),timeZone:'America/Chicago'};
 assert.equal((await runMetricsExport({...opts,datadogSite:'datadoghq.com'},{env,transport})).status,'accepted');assert.equal(wire.url,'https://api.datadoghq.com/api/v2/series');assert.equal(wire.headers['DD-API-KEY'],env.DATADOG_API_KEY);const series=JSON.parse(wire.body).series;assert.ok(series.some(s=>s.tags.some(t=>t==='probe_id:local-a')));assert.ok(series.every(s=>s.tags.includes('source:uptime')));assert.ok(!wire.body.includes('shop.example.test'));
 assert.equal((await runMetricsExport({...opts,webhook:'https://metrics.example.com/receive'},{env,transport})).status,'accepted');const stamp=wire.headers['x-uptime-timestamp'];assert.equal(wire.headers['x-uptime-signature'],'v1='+createHmac('sha256',env.UPTIME_METRICS_WEBHOOK_SECRET).update(stamp+'.'+wire.body).digest('hex'));assert.deepEqual(JSON.parse(wire.body).monitors.map(m=>m.availability),snapshot.monitors.map(m=>m.availability));
 status=500;assert.equal((await runMetricsExport({...opts,datadogSite:'datadoghq.com'},{env,transport})).status,'uncertain');status=400;assert.equal((await runMetricsExport({...opts,datadogSite:'datadoghq.com'},{env,transport})).status,'failed');assert.equal(sends,4);
 assert.equal((await owner('/api/metrics/keys/'+key.credential.id,'DELETE')).status,200);assert.equal((await read()).status,401);const previous=sends;await runMetricsExport({...opts,datadogSite:'datadoghq.com'},{env,transport});assert.equal(sends,previous,'revocation stops export before provider traffic');
 console.log('METRICS-001 PASS: identical report/scrape figures, source locations, Healthy/Degraded/stale Unknown, scoped expiring/revocable hash-only credentials, installation isolation and bounded one-shot provider-edge exports.');
}finally{await foreign?.dispose();await worker?.dispose();await cleanupDirectory(directory)}

await proveGrafanaPrometheus();
