import {historyFixture,applyHistoryFixture,assertHistoryReport} from './source-history-support.mjs';
// Owner-session READAPI journey through the real emitted Worker and durable D1.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {signInOwner} from './auth-test-support.mjs';
import {inviteDoorMember} from './access-door-support.mjs';
import {metricsFixture} from './metrics-fixture.mjs';
import {proveReadKeys,proveCredentialArchive} from './read-keys-support.mjs';

function csvRows(text){
 const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(char==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted}
  else if(char===','&&!quoted){row.push(value);value=''}
  else if(char==='\r'&&text[i+1]==='\n'&&!quoted){row.push(value);rows.push(row);row=[];value='';i++}
  else value+=char;
 }
 assert.equal(quoted,false,'CSV quoting is complete');
 return rows.map((row,index)=>index?Object.fromEntries(rows[0].map((name,column)=>[name,row[column]])):row).slice(1);
}

const wall=(at,zone)=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));

const directory=await runtimeDirectory();let worker;
try{
 const [port]=await availablePorts(1);
 ({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
 const origin='http://127.0.0.1:'+port,db=await worker.getD1Database('DB'),cookie=await signInOwner(origin);
 const read=(path,extra={})=>fetch(origin+path,{headers:{cookie,...extra}});
 const json=async path=>{const response=await read(path);assert.equal(response.status,200,await response.clone().text());return response.json()};
 await proveCredentialArchive({origin,cookie});
 const sourceFixture=await historyFixture({origin,cookie,db});await applyHistoryFixture(sourceFixture);const sourceRead=await json('/api/v1/monitors/'+sourceFixture.id+'/report?'+sourceFixture.query);await assertHistoryReport(sourceFixture,sourceRead);
 const sourceErase=await fetch(origin+'/api/monitors/'+sourceFixture.id+'/erase',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({name:'synthetic-uptime-201'})});assert.equal(sourceErase.status,200);

 const {ids,from,to}=await metricsFixture(db,origin);
 const preferredZone='America/Los_Angeles';
 assert.equal((await fetch(origin+'/api/notifications/preferences',{method:'PATCH',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({timeZone:preferredZone})})).status,200);
 assert.equal((await json('/api/v1/uptime?period=last-month')).period.timeZone,preferredZone);
 assert.equal((await json('/api/v1/monitors/'+ids[0]+'/uptime?period=last-month&bucket=1d')).period.timeZone,preferredZone);
 const firstId=ids[0],secondId=ids[1],thirdId=ids[2];
 // Labels and a spreadsheet-looking name are durable fixture definitions;
 // reads still use all real projection/report/CSV paths.
 for(const id of ids){const row=await db.prepare('SELECT definition FROM monitors WHERE id=?').bind(id).first();const definition=JSON.parse(row.definition);definition.tags=id===thirdId?['internal']:['customer'];if(id===firstId)definition.name='=SUM(1,2)';await db.prepare('UPDATE monitors SET definition=? WHERE id=?').bind(JSON.stringify(definition),id).run()}
 for(const path of ['/api/v1/monitors','/api/v1/monitors/'+firstId,'/api/v1/uptime','/api/v1/incidents'])assert.equal((await fetch(origin+path)).status,401);

 const seen=[],pages=[];let cursor=null;
 do{
  const page=await json('/api/v1/monitors?'+new URLSearchParams({limit:'1',...(cursor?{cursor}:{})}));
  assert.equal(page.items.length,1);seen.push(page.items[0].id);pages.push(page);cursor=page.nextCursor;
 }while(cursor);
 assert.deepEqual(seen,[...ids].sort());assert.equal(new Set(seen).size,ids.length);
 assert.deepEqual((await json('/api/v1/monitors?'+new URLSearchParams({limit:'1',cursor:pages[0].nextCursor}))).items.map(row=>row.id),pages[1].items.map(row=>row.id));
 const selected=await json('/api/v1/monitors?tag=customer');assert.deepEqual(selected.items.map(row=>row.id),[firstId,secondId].sort());
 const detail=await json('/api/v1/monitors/'+firstId);
 assert.equal(detail.id,firstId);assert.equal(detail.current.state,'Unknown');assert.equal(detail.current.coverage.expected,2);assert.ok(detail.current.lastCheckAt);assert.equal(detail.current.coverage.observed,0);
 assert.ok(!JSON.stringify(detail).includes('shop.example.test'),'monitor summaries disclose no target URL');
 assert.equal((await read('/api/v1/monitors/missing-monitor')).status,404);
 const head=await fetch(origin+'/api/v1/monitors/'+firstId,{method:'HEAD',headers:{cookie}});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await read('/api/v1/monitors?limit=101')).status,400);

 const query=new URLSearchParams({period:'custom',from:String(from),to:String(to),timeZone:'America/Chicago'});
 const bulk=await json('/api/v1/uptime?'+query);
 assert.deepEqual(bulk.monitors.map(row=>row.monitor.id),[...ids].sort());
 for(const row of bulk.monitors){
  const report=await json('/api/v1/monitors/'+row.monitor.id+'/report?'+query+'&bucket=1d');
  assert.deepEqual(row.availability,report.availability);assert.equal(row.slow.slowMs,report.slow.slowMs);assert.deepEqual(row.incidentSummary,report.incidentSummary);assert.equal(row.denominatorPolicy,report.denominatorPolicy);
  for(const [key,metric] of Object.entries({observed:'observedMs',up:'upMs',down:'notPassingMs',unknown:'unknownMs',paused:'pausedMs',maintenance:'maintenanceMs'}))assert.equal(row.seconds[key],report.availability[metric]/1000);
 }
 const restricted=await json('/api/v1/uptime?'+query+'&monitor='+encodeURIComponent(firstId+','+secondId));assert.equal(restricted.monitors.length,2);
 assert.equal((await json('/api/v1/uptime?'+query+'&tag=internal')).monitors[0].monitor.id,thirdId);
 for(const monitors of [firstId+','+firstId,firstId+',missing-monitor',Array.from({length:501},(_,i)=>'missing-'+i).join(',')]){
  const response=await read('/api/v1/uptime?'+query+'&monitor='+encodeURIComponent(monitors));assert.equal(response.status,monitors.includes('missing-monitor')?404:400);assert.ok(!('monitors' in await response.json()),'an invalid selection never yields a successful subset');
 }
 const csvResponse=await read('/api/v1/uptime?'+query,{accept:'text/csv'});assert.equal(csvResponse.status,200);assert.match(csvResponse.headers.get('content-type'),/text\/csv/);
 const csv=csvRows(await csvResponse.text());
 for(const row of bulk.monitors){const exported=csv.find(value=>value.monitor_id===row.monitor.id);assert.equal(Number(exported.observed_seconds),row.seconds.observed);assert.equal(Number(exported.down_seconds),row.seconds.down);assert.equal(Number(exported.slow_seconds),row.seconds.slow)}
 assert.equal(csv.find(row=>row.monitor_id===firstId).monitor_name,"'=SUM(1,2)");

 const incident=(await json('/api/v1/incidents?'+new URLSearchParams({monitor:firstId,from:String(from),to:String(to)}))).items[0];
 const rootText='=SUM(1,2)\n"quoted account"';
 const categorized=await fetch(origin+'/api/incidents/'+encodeURIComponent(incident.id)+'/root-cause',{method:'PATCH',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({version:0,categoryId:'hosting-provider',text:rootText})});assert.equal(categorized.status,200);
 const incidentParams=new URLSearchParams({from:String(from),to:String(to),tag:'customer',rootCause:'hosting-provider',state:'resolved',limit:'1'});
 const incidentPage=await json('/api/v1/incidents?'+incidentParams);assert.deepEqual(incidentPage.items.map(row=>row.id),[incident.id]);
 const incidentExport=await read('/api/v1/incidents?'+incidentParams,{accept:'text/csv'});assert.equal(incidentExport.status,200);assert.match(incidentExport.headers.get('content-type'),/text\/csv/);
 const exported=csvRows(await incidentExport.text());assert.equal(exported.length,1);assert.equal(exported[0].id,incident.id);assert.equal(exported[0].root_cause,"'"+rootText);assert.equal(Number(exported[0].duration_seconds),incident.durationSeconds);
 const incidentCsvPage=await read('/api/v1/incidents?limit=1',{accept:'text/csv'});assert.equal(incidentCsvPage.status,200);assert.ok(incidentCsvPage.headers.get('x-next-cursor'),'CSV exposes the same next cursor as JSON');
 const nextCsvPage=await read('/api/v1/incidents?'+new URLSearchParams({limit:'1',cursor:incidentCsvPage.headers.get('x-next-cursor')}),{accept:'text/csv'});assert.notEqual(csvRows(await incidentCsvPage.text())[0].id,csvRows(await nextCsvPage.text())[0].id);

 // The API resolves calendar boundaries in the selected IANA zone. Compare
 // its named range to the exact same custom range through the report door.
 for(const timeZone of ['America/Chicago','America/Santiago'])for(const period of ['mtd','qtd','ytd','last-month']){
  const response=await json('/api/v1/uptime?'+new URLSearchParams({monitor:firstId,period,timeZone}));
  const range=response.period,start=wall(range.from,timeZone),current=wall(response.generatedAt,timeZone);
  const expectedMonth=period==='ytd'?1:period==='qtd'?Math.floor((current.month-1)/3)*3+1:period==='last-month'?(current.month===1?12:current.month-1):current.month;
  assert.equal(start.year,period==='last-month'&&current.month===1?current.year-1:current.year);assert.equal(start.month,expectedMonth);assert.equal(start.day,1);
  assert.equal(wall(range.from-1,timeZone).month,expectedMonth===1?12:expectedMonth-1,'calendar starts at the earliest instant of its local month');
  if(period==='last-month'){const end=wall(range.to,timeZone);assert.equal(end.month,current.month);assert.equal(end.day,1);assert.equal(wall(range.to-1,timeZone).month,expectedMonth)}else assert.equal(range.to,response.generatedAt);
  const custom=await json('/api/v1/monitors/'+firstId+'/uptime?'+new URLSearchParams({from:String(range.from),to:String(range.to),timeZone,bucket:'1d'}));assert.deepEqual(response.monitors[0].availability,custom.availability);
 }
 assert.equal((await read('/api/v1/uptime?period=ytd&from='+from+'&to='+to)).status,400);
 assert.equal((await read('/api/v1/uptime?period=last-month&timeZone=America/Unknown')).status,400);
 // A complete Chicago day crossing November's fall-back has 25 hours. Use a
 // past year so this stays a valid request regardless of the test's run date.
 const priorYear=new Date().getUTCFullYear()-1,novemberSunday=1+(7-new Date(Date.UTC(priorYear,10,1)).getUTCDay())%7;
 const novemberDay=day=>`${priorYear}-11-${String(day).padStart(2,'0')}T00:00:00`;
 const fallBack=await json('/api/v1/uptime?'+new URLSearchParams({monitor:firstId,timeZone:'America/Chicago',from:novemberDay(novemberSunday),to:novemberDay(novemberSunday+1)}));
 assert.equal(fallBack.period.to-fallBack.period.from,25*3600000);assert.equal(fallBack.monitors[0].availability.windowMs,25*3600000);
 const longRange=new URLSearchParams({from:String(from-91*86400000),to:String(to),bucket:'1d'});
 const tooLong=await read('/api/v1/monitors/'+firstId+'/response-times?'+longRange);assert.equal(tooLong.status,400);assert.ok(!('series' in await tooLong.json()),'over-90-day response times are refused without a partial series');
 // A read-only role is still a live Base member. A service scope admits only
 // the single-monitor report door; workspace/bulk APIs never silently widen it.
 const scoped=JSON.parse((await db.prepare('SELECT definition FROM monitors WHERE id=?').bind(firstId).first()).definition);scoped.service='synthetic-report-service';
 await db.prepare('UPDATE monitors SET definition=? WHERE id=?').bind(JSON.stringify(scoped),firstId).run();
 const reader=await inviteDoorMember(origin,cookie,'read-only','readapi-reader',[{kind:'service',value:'synthetic-report-service'}]);
 const memberRead=path=>fetch(origin+path,{headers:{cookie:reader.cookie}});
 const permittedReport=await memberRead('/api/v1/monitors/'+firstId+'/report?'+query);assert.equal(permittedReport.status,200);assert.deepEqual((await permittedReport.json()).availability,(await json('/api/v1/monitors/'+firstId+'/report?'+query)).availability);
 const permittedCsv=await memberRead('/api/v1/monitors/'+firstId+'/report?'+query+'&format=csv');assert.equal(permittedCsv.status,200);assert.match(permittedCsv.headers.get('content-type'),/text\/csv/);
 for(const path of ['/api/v1/monitors','/api/v1/uptime','/api/v1/monitors/'+secondId+'/report','/api/archive'])assert.equal((await memberRead(path)).status,403);
 for(const method of ['POST','PATCH','DELETE'])assert.equal((await fetch(origin+'/api/monitors/'+firstId,{method,headers:{cookie:reader.cookie,origin,'content-type':'application/json'},...(method==='DELETE'?{}:{body:'{}'})})).status,403);
 assert.ok((await db.prepare("SELECT COUNT(*) n FROM uptime_audit WHERE actor_ref=? AND action='access_read'").bind(reader.id).first()).n>0,'scoped CSV export retains its actor without request values');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM attempt_checkpoints').first()).n,0,'monitoring reads do not checkpoint or mutate evidence');
 await proveReadKeys({origin,db,cookie,ids,from,to});
 console.log('READAPI-001/002/003 subset passed: owner monitor cursors/current coverage, exact bulk/report figures and seconds, filtered paginated incident CSV, spreadsheet escaping, and zoned calendar periods. Monitoring keys use live owner issuance and fresh second-factor proof.');
}finally{
 await worker?.dispose();await cleanupDirectory(directory);
}
