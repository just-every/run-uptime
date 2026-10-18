import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {signInOwner,testAuthBindings} from './auth-test-support.mjs';
import {migrate} from './probe-native-support.mjs';

// One owner reporting journey through the emitted Worker and its real D1.
// Historical fixtures exercise windows that a live six-second check cannot age into.
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const persist=await mkdtemp(join(tmpdir(),'uptime-reporting-'));
const minute=60000,day=86400000,end=Date.now()-3600000,from=end-180*minute;
let worker;
try{
 await migrate(persist);
 worker=await startLocalWorker({root,persist,bindings:testAuthBindings});
 const db=await worker.getD1Database('DB'),origin=(await worker.ready).origin;
 const cookie=await signInOwner(origin,{bindings:testAuthBindings});
 const id=`report-checkout-${end}`,capId=`report-volume-${end}`;
 const definition={name:'Checkout API',type:'http',network:'synthetic',url:'http://127.0.0.1:15516/health',
  intervalMs:minute,freshnessMs:2*minute,timeoutMs:2000,retries:1,failureQuorum:2,confirmSlots:2,recoverSlots:2,
  probes:['local-a','local-b'],assertions:{status:200},enabled:true,maintenanceUntil:0};
 const maintenance={...definition,maintenanceUntil:from+75*minute},paused={...definition,enabled:false};
 const run=async statements=>{for(let index=0;index<statements.length;index+=80)await db.batch(statements.slice(index,index+80))};
 await run([
  db.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind(id,3,JSON.stringify(paused),end+minute,JSON.stringify({state:'Unknown'})),
  db.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind(id),
  db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(id,1,JSON.stringify(definition),from-day),
  db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(id,2,JSON.stringify(maintenance),from+65*minute),
  db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(id,3,JSON.stringify(paused),from+165*minute),
 ]);
 const statements=[];
 const addSlot=(slotId,dueAt,revision,frozen,manual=0)=>statements.push(db.prepare(
  'INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual) VALUES(?,?,?,?,?,?,?,0,0,?)')
  .bind(slotId,id,revision,dueAt,'complete',JSON.stringify(frozen),'fixture',manual));
 const addObservation=(slotId,probe,attempt,dueAt,durationMs,outcome='pass',delay=0)=>{
  const observation={id:`${slotId}:${probe}:${attempt}`,probe,attempt,startedAt:dueAt+delay,completedAt:dueAt+delay+durationMs,durationMs,
   outcome,runnerVersion:'uptime-node/0.1.0',status:outcome==='pass'?200:503,bytes:2,checks:[{assertion:'status',pass:outcome==='pass',reason:'Controlled historical result'}]};
  statements.push(db.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').bind(observation.id,slotId,probe,attempt,JSON.stringify(observation)));
 };
 for(let index=0;index<150;index++){
  const dueAt=from+(10+index)*minute,slotId=`${id}:${index}`,revision=index<55?1:2;
  addSlot(slotId,dueAt,revision,revision===1?definition:maintenance);
  addObservation(slotId,'local-a',0,dueAt,100,[10,11,12,20].includes(index)?'target_failure':'pass');
  if(index===20)addObservation(slotId,'local-a',1,dueAt,50,'pass',110);
  if(index!==30)addObservation(slotId,'local-b',0,dueAt,200);
 }
 const manual=`${id}:manual`,manualAt=from+150*minute;
 addSlot(manual,manualAt,2,maintenance,1);
 for(const probe of definition.probes)addObservation(manual,probe,0,manualAt,2000);
 const event=(key,kind,at)=>({schemaVersion:2,id:`${key}:${kind}`,kind,eventType:kind==='trigger'?'uptime.incident.firing':'uptime.incident.recovered',
  incidentKey:key,state:kind==='trigger'?'firing':'recovered',title:'Checkout API incident',monitorId:id,monitorRevision:1,monitorName:definition.name,
  url:definition.url,slotId:`${id}:10`,observedAt:at,visibility:'private',evidenceRef:`/api/monitors/${id}/history`,explanation:'Controlled scheduled transition',probes:[],consoleUrl:origin});
 const addIncident=(key,started,ended)=>{
  for(const [kind,at] of [['trigger',started],['recovery',ended]]){
   const record=event(key,kind,at);
   statements.push(db.prepare('INSERT INTO outbox(id,monitor_id,slot_id,kind,event) VALUES(?,?,?,?,?)')
    .bind(record.id,id,record.slotId,kind,JSON.stringify(record)));
  }
 };
 addIncident('overlap',from-minute,from+30000);
 addIncident('outage',from+20*minute,from+23*minute);
 addIncident('outside',from-3*minute,from-2*minute);
 // Newer events must not hide the matching incidents behind a latest-100 list.
 for(let index=0;index<101;index++)addIncident(`later-${index}`,end+minute+index*1000,end+minute+index*1000+100);
 await run(statements);

 const params=new URLSearchParams({period:'custom',from:String(from),to:String(end),timeZone:'America/Chicago',sla:'99.9',bucket:'1m'});
 const path=(resource,query=params,monitor=id)=>`/api/v1/monitors/${encodeURIComponent(monitor)}/${resource}?${query}`;
 const get=async(resource,query=params,monitor=id,extra={})=>fetch(origin+path(resource,query,monitor),{headers:{cookie,...extra}});
 assert.equal((await fetch(origin+path('report'))).status,401,'reports require the native owner session');
 const response=await get('report');
 assert.equal(response.status,200,await response.clone().text());
 const report=await response.json();
 assert.deepEqual(report.availability,{
  uptimePercent:97.12,unknownPercent:8.89,notPassingPercent:2.22,observedMs:8339900,upMs:8099900,notPassingMs:240000,
  unknownMs:960100,windowMs:180*minute,pausedMs:15*minute,maintenanceMs:10*minute,
 },'full immutable coverage retains retry failures, the incomplete slot, maintenance, revision and pause boundaries');
 assert.equal(report.period.timeZone,'America/Chicago');
 assert.equal(report.sla.denominatorMs,report.availability.observedMs);
 assert.equal(report.sla.met,false);
 assert.deepEqual(report.latency.statistics,{count:278,minMs:50,meanMs:41650/278,p50Ms:100,p95Ms:200,p99Ms:200,maxMs:200});
 assert.deepEqual(report.incidents.map(incident=>[incident.key,incident.durationMs,incident.durationInPeriodMs]),[
  ['overlap',90000,30000],['outage',3*minute,3*minute],
 ],'incident overlap and total duration use durable transitions beyond the recent list');
 assert.equal((await (await get('uptime')).json()).availability.upMs,report.availability.upMs);
 const latency=await (await get('response-times')).json();
 assert.deepEqual(latency.statistics,report.latency.statistics);
 const oneLocation=new URLSearchParams(params);oneLocation.set('location','local-b');oneLocation.set('bucket','5m');
 const location=await (await get('response-times',oneLocation)).json();
 assert.deepEqual(location.statistics,{count:139,minMs:200,meanMs:200,p50Ms:200,p95Ms:200,p99Ms:200,maxMs:200});
 assert.ok(location.series.length<latency.series.length,'larger buckets aggregate samples');
 for(const bucket of ['raw','1h','1d']){
  const query=new URLSearchParams(params);query.set('bucket',bucket);
  const result=await (await get('response-times',query)).json();
  assert.deepEqual(result.statistics,report.latency.statistics,`${bucket} retains the exact sample statistics`);
  assert.equal(result.series.reduce((total,point)=>total+point.count,0),278);
 }
 const csvParams=new URLSearchParams(params);csvParams.set('format','csv');
 const exported=await get('report',csvParams,id,{accept:'text/csv'});
 assert.equal(exported.status,200);assert.match(exported.headers.get('content-type'),/text\/csv/);
 const csv=await exported.text();
 for(const [metric,value] of Object.entries(report.availability)){
  const row=csv.split('\r\n').find(line=>line.startsWith('availability,')&&line.split(',')[6]===metric);
  assert.ok(row,`CSV includes ${metric}`);assert.equal(row.split(',')[7],String(value));
 }
 const pdfParams=new URLSearchParams(params);pdfParams.set('format','pdf');
 assert.equal((await fetch(origin+path('report',pdfParams))).status,401,'PDF exports require the native owner session');
 const pdfResponse=await get('report',pdfParams);
 assert.equal(pdfResponse.status,200,await pdfResponse.clone().text());assert.match(pdfResponse.headers.get('content-type'),/application\/pdf/);
 const pdf=await PDFDocument.load(await pdfResponse.arrayBuffer());assert.ok(pdf.getPageCount()>1,'response-time history continues onto subsequent pages');assert.ok(pdf.getTitle().includes(report.monitor.name),'PDF metadata identifies the monitored service');
 const negotiated=await get('report',params,id,{accept:'application/pdf'});assert.equal(negotiated.status,200);assert.match(negotiated.headers.get('content-disposition'),/attachment/);
 const overviewResponse=await fetch(origin+'/api/overview',{headers:{cookie}});assert.equal(overviewResponse.status,200,await overviewResponse.clone().text());const overview=await overviewResponse.json();
 const sameWindow=new URLSearchParams({from:String(overview.now-day),to:String(overview.now)});
 const sameReport=await (await get('uptime',sameWindow)).json();
 assert.deepEqual(sameReport.availability,overview.monitors.find(monitor=>monitor.id===id).availability.last24h,'console and custom report use the same denominator and SQL');
 for(const period of ['24h','7d','30d','90d'])assert.equal((await get('uptime',new URLSearchParams({period}))).status,200);
 const local=new URLSearchParams({from:'2026-07-01T01:02:03.123',to:'2026-07-01T02:02:03.123'});
 assert.equal((await (await get('uptime',local)).json()).period.from,Date.parse('2026-07-01T06:02:03.123Z'));
 for(const invalid of [{from:String(end),to:String(from)},{period:'constructor'},{timeZone:'America/Unknown'},
  {from:'2026-03-08T02:30',to:'2026-03-08T04:00'},{from:'2025-11-02T01:30',to:'2025-11-02T03:00'}]){
  const query=new URLSearchParams(params);for(const [key,value] of Object.entries(invalid))query.set(key,value);
  assert.equal((await get('uptime',query)).status,400,'invalid periods, zones and DST ambiguity are refused');
 }
 assert.equal((await get('uptime',params,'missing-monitor')).status,404);

 // A period with 10,002 samples is allowed at a coarse resolution; raw data is
 // refused in full rather than returning an apparently complete first page.
 const capFrom=end-7*day,capDefinition=JSON.stringify({...definition,retries:0});
 await run([
  db.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind(capId,2,JSON.stringify(paused),end+minute,'{"state":"Unknown"}'),
  db.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind(capId),
  db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(capId,1,capDefinition,capFrom-minute),
  db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(capId,2,JSON.stringify(paused),end),
  db.prepare(`WITH RECURSIVE n(value) AS (SELECT 0 UNION ALL SELECT value+1 FROM n WHERE value<5000)
   INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual)
   SELECT ?||':'||value,?,1,?+value*60000,'complete',?,'fixture',0,0,0 FROM n`).bind(capId,capId,capFrom,capDefinition),
  ...definition.probes.map((probe,index)=>db.prepare(`INSERT INTO observations(id,slot_id,probe,attempt,evidence)
   SELECT id||':'||?,id,?,0,json_object('id',id||':'||?,'probe',?,'attempt',0,'outcome','pass',
    'startedAt',due_at,'completedAt',due_at+CAST(? AS INTEGER),'durationMs',CAST(? AS INTEGER),'runnerVersion','uptime-node/0.1.0')
   FROM slots WHERE monitor_id=?`).bind(probe,probe,probe,probe,(index+1)*100,(index+1)*100,capId)),
 ]);
 const capParams=new URLSearchParams({from:String(capFrom),to:String(end),bucket:'raw'});
 const refused=await get('response-times',capParams,capId);
 assert.equal(refused.status,400);assert.ok(!('series' in await refused.json()),'oversized data is refused without a partial series');
 capParams.set('bucket','1d');
 const coarse=await get('response-times',capParams,capId);
 assert.equal(coarse.status,200,await coarse.clone().text());assert.equal((await coarse.json()).statistics.count,10002);
 // Root-cause filtering changes the incident account, never coverage or SLA.
 const categorize=await fetch(origin+'/api/incidents/'+encodeURIComponent('outage:trigger')+'/root-cause',{method:'PATCH',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({version:0,categoryId:'hosting-provider',text:'Provider disk full'})});
 assert.equal(categorize.status,200,await categorize.clone().text());
 const categoryParams=new URLSearchParams(params);categoryParams.set('rootCause','hosting-provider');
 const filtered=await (await get('report',categoryParams)).json();
 assert.deepEqual(filtered.incidents.map(incident=>incident.key),['outage']);
 assert.deepEqual(filtered.availability,report.availability);assert.deepEqual(filtered.sla,report.sla);
 assert.equal(filtered.rootCauseGroups[0].durationInPeriodMs,3*minute);
 const filteredCsv=await (await get('report',categoryParams,id,{Accept:'text/csv'})).text();assert.ok(filteredCsv.includes('Provider disk full'));
 const incidentPage=async(query)=>{const response=await fetch(origin+'/api/v1/incidents?'+new URLSearchParams({monitor:id,limit:'1',...query}),{headers:{cookie}});assert.equal(response.status,200);return response.json()};
 const firstPage=await incidentPage({}),nextPage=await incidentPage({cursor:firstPage.nextCursor});assert.equal(firstPage.items.length,1);assert.equal(nextPage.items.length,1);assert.notEqual(firstPage.items[0].id,nextPage.items[0].id);
 const causePage=await incidentPage({rootCause:'hosting-provider'});assert.equal(causePage.items[0].id,'outage:trigger');assert.equal(causePage.nextCursor,null);
 assert.equal((await fetch(origin+'/api/v1/incidents?limit=101',{headers:{cookie}})).status,400);
 console.log('REPORT-001 / READAPI-001 passed: owner period reports, full immutable coverage and incident overlap, SLA denominator, exact CSV/API/console figures, location latency percentiles at every resolution, Chicago DST validation, and oversized raw-series refusal.');
}finally{
 await worker?.dispose();
 await rm(persist,{recursive:true,force:true});
}
