import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {archive,restore} from '../src/domain/archive.server.ts';
import {digest,LEGACY_TABLES} from '../src/domain/archive-schema.ts';
import {validateArchive} from '../src/domain/archive-validation.ts';
import {validateDefinition} from '../src/domain/policy.mjs';
import {archiveTables,rehashArchive} from './archive-restore-fixtures.mjs';
import {archiveEnvironment,assertSemanticRefusal} from './archive-native-support.mjs';

function priorInstallation(enabled,state){
 const id=randomUUID(),now=Date.now()-1000;
 const definition=JSON.stringify(validateDefinition({name:'Retained monitor',url:'https://example.test/health',enabled},[]));
 let legacy;
 const env=archiveEnvironment({beforeMigration(name,sqlite){
  if(name!=='0003_runner_contact.sql')return;
  sqlite.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').run(id,1,definition,now,state);
  sqlite.prepare('INSERT INTO revisions VALUES(?,?,?,?)').run(id,1,definition,now);
  legacy={payload:{schemaVersion:2,target:'uptime-worker-d1',createdAt:now,tables:Object.fromEntries(LEGACY_TABLES.map(table=>[table,sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]))}};
 }});
 return {env,legacy};
}

async function assertInactiveRoundtrip(source,original){
 const target=archiveEnvironment(),again=archiveEnvironment();
 try{
  assert.deepEqual(await restore(target,source),{restored:true,enabled:false,executionReauthorizationRequired:true});
  const restored=archiveTables(await archive(target)),current=restored.monitors[0];
  assert.equal(current.id,original.id);assert.equal(current.revision,original.revision+1);
  assert.equal(JSON.parse(current.definition).enabled,false);
  assert.deepEqual(JSON.parse(current.state),{state:'Unknown',confirmedFailure:false,notificationOpen:false});
  assert.equal(restored.revisions.find(r=>r.revision===original.revision).definition,original.definition);
  const history=restored.archive_history.find(r=>r.table_name==='monitors');
  assert.equal(history.record,JSON.stringify(original),'entire original monitor preserved');
  assert.equal(JSON.parse(history.record).state,original.state,'original sparse JSON bytes preserved');
  assert.deepEqual(restored.notification_jobs,[]);assert.deepEqual(restored.outbox,[]);
  await restore(again,await archive(target));
  const repeatedTables=archiveTables(await archive(again));const addedAudit=repeatedTables.uptime_audit.slice(restored.uptime_audit.length);assert.equal(addedAudit.length,1);assert.equal(addedAudit[0].action,'archive_restore');assert.deepEqual(repeatedTables,{...restored,uptime_audit:[...restored.uptime_audit,...addedAudit]},'Repeated inactive restore preserves every original row and adds its one audit action');
 }finally{target.DB.close();again.DB.close()}
}

for(const enabled of [true,false])test(`sparse retained ${enabled?'enabled':'paused'} monitor survives actual migrations, export and legacy import`,async()=>{
 const state=' { "state" : "Unknown" }\n',prior=priorInstallation(enabled,state);
 try{
  const exported=await archive(prior.env),original=exported.payload.tables.monitors[0];
  assert.equal(original.state,state);
  assert.deepEqual(exported.payload.tables.monitors,prior.legacy.payload.tables.monitors);
  assert.deepEqual(exported.payload.tables.revisions,prior.legacy.payload.tables.revisions);
  assert.deepEqual(exported.payload.tables.migrations.filter(row=>row.version<=2),prior.legacy.payload.tables.migrations);
  await assertInactiveRoundtrip(exported,original);
  for(const schemaVersion of [1,2]){
   const legacy=structuredClone(prior.legacy);legacy.payload.schemaVersion=schemaVersion;
   assert.equal(Object.hasOwn(legacy.payload,'extensionVersion'),false);
   assert.equal(Object.hasOwn(legacy.payload,'productTables'),false);
   await assertInactiveRoundtrip(await rehashArchive(legacy),original);
  }
 }finally{prior.env.DB.close()}
});

test('each historical state flag independently exports and restores absence or a Boolean',async()=>{
 for(const confirmedFailure of [undefined,false,true])for(const notificationOpen of [undefined,false,true]){
  const state=JSON.stringify({state:'Unknown',confirmedFailure,notificationOpen});
  const {env,legacy}=priorInstallation(true,state);
  try{
   const exported=await archive(env),original=exported.payload.tables.monitors[0];
   assert.equal(original.state,state);
   assert.equal((await validateArchive(await rehashArchive(legacy))).monitors[0].state,state);
   await assertInactiveRoundtrip(exported,original);
   await assertInactiveRoundtrip(legacy,original);
  }finally{env.DB.close()}
 }
});

test('non-Boolean historical flags reject rehashed archives before any receiving write',async()=>{
 const {env,legacy}=priorInstallation(false,JSON.stringify({state:'Unknown'})),target=archiveEnvironment();
 try{
  const extended=await archive(env);
  for(const flag of ['confirmedFailure','notificationOpen'])for(const value of [null,0,1,'false',[],{}])for(const source of [extended,legacy]){
   const invalid=structuredClone(source);
   invalid.payload.tables.monitors[0].state=JSON.stringify({state:'Unknown',[flag]:value});
   await assertSemanticRefusal(target,invalid,/Invalid archive monitor state/);
  }
 }finally{env.DB.close();target.DB.close()}
});

test('non-Boolean flags in a rehashed original-history record reject before writes',async()=>{
 const {env}=priorInstallation(false,JSON.stringify({state:'Unknown'})),target=archiveEnvironment(),receiving=archiveEnvironment();
 try{
  await restore(target,await archive(env));const valid=await archive(target);
  for(const flag of ['confirmedFailure','notificationOpen']){
   const invalid=structuredClone(valid),history=invalid.payload.productTables.archive_history.find(row=>row.table_name==='monitors');
   const original=JSON.parse(history.record);original.state=JSON.stringify({state:'Unknown',[flag]:null});
   history.record=JSON.stringify(original);history.id=await digest(`monitors\n${history.record}`);
   await assertSemanticRefusal(receiving,invalid,/Invalid archive monitor state/);
  }
 }finally{env.DB.close();target.DB.close();receiving.DB.close()}
});
