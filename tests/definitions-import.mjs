// IMPORT-001: definition files and UptimeRobot imports through the owner's import door, the move-in screen's transport.
// A preview writes no native record; hostile, malformed, stale, cross-origin and unauthenticated requests leave every
// native table byte-identical; apply is exactly the reviewed plan, creates paused monitors and touches no destination,
// heartbeat or notification; export round-trips; undo pauses or restores without removing history, and keeps and reports
// a monitor edited since; apply and undo keep a heartbeat's live token. Request secrets are withheld before upload and are
// in no table, import custody included, after a preview, a refusal, an apply or a cancel.
// MIGRATE-001 shares this journey: accepted status sets/ranges and both keyword conditions survive every door.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,finishSetup,definitionDoor} from './auth-test-support.mjs';
import {inviteDoorMember} from './access-door-support.mjs';
import {populateArchiveFixture} from './archive-fixture.mjs';
import {typeScriptDefinitionsProof} from './definitions-typescript-support.mjs';
import {proveDefinitionCI} from './definitions-ci-support.mjs';

const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
const savedRobot=await readFile('tests/fixtures/uptimerobot-v3-monitors.synthetic.json');
const robotMonitor={type:'HTTP',url:'https://migration.example.test/',interval:300,timeout:5,httpMethodType:'GET'};
const migrationCases=[
 {...robotMonitor,friendlyName:'Status set',successHttpResponseCodes:['200',201,'204','206-208','3xx']},
 {...robotMonitor,friendlyName:'Default accepted statuses'},
 {...robotMonitor,friendlyName:'Case-insensitive absence',type:'KEYWORD',keywordType:'ALERT_EXISTS',keywordValue:'Internal error',keywordCaseType:'CaseInsensitive',successHttpResponseCodes:['200-299']},
 {...robotMonitor,friendlyName:'Unmapped response codes',successHttpResponseCodes:['200','unknown']},
 {...robotMonitor,friendlyName:'Reversed response range',successHttpResponseCodes:['299-200']},
];
const uptimeRobot=Buffer.concat([savedRobot,Buffer.from('\n'+JSON.stringify({data:migrationCases,nextLink:null}))]);
const uptimeRobotLog=await readFile('tests/fixtures/uptimerobot-logs.synthetic.csv');
const file=monitors=>JSON.stringify({format:'uptime.monitors',version:1,monitors});
let worker;
try{
 let DB;({worker,DB}=await migratedWorker({port,persist:join(directory,'local'),bindings:{UPTIME_ORIGIN:origin}}));
 const call=authRequest(origin);
 const cookie=sessionCookie(await call('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Import owner'}));
 // A self-hosted install has no Run Edit Run trust, so RER's signed reads do not exist.
 for(const path of ['/api/rer/runner-status','/api/rer/cutover-status'])assert.equal((await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer x.y.z'},body:JSON.stringify({since:new Date().toISOString()})})).status,404,path);
 await finishSetup(origin,cookie);
 // The owner opens the console first, which establishes the installation's runner; an import never creates one.
 assert.equal((await fetch(origin+'/api/overview',{headers:{origin,cookie}})).status,200);
 await populateArchiveFixture({...testAuthBindings,UPTIME_ORIGIN:origin,DB});
 const send=(path,body,{type='application/json',headers={},method='POST'}={})=>fetch(origin+path,{method,headers:{origin,cookie,...(body===undefined?{}:{'content-type':type}),...headers},body});
 const json=async response=>({status:response.status,body:await response.json()});
 // Every native table, every row, in storage order. The door's own custody (ik_*) and request admission counts are not
 // the installation's product state: a plan keeps its upload and snapshot there until it is applied, cancelled or erased.
 async function scan(){
  const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'ik_%' AND name NOT IN ('_cf_METADATA','public_rate_limits') ORDER BY name").all()).results.map(r=>r.name);
  const rows=[];
  for(let offset=0;offset<names.length;offset+=32){
   const chunk=names.slice(offset,offset+32),results=await DB.batch(chunk.map(name=>DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`)));
   rows.push(...chunk.map((name,index)=>[name,results[index].results]));
  }
  return Object.fromEntries(rows);
 }
 const unchanged=async(label,attempt)=>{const before=await scan(),result=await attempt();assert.deepEqual(await scan(),before,`${label} leaves the installation byte-identical`);return result};
 // Every table, every row, the door's own custody (ik_*) included: what a secret-bearing file may never leave behind.
 async function scanAll(){
  const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA' ORDER BY name").all()).results.map(r=>r.name);
  const rows=[];
  for(let offset=0;offset<names.length;offset+=32){const chunk=names.slice(offset,offset+32),results=await DB.batch(chunk.map(name=>DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`)));rows.push(...chunk.map((name,index)=>[name,results[index].results]))}
  return Object.fromEntries(rows);
 }
 const untouched=async(label,attempt)=>{const before=await scanAll(),result=await attempt();assert.deepEqual(await scanAll(),before,`${label} leaves every table, import custody included, byte-identical`);return result};
 // Every stored value as text, with base64 runs (an upload, a retained original inside a plan) and bytes decoded.
 async function storedText(){
  const parts=[],visit=value=>{
   if(typeof value==='string'){parts.push(value);for(const run of value.match(/[A-Za-z0-9+/]{16,}={0,2}/g)??[])parts.push(Buffer.from(run,'base64').toString('latin1'))}
   else if(Array.isArray(value)&&value.length&&value.every(item=>typeof item==='number'))parts.push(Buffer.from(value).toString('latin1'));
   else if(value instanceof ArrayBuffer)parts.push(Buffer.from(value).toString('latin1'));
   else if(ArrayBuffer.isView(value))parts.push(Buffer.from(value.buffer,value.byteOffset,value.byteLength).toString('latin1'));
   else if(value&&typeof value==='object')Object.values(value).forEach(visit);
  };
  visit(await scanAll());return parts.join('\n');
 }
 const noSecrets=async(label,secrets)=>{const text=await storedText();for(const secret of secrets)assert.ok(!text.includes(secret),`${label}: “${secret}” is in no table`)};
 const imports=definitionDoor({origin,cookie}),preview=(text,source)=>imports.preview(text,source),apply=(view,fingerprint)=>imports.apply(view,fingerprint),undo=batch=>imports.undo(batch);

 // Refusals at the door.
 const valid=file([{name:'Door check',url:'https://door.example.test/'}]);
 await unchanged('an oversized file',async()=>assert.equal((await send('/api/definitions/recognise',`{"format":"uptime.monitors","version":1,"monitors":[],"pad":"${'x'.repeat(2*1024*1024)}"}`)).status,413));
 await unchanged('malformed JSON',async()=>{const r=await preview('{"format":"uptime.monitors","version":1,"monitors":[');assert.equal(r.status,400);assert.match(r.body.error,/not valid JSON/)});
 await unchanged('non-UTF-8 bytes',async()=>assert.equal((await send('/api/definitions/recognise',new Uint8Array([0x7b,0xff,0xfe,0x7d]))).status,400));
 await unchanged('the wrong file type',async()=>{for(const [text,source] of [[uptimeRobot,'uptime.monitors'],['[1,2,3]','auto'],['{"monitors":[]}','uptimerobot']]){const r=await preview(text,source);assert.equal(r.status,400,source);assert.ok(r.body.error)}});
 await unchanged('too many monitors',async()=>{const r=await preview(file(Array.from({length:501},(_,i)=>({name:`m${i}`,url:'https://example.test/'}))));assert.equal(r.status,400);assert.match(r.body.error,/501 monitors/)});
 const hostile=file([{name:'Private address',url:'http://10.0.0.8/'},{name:'Userinfo',url:'https://admin@intranet.example.test/'},{name:'Credential in URL',url:'https://user:secret@example.test/'},{name:'Not HTTP',url:'ftp://files.example.test/'},{name:'Loopback',url:'http://127.0.0.1:9/'},
  {name:'Header secret',url:'https://example.test/',headers:{authorization:'Bearer secret'}},{name:'Body secret',url:'https://example.test/',body:'password=secret'},{name:'Unknown field',url:'https://example.test/',assignments:{}},
  {name:'Header assertion secret',url:'https://example.test/',assertions:{header:{name:'x-a',equals:'b',authorization:'Bearer secret'}}},{name:'JSON assertion secret',url:'https://example.test/',assertions:{json:{path:'a',equals:1,token:'password=secret'}}},
  {name:'Key query',url:'https://example.test/status?api_key=up'}]);
 // A preview with nothing to apply is cancelled at once: every table, import custody included, is as it was.
 await untouched('hostile and secret-bearing entries',async()=>{
  const r=await preview(hostile);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.counts.refused,11);assert.equal(r.body.counts.create,0);
  for(const entry of r.body.entries)assert.match(entry.reason,/^Entry \d+ \(/,'each refusal names its entry');
  assert.match(r.body.entries[8].reason,/“authorization”/);assert.match(r.body.entries[9].reason,/“token”/);
  // A query parameter whose name names a credential by its whole parts refuses that entry alone, with its reason.
  assert.match(r.body.entries[10].reason,/^Entry 11 \(“Key query”\): its URL has a query parameter named “api_key”, which names a credential; an import treats that as a credential and never stores it\./);
  assert.ok(!JSON.stringify(r.body).includes('Bearer secret')&&!JSON.stringify(r.body).includes('password=secret'),'request secrets are never echoed');
  assert.equal(r.body.counts.create+r.body.counts.change,0,'the preview offers nothing to apply');
  await noSecrets('after a refused preview',['Bearer secret','password=secret','user:secret']);
 });
 await unchanged('duplicate names in a preview',async()=>{const r=await preview(file([{name:'Twice',url:'https://a.example.test/'},{name:'Twice',url:'https://b.example.test/'}]));assert.deepEqual([r.body.entries[0].action,r.body.entries[1].action],['create','refused']);assert.match(r.body.entries[1].reason,/Entry 2 \(“Twice”\): duplicate name; Entry 1 \(“Twice”\)/)});
 const doorCall=(view,step,body,headers={})=>fetch(origin+'/api/operator/import/'+step,{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-import-source':view.namespace,...headers},body:JSON.stringify(body)});
 await unchanged('a cross-origin apply',async()=>{const view=(await preview(valid)).body;for(const headers of [{origin:'https://attacker.example.test'},{'sec-fetch-site':'cross-site'}])assert.equal((await doorCall(view,'apply',{planId:view.planId,reviewedFingerprint:view.digest},headers)).status,403)});
 await unchanged('requests without an owner session',async()=>{const view=(await preview(valid)).body;
  for(const path of ['/api/definitions/recognise','/api/definitions/batches/x/undo'])assert.equal((await fetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:valid})).status,401);
  assert.equal((await fetch(origin+'/api/operator/import/apply',{method:'POST',headers:{origin,'content-type':'application/json','x-import-source':view.namespace},body:JSON.stringify({planId:view.planId,reviewedFingerprint:view.digest})})).status,401);
  for(const path of ['/api/definitions/export','/api/definitions/plans/'+view.planId])assert.equal((await fetch(origin+path)).status,401)});
 await unchanged('a CSV log export',async()=>{const r=await preview(uptimeRobotLog);assert.equal(r.status,200);assert.equal(r.body.kind,'history');assert.equal(r.body.rows,3);assert.equal(r.body.stored,false);assert.equal(r.body.counts,undefined,'a log export offers nothing to apply')});
 const stalePreview=(await preview(valid)).body;
 await DB.prepare("INSERT INTO monitors VALUES('elsewhere',1,?,0,'{\"state\":\"Unknown\"}')").bind(JSON.stringify({name:'Door check',type:'http',network:'public',url:'https://elsewhere.example.test/',method:'GET',probes:['local-a'],assertions:{status:200},intervalMs:60000,timeoutMs:2000,retries:1,failureQuorum:1,confirmSlots:2,recoverSlots:2,freshnessMs:180000,enabled:false,maintenanceUntil:0})).run();
 await unchanged('a plan the installation changed under',async()=>{const r=await apply(stalePreview);assert.equal(r.status,409);assert.match(r.body.error,/^import_door_apply/)});
 await DB.prepare("DELETE FROM monitors WHERE id='elsewhere'").run();

 // UptimeRobot import: counts first, then exactly the preview, paused, nothing else touched.
 const imported=await unchanged('an UptimeRobot preview',()=>preview(uptimeRobot));
 assert.deepEqual(imported.body.counts,{create:9,unchanged:0,change:0,refused:2,unsupported:6});
 assert.deepEqual(imported.body.outcomes,{importable:0,withDifferences:9,unsupported:6,refused:2});
 const before=await scan(),applied=await apply(imported.body);assert.equal(applied.status,200);assert.equal(applied.body.created.length,9);
 assert.equal(applied.body.report.ok,true,'the installation holds exactly the reviewed plan');assert.equal(applied.body.report.fingerprint,imported.body.digest,'apply uses the reviewed plan');
 const after=await scan();
 for(const table of ['notification_destinations','notification_credentials','notification_jobs','outbox','slots','observations','heartbeat_authority','integration_deliveries'])assert.deepEqual(after[table],before[table],`import does not touch ${table}`);
 const created=after.monitors.filter(m=>applied.body.created.includes(m.id)).map(m=>JSON.parse(m.definition));
 assert.equal(created.length,9);assert.ok(created.every(d=>d.enabled===false),'imported monitors arrive paused');
 assert.equal(created.find(d=>d.name==='Partner API').request.credentialRef,'uptimerobot-9000009');assert.equal(created.find(d=>d.name==='Nightly backup').type,'heartbeat');
 const expectedAssertions={
  'Shop home':{status:200},
  'Docs':{status:['2xx','3xx']},
  'Checkout keyword':{status:['2xx','3xx'],bodyIncludes:'Add to cart'},
  'Error banner absent':{status:['2xx','3xx'],bodyExcludes:'Internal error'},
  'Status set':{status:[200,201,204,'206-208','3xx']},
  'Default accepted statuses':{status:['2xx','3xx']},
  'Case-insensitive absence':{status:['200-299'],bodyExcludes:'Internal error'},
 };
 const readImported=async()=>Promise.all(applied.body.created.map(async id=>{
  const read=await json(await send(`/api/monitors/${id}/revisions`,undefined,{method:'GET'}));assert.equal(read.status,200);return read.body[0].definition;
 }));
 for(const definition of await readImported()){
  assert.equal(definition.enabled,false,'the owner reads every migrated monitor paused');
  if(expectedAssertions[definition.name])assert.deepEqual(definition.assertions,expectedAssertions[definition.name],`${definition.name} keeps the complete accepted responses and keyword condition`);
  const reviewed=imported.body.entries.find(entry=>entry.name===definition.name);assert.deepEqual(definition.assertions,reviewed.target.assertions,'apply preserves the reviewed check criteria');
 }
 for(const name of ['Checkout keyword','Case-insensitive absence'])assert.ok(imported.body.entries.find(entry=>entry.name===name).differences.some(d=>/ignoring case/.test(d)),'case-insensitive conditions name their semantic difference');
 const currentPreview=await unchanged('the same source after apply',()=>preview(uptimeRobot));
 assert.equal(currentPreview.body.counts.unchanged,9,'the same source previews as unchanged after apply');
 const changedSource=Buffer.from(uptimeRobot.toString().replace('206-208','206-209'));
 const changedCodes=await unchanged('a changed status-range preview',()=>preview(changedSource));
 assert.equal(changedCodes.body.counts.change,1,'changing the accepted set is a real monitor change');
 assert.notEqual(changedCodes.body.digest,currentPreview.body.digest,'accepted status ranges contribute to the review digest');
 await unchanged('a fingerprint with changed status semantics',async()=>assert.equal((await apply(changedCodes.body,currentPreview.body.digest)).status,403));
 await unchanged('a second apply of the same preview',async()=>{const again=await apply(imported.body);assert.equal(again.status,200);assert.equal(again.body.job.id,applied.body.job.id,'it answers the completed import and writes nothing')});
 // Daily heartbeat migration preserves the expected period and grace as separate settings.
 const daily=await unchanged('a daily UptimeRobot heartbeat preview',()=>preview(JSON.stringify({data:[{id:1,friendlyName:'Daily export',type:'HEARTBEAT',interval:86400,gracePeriod:300}],nextLink:null})));
 assert.equal(daily.body.entries[0].action,'create');assert.deepEqual(daily.body.entries[0].target.heartbeat,{maxAgeMs:86400000,graceMs:300000,maxRunDurationMs:0,outputMasks:[]},'the preview preserves the whole period and grace');

 // Export round-trips: the exported file previews as all unchanged.
 const exported=await json(await send('/api/definitions/export',undefined,{method:'GET'}));
 assert.equal(exported.status,200);assert.equal(exported.body.monitors.length,10);
 for(const [name,assertions] of Object.entries(expectedAssertions))assert.deepEqual(exported.body.monitors.find(m=>m.name===name).assertions,assertions,'export preserves migrated assertions');
 const roundTrip=await unchanged('previewing the exported file',()=>preview(JSON.stringify(exported.body)));
 assert.deepEqual(roundTrip.body.counts,{create:0,unchanged:10,change:0,refused:0,unsupported:0});

 // A change keeps the monitor's paused state and history; undo restores the earlier settings, history intact.
 const fixtureMonitor=(await DB.prepare("SELECT definition FROM monitors WHERE id='monitor'").first()).definition;
 assert.equal((await json(await send('/api/monitors/monitor',JSON.stringify({...JSON.parse(fixtureMonitor),enabled:false}),{method:'PATCH'}))).status,200);
 const history=async()=>Object.fromEntries(await Promise.all(['slots','observations','outbox','archive_history'].map(async t=>[t,(await DB.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results])));
 const historyBefore=await history();
 const edited=structuredClone(exported.body);edited.monitors.find(m=>m.name==='Archive health').url='https://example.test/moved';edited.monitors.find(m=>m.name==='Archive health').enabled=true;
 const changePreview=await preview(JSON.stringify(edited));assert.deepEqual(changePreview.body.counts,{create:0,unchanged:9,change:1,refused:0,unsupported:0});
 const change=changePreview.body.entries.find(e=>e.action==='change');assert.deepEqual(change.changes.map(c=>c.field),['url']);assert.match(change.differences[0],/stays paused/);
 const changed=await apply(changePreview.body);assert.equal(changed.status,200,JSON.stringify(changed.body));
 const moved=JSON.parse((await DB.prepare("SELECT definition FROM monitors WHERE id='monitor'").first()).definition);assert.equal(moved.url,'https://example.test/moved');assert.equal(moved.enabled,false);
 const undone=await undo(changed.body);
 assert.equal(undone.status,200);assert.equal(undone.body.job.state,'undone');
 assert.deepEqual((await json(await send('/api/definitions/batches',undefined,{method:'GET'}))).body.find(b=>b.id===changed.body.batchId).entries.map(e=>e.undoOutcome),['restored']);
 const restored=JSON.parse((await DB.prepare("SELECT definition FROM monitors WHERE id='monitor'").first()).definition);assert.equal(restored.url,'https://example.test/health');assert.equal(restored.enabled,false);
 assert.deepEqual(await history(),historyBefore,'apply and undo never remove or rewrite history');
 await unchanged('undoing a batch again',async()=>assert.equal((await undo(changed.body)).body.job.state,'undone','a batch is undone once'));

 // Undo pauses what a batch created, and reports a monitor edited since instead of overriding it.
 // An ?api_key= URL in the file refuses that entry alone; the rest previews and applies, a ?keyword= URL among them (its
 // name only contains “key”). An imported monitor the owner later points at an ?api_key= URL is edited since, and kept,
 // like any other edit.
 const pair=file([{name:'Undo kept',url:'https://kept.example.test/status?keyword=up'},{name:'Undo edited',url:'https://edited.example.test/'},{name:'Undo keyword refused',url:'https://refused.example.test/status?api_key=up'},{name:'Undo keyword edited',url:'https://keyword.example.test/'}]);
 const pairView=(await preview(pair)).body;
 assert.deepEqual(pairView.entries.map(e=>e.action),['create','create','refused','create']);assert.match(pairView.entries[2].reason,/^Entry 3 \(“Undo keyword refused”\): its URL has a query parameter named “api_key”/);
 const pairBatch=(await apply(pairView)).body;assert.equal(pairBatch.job.state,'completed');assert.equal(pairBatch.created.length,3);
 const editedId=pairBatch.created[1],editedDefinition=JSON.parse((await DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(editedId).first()).definition);
 assert.equal((await json(await send(`/api/monitors/${editedId}`,JSON.stringify({...editedDefinition,timeoutMs:3000}),{method:'PATCH'}))).status,200);
 const keywordId=pairBatch.created[2],keywordDefinition=JSON.parse((await DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(keywordId).first()).definition);
 assert.equal((await json(await send(`/api/monitors/${keywordId}`,JSON.stringify({...keywordDefinition,url:'https://keyword.example.test/status?api_key=up'}),{method:'PATCH'}))).status,200);
 const pairUndo=await undo(pairBatch);
 assert.equal(pairUndo.status,200);assert.equal(pairUndo.body.job.state,'undone');
 assert.equal(JSON.parse((await DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(editedId).first()).definition).timeoutMs,3000,'the edit is kept');
 assert.equal(JSON.parse((await DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(keywordId).first()).definition).url,'https://keyword.example.test/status?api_key=up','the ?api_key= edit is kept');
 const batches=(await json(await send('/api/definitions/batches',undefined,{method:'GET'}))).body;
 assert.deepEqual(batches.find(b=>b.id===pairBatch.batchId).entries.map(e=>[e.name,e.undoOutcome]),[['Undo kept','paused'],['Undo edited','edited-since'],['Undo keyword edited','edited-since']]);
 assert.deepEqual([pairBatch.batchId,changed.body.batchId,applied.body.batchId].map(id=>batches.find(b=>b.id===id).undoneAt!==null),[true,true,false],'each undone batch keeps its undo time');
 const migrationUndo=await undo(applied.body);
 assert.equal(migrationUndo.status,200);assert.equal(migrationUndo.body.job.state,'undone');
 const migrationEntries=(await json(await send('/api/definitions/batches',undefined,{method:'GET'}))).body.find(b=>b.id===applied.body.batchId).entries;
 assert.equal(migrationEntries.length,9);assert.ok(migrationEntries.every(e=>e.action==='create'&&e.undoOutcome==='paused'));
 for(const definition of await readImported()){
  assert.equal(definition.enabled,false,'undo keeps the migrated monitor paused');
  if(expectedAssertions[definition.name])assert.deepEqual(definition.assertions,expectedAssertions[definition.name],'undo preserves the imported assertions and history');
 }
 // A file that changes a live heartbeat, and its undo, keep the token the owner's jobs use.
 const heartbeat=await json(await send('/api/monitors',JSON.stringify({name:'Nightly job',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:600000}})));assert.equal(heartbeat.status,201);
 const token=(await json(await send(`/api/monitors/${heartbeat.body.id}/heartbeat-key`,'{}'))).body.token;let sequence=0;
 const ping=async()=>(await fetch(`${origin}/api/heartbeats/${heartbeat.body.id}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`,'x-heartbeat-sequence':String(++sequence)},body:'{}'})).status;
 assert.equal(await ping(),200);
 const longer=file([{name:'Nightly job',type:'heartbeat',heartbeat:{maxAgeMs:900000}}]),longerPreview=(await preview(longer)).body;
 assert.equal(longerPreview.entries[0].action,'change');assert.deepEqual(longerPreview.entries[0].differences,[]);
 const longerBatch=(await apply(longerPreview)).body;assert.equal(await ping(),200,'a pinged heartbeat keeps its token across apply');
 assert.equal((await undo(longerBatch)).status,200);assert.equal(await ping(),200,'and across undo');
 const toHttp=(await preview(file([{name:'Nightly job',url:'https://job.example.test/'}]))).body.entries[0];assert.equal(toHttp.action,'change');assert.equal(toHttp.differences.length,1,'the preview says when the token would be retired');
 // A batch the importer wrote before the import door keeps its read and its undo, beside the door's imports.
 const legacyDefinition=JSON.stringify({name:'Legacy import',type:'http',network:'public',url:'https://legacy.example.test/',method:'GET',probes:['local-a'],assertions:{status:200},intervalMs:60000,timeoutMs:2000,retries:1,failureQuorum:1,confirmSlots:2,recoverSlots:2,freshnessMs:180000,enabled:false,maintenanceUntil:0});
 await DB.batch([DB.prepare("INSERT INTO monitors VALUES('legacy-import',1,?,0,'{\"state\":\"Unknown\"}')").bind(legacyDefinition),DB.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind('legacy-import',1,legacyDefinition,Date.now()),
  DB.prepare("INSERT INTO definition_batches(id,created_at,actor_kind,actor_ref,source,plan_digest,counts) VALUES('legacy-batch',?,'feature','local-cli','uptime.monitors',?,?)").bind(Date.now(),'0'.repeat(64),JSON.stringify({create:1,unchanged:0,change:0,refused:0,unsupported:0})),
  DB.prepare("INSERT INTO definition_batch_entries(batch_id,monitor_id,action,revision,previous_revision) VALUES('legacy-batch','legacy-import','create',1,NULL)")]);
 const listed=(await json(await send('/api/definitions/batches',undefined,{method:'GET'}))).body;
 assert.ok(listed.some(b=>b.id==='legacy-batch')&&listed.some(b=>b.businessApproval?.via==='owner'),'one history lists the earlier batch and door imports');
 const legacyUndo=await json(await send('/api/definitions/batches/legacy-batch/undo','{}'));assert.equal(legacyUndo.status,200);assert.deepEqual(legacyUndo.body.outcomes.map(o=>o.outcome),['paused']);
 // Request secrets never become import data. Recognising a file withholds them, the screen uploads that text, and an
 // upload still carrying one is refused and withdrawn; none is in any table after a preview, an apply or a cancel.
 const secret=name=>`${name}-${crypto.randomUUID().slice(0,8)}`,secrets=['ur-password','ur-header','ur-body','pd-password','pd-header','pd-post'].map(secret);
 const securedRobot=JSON.stringify({data:[{id:41,friendlyName:'Secured robot',type:'HTTP',url:'https://secured.example.test/health',interval:300,timeout:5,httpMethodType:'POST',successHttpResponseCodes:['200'],
  authType:'BASIC',httpUsername:'robot-user',httpPassword:secrets[0],customHttpHeaders:{'x-api-key':secrets[1]},postValueData:secrets[2]}],nextLink:null});
 const securedPingdom=JSON.stringify({check:{id:88,name:'Secured pingdom',hostname:'pingdom.example.test',resolution:5,
  type:{http:{encryption:true,verify_certificate:true,url:'/health',username:'pingdom-user',password:secrets[3],requestheaders:{'x-api-key':secrets[4]},postdata:secrets[5]}}}});
 const recognised=await json(await send('/api/definitions/recognise',securedRobot));
 assert.equal(recognised.body.source,'uptimerobot');assert.ok(secrets.slice(0,3).every(value=>!recognised.body.text.includes(value)),'recognising withholds the secrets');
 await untouched('an upload still carrying request secrets',async()=>{
  const raw=Buffer.from(JSON.stringify(securedRobot)+'\n'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const refused=await imports.door('uptimerobot','uploads',{name:'raw.ndjson',bundleSha256:hash(raw),totalBytes:raw.length,totalChunks:1,index:0,chunkSha256:hash(raw),base64:raw.toString('base64')});
  assert.equal(refused.status,400);assert.equal(refused.body.error,'source_secrets_withheld');
 });
 const securedView=(await preview(securedRobot)).body,securedEntry=securedView.entries.find(e=>e.name==='Secured robot');
 assert.equal(securedEntry.action,'create');assert.equal(securedEntry.target.credentialRef,'uptimerobot-41');assert.ok(securedEntry.differences.some(d=>/authentication, custom request headers, the request body were not imported/.test(d)));
 await noSecrets('after an UptimeRobot preview',secrets);
 assert.equal((await imports.door(securedView.namespace,'undo',{planId:securedView.planId})).body.state,'cancelled');
 assert.equal((await DB.prepare("SELECT COUNT(*) n FROM ik_door_uploads u WHERE namespace=? AND NOT EXISTS(SELECT 1 FROM ik_door_plans p WHERE p.namespace=u.namespace AND p.bundle_sha256=u.bundle_sha256)").bind(securedView.namespace).first()).n,0,'a cancelled preview leaves no upload');
 await noSecrets('after a cancel',secrets);
 const pingdomView=(await preview(securedPingdom)).body;
 assert.equal(pingdomView.entries[0].action,'create');assert.equal(pingdomView.entries[0].target.credentialRef,'pingdom-88');
 await noSecrets('after a Pingdom preview',secrets);
 const pingdomBatch=await apply(pingdomView);assert.equal(pingdomBatch.status,200);assert.equal(pingdomBatch.body.report.ok,true);
 assert.deepEqual(JSON.parse((await DB.prepare("SELECT definition FROM monitors WHERE json_extract(definition,'$.name')='Secured pingdom'").first()).definition).request,{credentialRef:'pingdom-88'});
 await noSecrets('after an apply',secrets);
 // DEPENDENCY-002: an incumbent's third-party service monitors map onto catalog entries through the same reviewed door, paused and not
 // yet checked live. UptimeRobot has no third-party monitor type, so there a followed provider is a monitor of its status address;
 // Better Stack and Site24x7 monitors of a status address map the same way. Site24x7 StatusIQ third-party components map by their
 // published service id and the component's name. A Better Stack status page's ThirdPartyService row names no vendor in Better
 // Stack's public API, so it is refused with that documentation's address. One monitor follows each catalog part.
 const followedRows=async()=>(await DB.prepare("SELECT f.entry_id,f.scope,f.component_key,f.checked_at,json_extract(m.definition,'$.enabled') enabled,json_extract(m.definition,'$.service') service FROM followed_services f JOIN monitors m ON m.id=f.monitor_id ORDER BY f.entry_id,f.scope,f.component_key").all()).results;
 assert.deepEqual(await followedRows(),[],'no followed service before the catalog mappings');
 const robotPage=monitors=>JSON.stringify({data:monitors.map((m,i)=>({id:9100+i,type:'HTTP',interval:300,timeout:5,httpMethodType:'GET',successHttpResponseCodes:['200'],...m})),nextLink:null});
 const robotCatalog=(await preview(robotPage([{friendlyName:'Stripe status',url:'https://status.stripe.com/current'},{friendlyName:'AWS us-east-1 EC2',url:'https://status.aws.amazon.com/rss/ec2-us-east-1.rss'},{friendlyName:'Acme Cloud status',url:'https://status.synthetic-uptime-1.example/'}]))).body;
 assert.deepEqual(robotCatalog.entries.map(e=>e.action),['create','create','create']);
 assert.deepEqual(robotCatalog.entries.map(e=>e.target.service),['Stripe','AWS',null],'mapped entries carry the provider attribution; the unmatched status page stays an ordinary proposal');
 assert.equal(robotCatalog.entries[0].target.url,'https://status.stripe.com/current','a mapped service reads the catalog source');
 assert.equal((await apply(robotCatalog)).status,200);
 const parts=rows=>rows.map(r=>[r.entry_id,r.scope,r.component_key,r.enabled,r.checked_at]);
 assert.deepEqual(parts(await followedRows()),[['aws','component','ec2-us-east-1',0,null],['stripe','whole',null,0,null]],'Stripe and AWS us-east-1 EC2 are followed services, paused and not yet checked live');
 const betterStack=[{data:[{id:'7001',type:'monitor',attributes:{pronounceable_name:'GitHub status',url:'https://www.githubstatus.com/',monitor_type:'status',check_frequency:180}},{id:'7002',type:'monitor',attributes:{pronounceable_name:'Our shop',url:'https://shop.synthetic-uptime-2.example/',monitor_type:'status',check_frequency:60}}],pagination:{next:null}},
  {data:[{id:'7101',type:'status_page_resource',attributes:{status_page_section_id:1,resource_id:9001,resource_type:'ThirdPartyService',public_name:'Stripe',explanation:null,position:0}}],pagination:{next:null}}].map(page=>JSON.stringify(page)).join('\n');
 const betterView=(await preview(betterStack)).body;assert.equal(betterView.source,'betterstack-heartbeats');
 assert.deepEqual(betterView.entries.map(e=>e.action),['create','unsupported','refused']);assert.equal(betterView.entries[0].target.service,'GitHub');
 assert.ok(betterView.entries[2].reason.includes('https://betterstack.com/docs/uptime/api/get-a-single-status-page-resource/'),'a third-party status page row is refused, citing the public API that names no vendor');
 assert.equal((await apply(betterView)).status,200);
 const site24x7=[{code:0,message:'success',data:[{monitor_id:'3001',display_name:'Slack status',type:'URL',website:'https://slack-status.com/api/v2.0.0/current'},{monitor_id:'3002',display_name:'Our AWS account',type:'AWSHEALTH'},{monitor_id:'3003',display_name:'Our shop',type:'URL',website:'https://shop.synthetic-uptime-2.example/'}]},
  {code:0,message:'success',data:{thirdparty_service_id:27,thirdparty_service_display_name:'Stripe',thirdparty_components:[{thirdparty_component_id:'synthetic-uptime-3',thirdparty_component_display_name:'API'}]}},
  {code:0,message:'success',data:{thirdparty_service_id:1,thirdparty_service_display_name:'Amazon Web Services (AWS)',thirdparty_components:[{thirdparty_component_id:'synthetic-uptime-4',thirdparty_component_display_name:'Amazon Elastic Compute Cloud (Ohio)'},{thirdparty_component_id:'synthetic-uptime-5',thirdparty_component_display_name:'Amazon Elastic Compute Cloud (N. Virginia)'}]}},
  {code:0,message:'success',data:{thirdparty_service_id:28,thirdparty_service_display_name:'Github',thirdparty_components:[{thirdparty_component_id:'synthetic-uptime-6',thirdparty_component_display_name:'Actions'}]}},
  {code:0,message:'success',data:{thirdparty_service_id:9,thirdparty_service_display_name:'Zoho-US',thirdparty_components:[{thirdparty_component_id:'synthetic-uptime-7',thirdparty_component_display_name:'Zoho CRM'}]}}].map(page=>JSON.stringify(page)).join('\n');
 const siteView=(await preview(site24x7)).body;assert.equal(siteView.source,'site24x7');
 // Slack's status address and StatusIQ's Stripe API and AWS Ohio EC2 map; an AWS Health monitor, a GitHub component (followed by an id only a
 // live check reads), a provider the catalog lacks and a part already followed are refused; an ordinary monitor is unsupported.
 assert.deepEqual(siteView.entries.map(e=>e.action),['create','refused','unsupported','create','create','refused','refused','refused']);
 assert.deepEqual(siteView.entries.filter(e=>e.action==='create').map(e=>e.target.service),['Slack','Stripe','AWS']);
 assert.equal((await apply(siteView)).status,200);
 assert.deepEqual(parts(await followedRows()),[['aws','component','ec2-us-east-1',0,null],['aws','component','ec2-us-east-2',0,null],['github','whole',null,0,null],['slack','whole',null,0,null],['stripe','component','api',0,null],['stripe','whole',null,0,null]],'every mapped third-party monitor is a followed service of its own catalog part');
 // Product roles and scopes never turn the owner import transport into a
 // workspace-wide member door. Refused calls leave every durable row exact.
 for(const role of ['admin','editor','responder','read-only']){
  const member=await inviteDoorMember(origin,cookie,role,'definitions-'+role,role==='editor'?[{kind:'service',value:'synthetic-import-scope'}]:[]);
  await unchanged(role+' import refusal',async()=>{const response=await fetch(origin+'/api/operator/import/upload',{method:'POST',headers:{origin,cookie:member.cookie,'content-type':'application/json','x-import-source':'uptime.monitors'},body:'{}'});assert.equal(response.status,403)});
  if(role!=='admin')await unchanged(role+' export refusal',async()=>assert.equal((await fetch(origin+'/api/definitions/export',{headers:{cookie:member.cookie}})).status,403));
 }
 const actor=(await (await call('/auth/session',undefined,{cookie})).json()).operator.id;
 const auditCount=async()=>Number((await DB.prepare("SELECT COUNT(*) n FROM uptime_audit WHERE action='access_export' AND actor_ref=?").bind(actor).first()).n),priorAudit=await auditCount();
 assert.equal((await fetch(origin+'/api/definitions/export?unexpected=1',{headers:{cookie}})).status,400);assert.equal(await auditCount(),priorAudit,'invalid export writes no authorization audit');
 assert.equal((await fetch(origin+'/api/definitions/export',{headers:{cookie}})).status,200);assert.equal(await auditCount(),priorAudit+1,'permitted definition export records one opaque live actor receipt');
 const typed=await typeScriptDefinitionsProof({directory,preview});
 await proveDefinitionCI({directory,origin,cookie,DB,typed});
 console.log('IMPORT-001 / MIGRATE-001 passed through the import door: refusals leave every table byte-identical; request secrets are withheld before upload and stored nowhere; UptimeRobot preview, paused apply, export round-trip, change, undo that keeps and reports edits, with history intact, and earlier batches keep read and undo. DEPENDENCY-002 passed: UptimeRobot, Better Stack and Site24x7 third-party service monitors map onto catalog entries as paused followed services, a Better Stack third-party status page row is refused citing its public API, and a part already followed is refused.');
 // MIGRATE-004 saved monitor settings: the same Definitions door, in a fresh installation namespace.
 await worker.dispose();({worker}=await migratedWorker({port,persist:join(directory,'site24x7'),bindings:{UPTIME_ORIGIN:origin}}));
 {
  const owner=sessionCookie(await authRequest(origin)('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Synthetic Site24x7 owner'}));await finishSetup(origin,owner);
  const get=async path=>{const response=await fetch(origin+path,{headers:{origin,cookie:owner}});assert.equal(response.status,200);return response.json()};await get('/api/overview');
  const door=definitionDoor({origin,cookie:owner}),saved=await readFile('tests/fixtures/site24x7-monitors.synthetic.json'),before=await get('/api/overview'),plan=await door.preview(saved);
  assert.equal(plan.status,200,JSON.stringify(plan.body));assert.equal(plan.body.source,'site24x7');
  assert.deepEqual(plan.body.counts,{create:5,unchanged:0,change:0,refused:2,unsupported:5});assert.equal(plan.body.entries.length,12);
  assert.equal((await get('/api/overview')).monitors.length,before.monitors.length,'preview creates no monitor');
  const names=['synthetic-uptime-1','synthetic-uptime-2','synthetic-uptime-3','synthetic-uptime-4','synthetic-uptime-5'];
  for(const entry of plan.body.entries.slice(0,5)){assert.equal(entry.action,'create',entry.reason);assert.ok(entry.differences.some(d=>d.includes('timeout')));assert.ok(entry.differences.some(d=>d.includes('local-a')))}
  for(const [index,clause] of [[7,'FLOW-001'],[8,'TLS-001'],[9,'DOMAIN-001'],[10,'HEARTBEAT-002'],[11,'DNS-001']])assert.ok(plan.body.entries[index].reason.includes(clause));
  assert.ok(plan.body.entries[0].differences.some(d=>d.includes('location_profile_id')));
  const applied=await door.apply(plan.body);assert.equal(applied.status,200,JSON.stringify(applied.body));assert.equal(applied.body.created.length,5);
  const rows=(await get('/api/overview')).monitors.filter(m=>names.includes(m.definition.name)),defs=names.map(name=>rows.find(m=>m.definition.name===name).definition);
  assert.equal(rows.length,5);assert.ok(defs.every(d=>d.enabled===false&&d.intervalMs===300000));
  assert.deepEqual(defs.map(d=>d.type),['http','http','tcp','ping','dns']);
  assert.equal(defs[0].url,'https://synthetic-uptime-1.example/');assert.equal(defs[0].method,'GET');assert.deepEqual(defs[0].assertions.status,['200-299']);
  assert.equal(defs[1].method,'HEAD');assert.deepEqual(defs[1].assertions.status,[200,204]);
  assert.deepEqual(defs[2].tcp,{host:'synthetic-uptime-3.example',port:443});
  assert.deepEqual(defs[3].ping,{host:'synthetic-uptime-4.example',family:4,packets:3,maxLossPercent:0,maxRttMs:1000});
  assert.deepEqual(defs[4].dns,{name:'synthetic-uptime-5.example',recordType:'A',resolvers:['cloudflare']});
  assert.equal((await door.apply(plan.body)).status,200,'re-applying the reviewed batch is idempotent');
  const again=await door.preview(saved);assert.equal(again.status,200);assert.deepEqual(again.body.counts,{create:0,unchanged:5,change:0,refused:2,unsupported:5});
  assert.equal((await door.undo(applied.body)).status,200);assert.equal((await get('/api/overview')).monitors.length,before.monitors.length+5);assert.ok((await get('/api/overview')).monitors.every(m=>!m.definition.enabled));
  console.log('MIGRATE-004 saved list: read 12 = converted 5 + refused 2 + unsupported 5; paused apply, unchanged re-import and retained-history undo.');
 }
 // MIGRATE-003 saved monitor pages preserve each supported check through the Definitions door.
 await worker.dispose();({worker,DB}=await migratedWorker({port,persist:join(directory,'betterstack-monitors'),bindings:{UPTIME_ORIGIN:origin}}));
 {
  const owner=sessionCookie(await authRequest(origin)('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Synthetic Better Stack owner'}));await finishSetup(origin,owner);
  const get=async path=>{const response=await fetch(origin+path,{headers:{origin,cookie:owner}});assert.equal(response.status,200);return response.json()};await get('/api/overview');
  const door=definitionDoor({origin,cookie:owner}),saved=await readFile('tests/fixtures/betterstack-monitors.synthetic.json'),plan=await door.preview(saved);
  assert.equal(plan.status,200,JSON.stringify(plan.body));assert.equal(plan.body.source,'betterstack-monitors');assert.deepEqual(plan.body.counts,{create:7,unchanged:0,change:0,refused:1,unsupported:4});assert.equal(plan.body.entries.length,12);
  assert.equal((await get('/api/overview')).monitors.length,0);await noSecrets('Better Stack preview',['synthetic-uptime-98','synthetic-uptime-99']);
  for(const entry of plan.body.entries.slice(0,6)){assert.equal(entry.action,'create',entry.reason);for(const region of ['us','eu'])assert.ok(entry.differences.some(d=>d.includes(`Region ${region}`)));assert.ok(entry.differences.some(d=>d.includes('Group 31')))}
  for(const [index,clause] of [[7,'FLOW-001'],[8,'UDP-001'],[9,'DNS-001'],[11,'API-002']])assert.ok(plan.body.entries[index].reason.includes(clause));
  assert.equal(plan.body.entries[6].target.service,'GitHub','provider status addresses still use the catalog');
  const applied=await door.apply(plan.body);assert.equal(applied.status,200,JSON.stringify(applied.body));assert.equal(applied.body.created.length,7);
  const rows=(await get('/api/overview')).monitors,defs=Array.from({length:7},(_,i)=>rows.find(m=>m.definition.name===`synthetic-uptime-${i+1}`).definition);
  assert.deepEqual(defs.map(d=>d.type),['http','keyword','keyword','ping','tcp','http','http']);assert.ok(defs.every(d=>!d.enabled));
  for(const d of defs.slice(0,6)){assert.equal(d.intervalMs,60000);assert.equal(d.group,'Better Stack group 31');assert.deepEqual(d.tags,['betterstack-region:us','betterstack-region:eu'])}
  assert.deepEqual(defs[0].assertions.status,['2xx']);assert.equal(defs[0].method,'GET');assert.equal(defs[0].timeoutMs,5000);
  assert.equal(defs[1].assertions.bodyIncludes,'ready');assert.equal(defs[2].assertions.bodyExcludes,'error');
  assert.deepEqual(defs[3].ping,{host:'synthetic-uptime-4.example',family:4,packets:3,maxLossPercent:0,maxRttMs:1000});assert.equal(defs[3].timeoutMs,8000);
  assert.deepEqual(defs[4].tcp,{host:'synthetic-uptime-5.example',port:443});assert.equal(defs[4].timeoutMs,3000);assert.deepEqual(defs[5].assertions.status,[201,204]);
  assert.equal(defs[6].catalog.entry,'github');
  const again=await door.preview(saved);assert.equal(again.status,200);assert.deepEqual(again.body.counts,{create:0,unchanged:7,change:0,refused:1,unsupported:4});
  assert.equal((await door.apply(plan.body)).status,200);assert.equal((await door.undo(applied.body)).status,200);assert.equal((await get('/api/overview')).monitors.length,7);assert.ok((await get('/api/overview')).monitors.every(m=>!m.definition.enabled));
  await noSecrets('Better Stack apply and undo',['synthetic-uptime-98','synthetic-uptime-99']);
  console.log('MIGRATE-003 saved monitors: read 12 = converted 7 + refused 1 + unsupported 4; groups/regions labelled, paused apply, unchanged re-import and retained-history undo.');
 }
 // MIGRATE-002 saved check details reconcile tags, geographic filters and TMS checks.
 await worker.dispose();({worker,DB}=await migratedWorker({port,persist:join(directory,'pingdom-details'),bindings:{UPTIME_ORIGIN:origin}}));
 {
  const owner=sessionCookie(await authRequest(origin)('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Synthetic Pingdom owner'}));await finishSetup(origin,owner);
  const get=async path=>{const response=await fetch(origin+path,{headers:{origin,cookie:owner}});assert.equal(response.status,200);return response.json()};await get('/api/overview');
  const door=definitionDoor({origin,cookie:owner}),saved=await readFile('tests/fixtures/pingdom-checks.synthetic.json'),plan=await door.preview(saved);
  assert.equal(plan.status,200,JSON.stringify(plan.body));assert.equal(plan.body.source,'pingdom');assert.deepEqual(plan.body.counts,{create:1,unchanged:0,change:0,refused:3,unsupported:3});assert.equal(plan.body.entries.length,7);assert.equal((await get('/api/overview')).monitors.length,0);
  for(const filter of ['region: EU','region: NA'])assert.ok(plan.body.entries[1].reason.includes(filter));assert.ok(plan.body.entries[2].reason.includes('region: APAC'));assert.ok(plan.body.entries[1].reason.includes('PROBE-001'));
  assert.ok(plan.body.entries[3].reason.includes('tcp')&&plan.body.entries[3].reason.includes('TCP-001'));
  for(const [index,kind] of [[4,'script'],[5,'recording']]){assert.ok(plan.body.entries[index].reason.includes(kind)&&plan.body.entries[index].reason.includes('FLOW-001/FLOW-002'));assert.ok(plan.body.entries[index].label.includes(`synthetic-uptime-${index+1}`))}
  const applied=await door.apply(plan.body);assert.equal(applied.status,200,JSON.stringify(applied.body));assert.equal(applied.body.created.length,1);
  const definition=(await get('/api/overview')).monitors[0].definition;assert.equal(definition.name,'synthetic-uptime-1');assert.equal(definition.enabled,false);assert.deepEqual(definition.tags,['synthetic-uptime-1','synthetic-uptime-2']);assert.equal(definition.intervalMs,300000);assert.equal(definition.method,'GET');assert.equal(definition.timeoutMs,10000);assert.deepEqual(definition.assertions,{status:['2xx','3xx'],bodyIncludes:'ready',bodyExcludes:'failure'});
  const again=await door.preview(saved);assert.equal(again.status,200);assert.deepEqual(again.body.counts,{create:0,unchanged:1,change:0,refused:3,unsupported:3});assert.equal((await door.apply(plan.body)).status,200);assert.equal((await door.undo(applied.body)).status,200);assert.equal((await get('/api/overview')).monitors.length,1);assert.equal((await get('/api/overview')).monitors[0].definition.enabled,false);
  const transaction=JSON.parse(saved)[4];transaction.steps=[{fn:'go_to',args:{url:'https://synthetic-uptime-97.example/'}}];
  const recognised=await fetch(origin+'/api/definitions/recognise?source=pingdom',{method:'POST',headers:{origin,cookie:owner,'content-type':'application/json'},body:JSON.stringify(transaction)});assert.equal(recognised.status,200);assert.ok(!(await recognised.text()).includes('synthetic-uptime-97'),'unsupported transaction script values are withheld before upload');
  console.log('MIGRATE-002 saved checks: read 7 = converted 1 + refused 3 + unsupported 3; tags retained, every probe filter named, TMS refused, paused apply and undo.');
 }
}finally{await worker?.dispose();await cleanupDirectory(directory)}
