import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {inviteDoorMember} from './access-door-support.mjs';
import {definitionDoor} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
const day=86400000,sourceId='synthetic-uptime-201';
const iso=at=>new Date(at).toISOString();
const path='/api/definitions/history/';
export function historyClient(origin,cookie){
 return async(resource,body,method=body===undefined?'GET':'POST',session=cookie)=>{
  const response=await fetch(origin+(resource.startsWith('/api/')?resource:path+resource),{method,headers:{origin,cookie:session,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();return {status:response.status,body:result};
 };
}
export async function historyFixture({origin,cookie,db}){
 // Migration and history use the exact same source ID. Names are deliberately synthetic.
 await fetch(origin+'/api/overview',{headers:{origin,cookie}});
 const door=definitionDoor({origin,cookie});
 const view=await door.preview(JSON.stringify({data:[{id:sourceId,friendlyName:sourceId,type:'HTTP',url:'https://history.example.test/health',interval:86400,timeout:5,httpMethodType:'GET'}],nextLink:null}));
 assert.equal(view.status,200,JSON.stringify(view.body));const applied=await door.apply(view.body);assert.equal(applied.status,200,JSON.stringify(applied.body));
 const id=view.body.entries[0].monitorId;
 const end=Math.floor((Date.now()-day)/1000)*1000,from=end-90*day,cutover=from+60*day;
 const monitor=await db.prepare('SELECT * FROM monitors WHERE id=?').bind(id).first();
 const definition={...JSON.parse(monitor.definition),enabled:true};
 // Historical scheduled evidence cannot be manufactured through a product write door.
 // This fixture uses the same immutable slot/evidence schema as the existing reporting journey.
 await db.prepare('UPDATE monitors SET definition=? WHERE id=?').bind(JSON.stringify(definition),id).run();
 await db.prepare('UPDATE revisions SET definition=?,created_at=? WHERE monitor_id=? AND revision=?').bind(JSON.stringify(definition),from-day,id,monitor.revision).run();
 const statements=[];
 for(let i=0;i<30;i++){
  const at=cutover+i*day,slot=`${id}:history-proof:${i}`,observation={id:slot+':observation',probe:'local-a',attempt:0,startedAt:at,completedAt:at,durationMs:0,outcome:'pass',runnerVersion:'uptime-node/0.1.0',status:200,bytes:2,checks:[{assertion:'status',pass:true,reason:'Synthetic historical result'}]};
  statements.push(db.prepare('INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual) VALUES(?,?,?,?,?,?,?,0,0,0)').bind(slot,id,monitor.revision,at,'complete',JSON.stringify(definition),'synthetic-history-proof'));
  statements.push(db.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').bind(observation.id,slot,'local-a',0,JSON.stringify(observation)));
 }
 await db.batch(statements);
 const outages=[[from+10*day,73],[from+30*day,125],[from+50*day,3601]],events=[[from,'Up','',null],...outages.flatMap(([at,seconds])=>[[at,'Down','Synthetic source cause',seconds],[at+seconds*1000,'Up','',null]]),[cutover,'Up','',null]];
 const header='Monitor ID,Monitor,Date-Time,Event,Reason,Duration,Author,Comments,Exported At';
 const csv=header+'\n'+events.map(([at,event,reason,seconds])=>[sourceId,sourceId,iso(at),event,reason,seconds??'','Synthetic source author','Synthetic source comment',iso(end)].join(',')).join('\n')+'\n'+['synthetic-uptime-202','synthetic-uptime-202',iso(from),'Up','','','','',iso(end)].join(',')+'\n';
 const query=new URLSearchParams({period:'custom',from:String(from),to:String(end),timeZone:'UTC',bucket:'1d',sla:'99.9'});
 return {origin,cookie,db,id,from,end,cutover,csv,outages,query,client:historyClient(origin,cookie)};
}
export async function applyHistoryFixture(f){
 const preview=await f.client('preview',{text:f.csv});assert.equal(preview.status,200,JSON.stringify(preview.body));
 const applied=await f.client('apply',{text:f.csv,digest:preview.body.digest});assert.equal(applied.status,200,JSON.stringify(applied.body));
 return {preview:preview.body,applied:applied.body};
}
async function evidenceSnapshot(db){
 const tables=['monitors','revisions','slots','observations','outbox','incident_work','incident_comments','incident_timeline','notification_jobs','notification_delivery_attempts','alert_contact_schedules','alert_fallback_chains','integration_deliveries','attempt_checkpoints','evidence_generation'];
 return JSON.stringify(await Promise.all(tables.map(async name=>[name,(await db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()).results])));
}
async function seedNativeHistoryContext(f){
 const key='synthetic-uptime-native-204',triggerId=key+':trigger',jobId=key+':delivery',started=f.cutover+10*day;
 const row=await f.db.prepare('SELECT revision,definition FROM monitors WHERE id=?').bind(f.id).first();
 const definition=JSON.parse(row.definition),events=['trigger','recovery'].map((kind,i)=>({schemaVersion:2,id:key+':'+kind,kind,eventType:kind==='trigger'?'uptime.incident.firing':'uptime.incident.recovered',incidentKey:key,state:kind==='trigger'?'firing':'recovered',title:'synthetic-uptime-204',monitorId:f.id,monitorRevision:row.revision,monitorName:definition.name,url:definition.url,slotId:f.id+':history-proof:10',observedAt:started+i*100000,visibility:'private',evidenceRef:'/api/monitors/'+f.id+'/history',explanation:'Synthetic native incident',probes:[],consoleUrl:f.origin}));
 await f.db.batch([
  f.db.prepare('UPDATE monitors SET state=? WHERE id=?').bind(JSON.stringify({state:'Failing',confirmedFailure:true,notificationOpen:true,failureStreak:2,recoveryStreak:0,incidentKey:key}),f.id),
  ...events.map(event=>f.db.prepare('INSERT INTO outbox(id,monitor_id,slot_id,kind,event,status) VALUES(?,?,?,?,?,?)').bind(event.id,f.id,event.slotId,event.kind,JSON.stringify(event),'sent')),
  f.db.prepare('INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at,state,code,finished_at,attempts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(jobId,triggerId,'synthetic-uptime-205','synthetic-uptime-205','email','synthetic-uptime-205',JSON.stringify(events[0]),started,'accepted','mail_accepted',started,1),
  f.db.prepare('INSERT INTO alert_contact_schedules(trigger_job_id,monitor_id,incident_key,due_at,repeat_ms,max_repeats,emitted_repeats,next_at,recovery,stop_on_ack) VALUES(?,?,?,?,?,3,0,?,1,1)').bind(jobId,f.id,key,Date.now()+day,day,Date.now()+day),
 ]);
 const comment=await f.client('/api/incidents/'+encodeURIComponent(triggerId)+'/comments',{text:'Synthetic native comment'});assert.equal(comment.status,201,JSON.stringify(comment.body));
 const root=await f.client('/api/incidents/'+encodeURIComponent(triggerId)+'/root-cause',{version:0,categoryId:'hosting-provider',text:'Synthetic native root cause'},'PATCH');assert.equal(root.status,200,JSON.stringify(root.body));
}
export async function proveSourceHistory({origin,cookie,db}){
 const f=await historyFixture({origin,cookie,db});await seedNativeHistoryContext(f);
 const before=await evidenceSnapshot(db),read=async resource=>{const r=await f.client(resource);assert.equal(r.status,200,JSON.stringify(r.body));return r.body};
 const nativePath=`/api/v1/monitors/${encodeURIComponent(f.id)}/report?${f.query}`;
 const original=await read(nativePath);
 const nativeReads=async()=>JSON.stringify(await Promise.all([`/api/monitors/${f.id}/incidents`,`/api/monitors/${f.id}/history`,'/api/notifications'].map(read)));
 const beforeReads=await nativeReads();
 const reader=await inviteDoorMember(origin,cookie,'read-only','synthetic-uptime-history-reader');
 for(const resource of ['preview','apply'])assert.equal((await f.client(resource,{text:f.csv},'POST',reader.cookie)).status,403);
 const countBefore=await db.prepare('SELECT COUNT(*) n FROM source_history_rows').first();
 const preview=await f.client('preview',{text:f.csv});assert.equal(preview.status,200,JSON.stringify(preview.body));assert.deepEqual(await db.prepare('SELECT COUNT(*) n FROM source_history_rows').first(),countBefore,'preview stores no rows');
 assert.equal(preview.body.counts.unmapped,1);assert.equal(preview.body.mapping.find(m=>m.sourceMonitorId===sourceId).monitorId,f.id);assert.equal(preview.body.mapping.find(m=>m.sourceMonitorId==='synthetic-uptime-202').name,'synthetic-uptime-202');assert.equal(preview.body.mapping[0].outageCount,3);assert.equal(preview.body.mapping[0].totalDowntimeSeconds,3799);assert.equal(preview.body.mapping[0].sourceStatedDowntimeSeconds,3799);
 for(const bad of [f.csv.replace('Date-Time','Mystery date'),f.csv.replace(iso(f.from),'2026-02-30T00:00:00Z'),f.csv.replace(iso(f.from),'not-a-date')]){const refused=await f.client('preview',{text:bad});assert.equal(refused.status,400);assert.match(refused.body.error,/column|row|timestamp/i)}
 const many='Monitor ID,Date-Time,Event\n'+Array.from({length:5001},()=>`${sourceId},${iso(f.from)},Up`).join('\n');const capped=await f.client('preview',{text:many});assert.equal(capped.status,400);assert.match(capped.body.error,/5001.*5000/);
 assert.equal((await f.client('preview',{text:'x'.repeat(2*1024*1024+1)})).status,413);
 for(const resource of ['preview','apply'])assert.equal((await f.client(resource,{text:f.csv,digest:preview.body.digest},'POST','')).status,401);
 const stale=await f.client('apply',{text:f.csv+'\n',digest:preview.body.digest});assert.equal(stale.status,409);
 assert.equal(await evidenceSnapshot(db),before);
 const applied=await f.client('apply',{text:f.csv,digest:preview.body.digest});assert.equal(applied.status,200,JSON.stringify(applied.body));assert.equal(applied.body.addedRows,8);
 assert.equal(await evidenceSnapshot(db),before,'source imports do not alter state/quorum/recovery/incidents/notifications/follow-up or evidence');assert.equal(await nativeReads(),beforeReads,'native incident/slot/notification reads remain byte-identical');
 const repeated=await f.client('preview',{text:f.csv}),again=await f.client('apply',{text:f.csv,digest:repeated.body.digest});assert.equal(again.status,200);assert.equal(again.body.addedRows,0);assert.equal(again.body.batchId,null);
 const report=await read(nativePath);assert.deepEqual(report.availability,original.availability);assert.deepEqual(report.incidents,original.incidents);
 await assertHistoryReport(f,report);
 const perMonitor=f.csv.split('\n').filter(line=>!line.startsWith('synthetic-uptime-202')).map(line=>line.split(',').slice(1).join(',')).join('\n');const per=await f.client('preview',{text:perMonitor,sourceMonitorId:sourceId});assert.equal(per.status,200);assert.equal(per.body.mapping[0].monitorId,f.id);assert.equal(per.body.mapping[0].totalDowntimeSeconds,3799);
 const withoutCapture=f.csv.split('\n').map(line=>line.split(',').slice(0,-1).join(',')).join('\n');const missingCapture=await f.client('preview',{text:withoutCapture});assert.equal(missingCapture.status,200);const missingApply=await f.client('apply',{text:withoutCapture,digest:missingCapture.body.digest});assert.equal(missingApply.status,400);assert.match(missingApply.body.error,/extraction time/);
 const copy={...f,csv:f.csv.split('\n').filter(line=>!line.startsWith('synthetic-uptime-202')).join('\n')};const subset=await f.client('preview',{text:copy.csv}),subsetApply=await f.client('apply',{text:copy.csv,digest:subset.body.digest});assert.equal(subsetApply.body.addedRows,0,'per-monitor CSV does not duplicate an overall export');
 const sourceOnly=JSON.stringify({monitorId:sourceId,extractedAt:iso(f.end),responseTimes:{time_series:[{timestamp:iso(f.end-day),value:321}]} ,coverageFrom:iso(f.from-20*day),coverageTo:iso(f.end)});
 const rp=await f.client('preview',{text:sourceOnly}),ra=await f.client('apply',{text:sourceOnly,digest:rp.body.digest});assert.equal(ra.status,200);
 const responseOnlyReport=await read(nativePath);assert.equal(responseOnlyReport.sourceHistory.segments[0].denominatorMs,report.sourceHistory.segments[0].denominatorMs,'response samples cannot invent availability coverage');
 assert.equal((await f.client('batches/'+ra.body.batchId,undefined,'DELETE')).status,200);
 // Saved v3 detail capture includes source comments and source-author text, plus published response time samples.
 const incidentStart=f.cutover+day,incidentEnd=incidentStart+91*1000;
 const json=JSON.stringify({monitorId:sourceId,monitorName:sourceId,extractedAt:iso(f.end),coverageFrom:iso(f.from),coverageTo:iso(f.end),incidents:{data:[{id:'synthetic-uptime-203',monitor:{id:sourceId,friendlyName:sourceId},startedAt:iso(incidentStart),resolvedAt:iso(incidentEnd),duration:91,includeInReports:true,rootCause:'Synthetic upstream failure',comments:[{id:1,comment:'Synthetic comment',created:iso(incidentEnd),user:{id:1,fullName:'Synthetic source author'}}]}],nextLink:null},responseTimes:{time_series:[{timestamp:iso(incidentStart),value:123}]}});
 const jp=await f.client('preview',{text:json});assert.equal(jp.status,200,JSON.stringify(jp.body));const ja=await f.client('apply',{text:json,digest:jp.body.digest});assert.equal(ja.status,200,JSON.stringify(ja.body));assert.equal(ja.body.addedRows,2);
 const overlap=await read(nativePath);assert.equal(overlap.sourceHistory.sourceIncidents.length,4);assert.equal(overlap.sourceHistory.blended.notPassingMs,3799000,'post-cutover source downtime stays outside blended figure');assert.equal(overlap.sourceHistory.sourceResponseTimes[0].responseMs,123);assert.match(overlap.sourceHistory.sourceIncidents.at(-1).comments,/Synthetic source author/);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM oa_operators WHERE display_name=?').bind('Synthetic source author').first()).n,0);
 const sourceTimes=await read(`/api/v1/monitors/${encodeURIComponent(f.id)}/response-times?${f.query}`);assert.equal(sourceTimes.sourceSamples[0].responseMs,123);assert.equal(sourceTimes.sourceSamples[0].label,'source: UptimeRobot');
 const originalDigest=overlap.sourceHistory.blended.denominatorMs;
 const changed=await f.client('cutover/'+encodeURIComponent(f.id),{cutoverAt:iso(f.cutover+2*day)});assert.equal(changed.status,200,JSON.stringify(changed.body));
 const adjusted=await read(nativePath);assert.equal(adjusted.sourceHistory.blended.notPassingMs,(3799+91)*1000);assert.equal(adjusted.sourceHistory.blended.denominatorMs,originalDigest);
 assert.equal((await f.client('cutover/'+encodeURIComponent(f.id),{cutoverAt:iso(f.from)})).status,400);
 const removal=await cli(['scripts/definitions.mjs','history-remove','--batch',ja.body.batchId,'--origin',origin,'--json'],{UPTIME_SESSION_COOKIE:cookie});assert.equal(removal.code,0,removal.error);const removed=JSON.parse(removal.output);assert.deepEqual(removed.counts,{source_history_rows:2,source_history_batches:1});assert.equal((await db.prepare('SELECT COUNT(*) n FROM source_history_rows WHERE batch_id=?').bind(applied.body.batchId).first()).n,8);
 assert.equal(await evidenceSnapshot(db),before,'batch removal and cutover do not touch monitoring evidence');
 const disk=await mkdtemp(join(tmpdir(),'uptime-history-cli-'));
 try{
  const input=join(disk,'source.csv');await writeFile(input,f.csv);
  for(const command of [['preview','--input',input],['apply','--input',input,'--digest',(await f.client('preview',{text:f.csv})).body.digest],['history-batches'],['history-cutover','--monitor',f.id,'--at',iso(f.cutover)]]){
   const args=['scripts/definitions.mjs',...command,'--origin',origin,'--json'];const result=await cli(args,{UPTIME_SESSION_COOKIE:cookie});assert.equal(result.code,0,result.error);const output=JSON.parse(result.output);if(command[0]==='preview')assert.equal(output.kind,'history');if(command[0]==='apply')assert.equal(output.addedRows,0);
  }
 }finally{await rm(disk,{recursive:true,force:true})}
 return {...f,batchId:applied.body.batchId};
}
async function cli(args,extra){
 const child=spawn(process.execPath,args,{env:{...process.env,...extra},stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);const code=await new Promise(resolve=>child.once('close',resolve));return {code,output,error};
}
export async function assertHistoryReport(f,report){
 const h=report.sourceHistory;assert.ok(h);assert.equal(h.cutover.at,f.cutover);assert.equal(h.segments[0].label,'source: UptimeRobot');assert.equal(h.segments[0].denominatorMs,60*day);assert.equal(h.segments[0].notPassingMs,3799000);assert.equal(h.uptimeSegment.denominatorMs,30*day);assert.equal(h.blended.denominatorMs,90*day);assert.equal(h.blended.label,'blended: UptimeRobot + Uptime');assert.equal(h.blended.uptimePercent,100*(90*day-3799000)/(90*day));assert.deepEqual(h.sourceIncidents.map(i=>i.durationSeconds),[73,125,3601]);assert.ok(h.sourceIncidents.every(i=>i.label==='source: UptimeRobot'));assert.ok(h.provenance.every(p=>/^[a-f0-9]{64}$/.test(p.fileDigest)&&p.batchId));
 const read=async format=>{const response=await fetch(f.origin+`/api/v1/monitors/${encodeURIComponent(f.id)}/report?${f.query}&format=${format}`,{headers:{cookie:f.cookie}});assert.equal(response.status,200);return response};
 const csv=await(await read('csv')).text();assert.match(csv,/source: UptimeRobot,.*denominatorMs,5184000000/);assert.match(csv,/blended: UptimeRobot \+ Uptime/);assert.match(csv,/durationSeconds,73,seconds/);assert.match(csv,/durationSeconds,3601,seconds/);
 const bulkQuery=new URLSearchParams(f.query);bulkQuery.delete('bucket');
 const bulk=await f.client('/api/v1/uptime?'+bulkQuery+'&monitor='+encodeURIComponent(f.id));assert.equal(bulk.status,200,JSON.stringify(bulk.body));assert.deepEqual(bulk.body.monitors[0].sourceHistory,h);
 const bulkCsv=await fetch(f.origin+'/api/v1/uptime?'+bulkQuery+'&monitor='+encodeURIComponent(f.id)+'&format=csv',{headers:{cookie:f.cookie}});assert.equal(bulkCsv.status,200);assert.match(await bulkCsv.text(),/source: UptimeRobot/);
 const pdf=await read('pdf');assert.match(pdf.headers.get('content-type'),/pdf/);assert.ok((await pdf.arrayBuffer()).byteLength>1000);
}
// Existing definition registration also proves an additive migration against populated pre-upgrade tables.
export async function proveHistoryUpgrade(db){
 const snapshot=async()=>{const names=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'source_history_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results.map(r=>r.name);return JSON.stringify(await Promise.all(names.map(async name=>[name,(await db.prepare(`SELECT * FROM \"${name}\" ORDER BY rowid`).all()).results])))};
 const rows=await snapshot();
 for(const table of ['source_history_rows','source_history_batches','source_history_cutovers'])await db.prepare(`DROP TABLE ${table}`).run();
 const name=(await readdir('migrations')).find(name=>name.endsWith('_source_history.sql'));
 for(const sql of splitSql(await readFile(join('migrations',name),'utf8')))await db.prepare(sql).run();
 assert.equal(await snapshot(),rows,'populated upgrade keeps every existing product and authority table byte-identical');
}
export async function proveHistoryErasure({origin,cookie,db}){
 const f=await historyFixture({origin,cookie,db}),{applied}=await applyHistoryFixture(f);
 const cutover=await f.client('cutover/'+encodeURIComponent(f.id),{cutoverAt:iso(f.cutover)});assert.equal(cutover.status,200,JSON.stringify(cutover.body));
 const result=await f.client('/api/monitors/'+encodeURIComponent(f.id)+'/erase',{name:sourceId});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.erased,true);
 assert.equal(result.body.receipt.counts.source_history_rows,8);assert.equal(result.body.receipt.counts.source_history_batches,1);assert.equal(result.body.receipt.counts.source_history_cutovers,1);
 for(const table of ['source_history_rows','source_history_batches','source_history_cutovers'])assert.equal((await db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE monitor_id=?`).bind(f.id).first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM source_history_rows WHERE batch_id=?').bind(applied.batchId).first()).n,0);
}
export async function seedArchiveHistory({origin,cookie,db}){
 const from=Math.floor((Date.now()-60*day)/1000)*1000,to=from+73*1000;
 const csv=`Monitor ID,Date-Time,Event,Author,Comments,Exported At\n1,${iso(from)},Down,Synthetic source author,Synthetic source comment,${iso(to)}\n1,${iso(to)},Up,,,${iso(to)}\n`;
 const client=historyClient(origin,cookie),preview=await client('preview',{text:csv});assert.equal(preview.status,200,JSON.stringify(preview.body));assert.equal(preview.body.counts.create,2);
 const applied=await client('apply',{text:csv,digest:preview.body.digest});assert.equal(applied.status,200,JSON.stringify(applied.body));assert.equal(applied.body.addedRows,2);
 return applied.body;
}
