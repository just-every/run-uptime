import {testAuthBindings} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {probeHttp} from '../runners/src/engine.mjs';
import {readGrant} from '../runners/src/grants.mjs';
import {splitSql} from './migration-support.mjs';
import {root,availablePorts,migratedWorker,runtimeDirectory,fixtureProcess,cleanupDirectory,ownerAPI,waitFor} from './notify-acceptance-runtime.mjs';

const directory=await runtimeDirectory(),[port,fixturePort]=await availablePorts(2);
const persist=join(directory,'worker'),grantPath=join(directory,'grant.json');
const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:'upgrade-acceptance-runner-local-only-20261007',UPTIME_SYNTHETIC_PORT:String(fixturePort)};
const {api,signIn}=ownerAPI(`http://127.0.0.1:${port}`);
let worker,DB,fixture;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 // SHA-256 of the six migrations applied by the original 0.1.0 starting clone,
 // in sha256sum format. Changing an applied migration requires a new additive one.
 const recorded=(await readFile(join(root,'tests/applied-migrations.sha256'),'utf8')).trimEnd().split('\n').map(line=>{
  const match=/^([a-f0-9]{64})  (\S+\.sql)$/.exec(line);assert.ok(match,`malformed applied migration record: ${line}`);return [match[2],match[1]];
 });
 const appliedMigrationDigests=new Map(recorded);
 assert.equal(appliedMigrationDigests.size,6,'six distinct applied migrations are recorded');
 const migrations=(await readdir(join(root,'migrations'))).filter(name=>name.endsWith('.sql')).sort();
 const baseline=migrations.filter(name=>Number(name.slice(0,4))<=6);
 assert.deepEqual(baseline,[...appliedMigrationDigests.keys()].sort(),'the six original applied migration filenames remain present');
 for(const name of baseline){
  const bytes=await readFile(join(root,'migrations',name));
  assert.equal(digest(bytes),appliedMigrationDigests.get(name),`${name} applied migration bytes must remain immutable`);
 }
 console.log('PASS all six immutable baseline migration byte hashes match the migration baseline');
 ({worker,DB}=await migratedWorker({port,persist,bindings,baselineOnly:true}));
 fixture=fixtureProcess(fixturePort,grantPath,directory);await waitFor(async()=> (await fetch(`http://127.0.0.1:${fixturePort}/health`)).ok,'upgrade fixture ready');
 await signIn(bindings);
 const created=await api('/api/monitors','POST',{name:'Legacy café 日本語 observation',url:`http://127.0.0.1:${fixturePort}/health`,intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1});
 assert.equal(created.status,201,'existing definition API works against migrations 0001–0006');
 const monitor=created.data,grant=await readGrant(grantPath,port);
 const observation={...await probeHttp({...monitor.definition,fixtureIdentity:grant.identity},'local-a',[fixturePort]),attempt:0};
 assert.equal(observation.outcome,'pass','legacy observation fixture uses a real authorised probe');
 const slotId=`${monitor.id}:1:legacy:${Date.now()}`,due=observation.startedAt,eventId=randomUUID();
 // Legacy upgrade input is a populated pre-upgrade database, not an incident
 // simulation. No current state is rewritten to drive a notification test.
 await DB.batch([
  DB.prepare('INSERT INTO slots VALUES(?,?,?,?,?,?,?,?,?,?)').bind(slotId,monitor.id,1,due,'complete',JSON.stringify(monitor.definition),'legacy-owner',due+30000,0,0),
  DB.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').bind(observation.id,slotId,'local-a',0,JSON.stringify(observation)),
  DB.prepare('INSERT INTO outbox VALUES(?,?,?,?,?,?,?,?)').bind(eventId,monitor.id,slotId,'trigger',JSON.stringify({schemaVersion:1,id:eventId,kind:'trigger',visibility:'private',monitorId:monitor.id,monitorName:monitor.definition.name,state:'Failing',slotId,observedAt:due}),'accepted',0,JSON.stringify({effect:['stored','task','owned','receiver'].join('-'),peoplePaged:false})),
 ]);
 const tables=['migrations','monitors','revisions','slots','observations','outbox','oa_operators','oa_sessions'];
 const before={};for(const table of tables)before[table]=(await DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
 assert.ok(before.oa_sessions.length,'valid owner session is present in baseline D1');
 await worker.dispose();worker=null;
 ({worker,DB}=await migratedWorker({port,persist,bindings,baselineOnly:true}));
 for(const name of migrations.filter(name=>Number(name.slice(0,4))>6))for(const statement of splitSql(await readFile(join(root,'migrations',name),'utf8')))await DB.prepare(statement).run();
 for(const table of tables)assert.deepEqual((await DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results,before[table],`${table} bytes and identities survive additive notification migration`);
 assert.equal((await api('/api/overview')).status,200,'existing owner session remains authorised after upgrade and process restart');
 const history=await api(`/api/monitors/${monitor.id}/history`);assert.equal(history.status,200);assert.equal(history.data[0].observations[0].id,observation.id);
 assert.deepEqual((await api('/api/notifications')).data.destinations,[],'upgrade never grants an outbound destination');
 assert.deepEqual((await api('/api/notifications')).data.deliveries,[],'upgrade does not replay prior accepted outbox events');
 console.log('PASS additive notification upgrade retains exact legacy definitions observations outbox migration ledger and live owner session without replay');
}finally{if(worker)await worker.dispose();if(fixture)await fixture.stop();await cleanupDirectory(directory)}
