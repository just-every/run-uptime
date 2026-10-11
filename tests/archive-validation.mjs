import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateArchive} from '../src/domain/archive-validation.ts';
import {digest,LEGACY_TABLES,TABLES,ARCHIVE_BYTES,ARCHIVE_ROWS} from '../src/domain/archive-schema.ts';
import {projectRestore} from '../src/domain/archive-restore-projection.ts';
import {portableArchive} from '../src/domain/archive-schema.ts';
import {restore} from '../src/domain/archive.server.ts';
import {legacyArchive,rehashArchive} from './archive-restore-fixtures.mjs';
const wrap=async payload=>({payload,sha256:await digest(JSON.stringify(payload))});
const base=()=>({schemaVersion:2,target:'uptime-worker-d1',createdAt:Date.now(),tables:Object.fromEntries(LEGACY_TABLES.map(n=>[n,[]]))});
const extended=()=>({...base(),extensionVersion:2,productTables:Object.fromEntries(TABLES.filter(n=>!LEGACY_TABLES.includes(n)).map(n=>[n,[]]))});
test('versioned archive preserves strict legacy and extension table sets',async()=>{
 for(const version of [1,2]){const value=base();value.schemaVersion=version;assert.deepEqual(Object.keys(await validateArchive(await wrap(value))),TABLES)}
 await validateArchive(await wrap(extended()));
 for(const mutate of [p=>{p.schemaVersion=3},p=>{p.extensionVersion=9},p=>{delete p.productTables.notification_jobs},p=>{p.productTables.notification_credentials=[]},p=>{p.tables.sessions=[]}]){const p=extended();mutate(p);await assert.rejects(validateArchive(await wrap(p)))}
});
test('archive integrity and named byte/row bounds fail before writes',async()=>{
 const a=await wrap(extended());a.sha256='0'.repeat(64);await assert.rejects(validateArchive(a),/integrity/);
 const rows=extended();rows.productTables.notification_jobs=Array(ARCHIVE_ROWS+1).fill(null);await assert.rejects(validateArchive(await wrap(rows)),/row bound exceeded: notification_jobs/);
 const bytes=extended();bytes.tables.monitors=[{definition:'x'.repeat(ARCHIVE_BYTES)}];await assert.rejects(validateArchive(await wrap(bytes)),/byte bound exceeded/);
});

test('genuine 0.1 accepted events retain exact history and are quarantined',async()=>{
 const source=await legacyArchive({receipt:JSON.stringify({effect:'stored-slot-owned-receiver',peoplePaged:false})});
 const input=await validateArchive(source),projected=await projectRestore(input,[]);
 assert.equal(projected.outbox[0].status,'imported-inactive');assert.equal(projected.outbox[0].receipt,null);assert.equal(projected.outbox[0].lease_until,0);
 assert.equal(projected.outbox[0].event,input.outbox[0].event);assert.ok(projected.archive_history.some(row=>row.table_name==='outbox'&&row.record===JSON.stringify(input.outbox[0])));
 assert.ok(!JSON.stringify(projected).includes('legacy-local-lease'));
 assert.deepEqual(projected.notification_destinations,[]);assert.deepEqual(projected.notification_jobs,[]);
 await validateArchive(await portableArchive(projected));
 const authority=await portableArchive(projected),historicalSlot=authority.payload.productTables.archive_history.find(row=>row.table_name==='slots');
 const record=JSON.parse(historicalSlot.record);record.lease_owner='foreign-runner-authority';historicalSlot.record=JSON.stringify(record);historicalSlot.id=await digest(`slots\n${historicalSlot.record}`);
 await assert.rejects(validateArchive(await rehashArchive(authority)),/Archive execution references forbidden/);
 const version1=structuredClone(source);version1.payload.schemaVersion=1;for(const row of version1.payload.tables.slots)delete row.manual;
 await projectRestore(await validateArchive(await rehashArchive(version1)),[]);
});

test('restore preflight bounds include the additional paused revision and complete slot histories',async()=>{
 const revisions=await legacyArchive({revisions:ARCHIVE_ROWS,slots:0});
 assert.ok(Buffer.byteLength(JSON.stringify(revisions))<ARCHIVE_BYTES);
 await assert.rejects(projectRestore(await validateArchive(revisions),[]),/Archive row bound exceeded: revisions \(10000\)/);
 const slots=await legacyArchive({slots:2200,fullDefinition:true});
 assert.ok(Buffer.byteLength(JSON.stringify(slots))<ARCHIVE_BYTES);
 await assert.rejects(projectRestore(await validateArchive(slots),[]),/Archive exceeds 2 MiB \(byte bound exceeded: 2 MiB\)/);
 const revisionOverflow=await legacyArchive({slots:0});revisionOverflow.payload.tables.monitors[0].revision=Number.MAX_SAFE_INTEGER-1;revisionOverflow.payload.tables.revisions[0].revision=Number.MAX_SAFE_INTEGER-1;
 await assert.rejects(projectRestore(await validateArchive(await rehashArchive(revisionOverflow)),[]),/Invalid revision reference/);
});

test('paused and already quarantined records preserve every changed portable field without history growth',async()=>{
 const source=await legacyArchive({enabled:false,state:JSON.stringify({state:'Paused',confirmedFailure:false,notificationOpen:false,incidentKey:'prior'}),status:'imported-inactive',receipt:'historical acknowledgement'});
 const input=await validateArchive(source),first=await projectRestore(input,[]);
 for(const name of ['monitors','outbox'])assert.ok(first.archive_history.some(row=>row.table_name===name&&row.record===JSON.stringify(input[name][0])),`${name} exact original`);
 const second=await projectRestore(await validateArchive(await portableArchive(first)),[]);
 assert.deepEqual(second,first,'Repeated inactive restore preserves all portable tables, including revisions and histories');
});

test('projection includes unavailable and deleted email definitions and reserves CLI framing at the byte boundary',async()=>{
 const source=extended();source.productTables.notification_destinations=[
  {id:'unavailable',name:'Unavailable email',kind:'email',enabled:0,created_at:1,deleted_at:null,address:null},
  {id:'deleted',name:'Deleted email',kind:'email',enabled:0,created_at:1,deleted_at:2,address:'prior@example.test'},
 ];
 const first=await projectRestore(await validateArchive(await wrap(source)),[]);
 assert.deepEqual(first.notification_destinations.map(row=>row.address),[null,null]);
 assert.ok(first.archive_history.some(row=>row.table_name==='notification_destinations'&&row.record===JSON.stringify(source.productTables.notification_destinations[1])));
 assert.deepEqual(await projectRestore(await validateArchive(await portableArchive(first)),[]),first);
 const input=await legacyArchive({slots:0,state:JSON.stringify({state:'Paused',confirmedFailure:false,notificationOpen:false,reason:''})});
 const projection=await projectRestore(await validateArchive(input),[]),envelope=await portableArchive(projection,Number.MAX_SAFE_INTEGER);
 const remaining=ARCHIVE_BYTES-Buffer.byteLength(JSON.stringify(envelope)+'\n');
 const state=JSON.parse(input.payload.tables.monitors[0].state);state.reason='x'.repeat(remaining);input.payload.tables.monitors[0].state=JSON.stringify(state);
 const edge=await projectRestore(await validateArchive(await rehashArchive(input)),[]);
 assert.equal(Buffer.byteLength(JSON.stringify(await portableArchive(edge,Number.MAX_SAFE_INTEGER))+'\n'),ARCHIVE_BYTES);
 state.reason+='x';input.payload.tables.monitors[0].state=JSON.stringify(state);
 await assert.rejects(projectRestore(await validateArchive(await rehashArchive(input)),[]),/Archive exceeds 2 MiB \(byte bound exceeded: 2 MiB\)/);
});

test('already quarantined notification jobs retain their original outcome code',async()=>{
 const source=extended();source.productTables.notification_destinations=[{id:'webhook',name:'Disabled webhook',kind:'webhook',enabled:0,created_at:1,deleted_at:null,address:null}];
 const event=JSON.stringify({schemaVersion:2,id:'test',kind:'test',eventType:'uptime.test',incidentKey:null,state:'test',title:'Test',monitorId:null,monitorRevision:null,monitorName:'',url:'',slotId:null,observedAt:1,visibility:'private',evidenceRef:'',explanation:'Test',probes:[],consoleUrl:'https://example.test'});
 const job={id:'job',event_id:'test',destination_id:'webhook',destination_name:'Disabled webhook',kind:'webhook',event,created_at:1,state:'imported-inactive',code:'historical_result',finished_at:1,attempts:0};source.productTables.notification_jobs=[job];
 const first=await projectRestore(await validateArchive(await wrap(source)),[]);
 assert.equal(first.notification_jobs[0].code,'imported_inactive');assert.ok(first.archive_history.some(row=>row.table_name==='notification_jobs'&&row.record===JSON.stringify(job)));
 assert.deepEqual(await projectRestore(await validateArchive(await portableArchive(first)),[]),first);
});

test('projected bounds refuse restore before any database mutations',async()=>{
 // The fixture database supplies only read results. Preparing a mutation fails
 // immediately, so these refusals also prove no SQL write was even prepared.
 const {columns}=await import('../src/domain/archive-schema.ts');
 let mutations=0;
 const sourceColumns={...columns,notification_destinations:['id','name','kind','enabled','credential_id','created_at','deleted_at'],notification_jobs:[...columns.notification_jobs,'credential_id','claim','claim_until'],integration_deliveries:[...columns.integration_deliveries,'fingerprint','destination_hash','claim','claim_until'],integration_replays:[...columns.integration_replays,'fingerprint']};
 const DB={prepare(sql){if(!/^(SELECT|PRAGMA) /.test(sql)){mutations++;throw Error('Unexpected write before refusal')}
  const rows=()=>{const table=/^PRAGMA table_info\((\w+)\)$/.exec(sql)?.[1];return table?sourceColumns[table].map(name=>({name})):sql.includes('COUNT(*)')?[{n:0}]:[]};
  return {all:async()=>({results:rows()}),first:async()=>rows()[0],rows};
 },async batch(statements){return statements.map(statement=>({results:statement.rows()}))}};
 for(const [options,bound] of [[{revisions:ARCHIVE_ROWS,slots:0},/row bound exceeded: revisions/],[{slots:2200,fullDefinition:true},/byte bound exceeded/]])await assert.rejects(restore({DB},await legacyArchive(options)),bound);
 assert.equal(mutations,0);
});
