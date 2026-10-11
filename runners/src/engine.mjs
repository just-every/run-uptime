import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';

import {RUNNER_VERSION,MAX_BODY,validateDefinition,evaluate} from '../../src/domain/policy.mjs';
export {RUNNER_VERSION,MAX_BODY,validateDefinition,evaluate};
import {probeHttp} from './probes.mjs';
export {probeHttp};
export class Store {
  constructor(path, grants) {
    this.grants=grants;this.owner=randomUUID();this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS monitors(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, definition TEXT NOT NULL, next_due INTEGER NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(monitor_id TEXT NOT NULL,revision INTEGER NOT NULL,definition TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(monitor_id,revision));
      CREATE TABLE IF NOT EXISTS slots(id TEXT PRIMARY KEY,monitor_id TEXT NOT NULL,revision INTEGER NOT NULL,due_at INTEGER NOT NULL,status TEXT NOT NULL,definition TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,slot_id TEXT NOT NULL,probe TEXT NOT NULL,attempt INTEGER NOT NULL,evidence TEXT NOT NULL,UNIQUE(slot_id,probe,attempt));
      CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,monitor_id TEXT NOT NULL,slot_id TEXT NOT NULL,kind TEXT NOT NULL,event TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
      INSERT OR IGNORE INTO migrations VALUES(1,strftime('%s','now')*1000);`);
    // Additive permanent migration: existing histories stay intact.
    if(!this.db.prepare('SELECT 1 FROM migrations WHERE version=2').get())this.transaction(()=>{this.db.exec('ALTER TABLE slots ADD COLUMN lease_owner TEXT; ALTER TABLE slots ADD COLUMN lease_until INTEGER; ALTER TABLE slots ADD COLUMN missed_count INTEGER NOT NULL DEFAULT 0;');this.db.prepare('INSERT INTO migrations VALUES(2,?)').run(Date.now());});
    if(!this.db.prepare('SELECT 1 FROM migrations WHERE version=3').get())this.transaction(()=>{this.db.exec("ALTER TABLE slots ADD COLUMN manual INTEGER NOT NULL DEFAULT 0; UPDATE slots SET manual=1 WHERE id LIKE '%:manual:%';");this.db.prepare('INSERT INTO migrations VALUES(3,?)').run(Date.now());});
    this.expireLeases();
  }
  expireLeases(now=Date.now()){this.db.prepare("UPDATE slots SET status='interrupted' WHERE status='running' AND (lease_until IS NULL OR lease_until<=?)").run(now);}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  create(input){const def=validateDefinition(input,this.grants),id=randomUUID(),now=Date.now();this.transaction(()=>{this.db.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').run(id,1,JSON.stringify(def),now,JSON.stringify({state:'Unknown',confirmedFailure:false}));this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').run(id,1,JSON.stringify(def),now);});return this.get(id);}
  update(id,input){const old=this.get(id);if(!old)throw Error('Monitor not found');const def=validateDefinition(input,this.grants),revision=old.revision+1;this.transaction(()=>{this.db.prepare('UPDATE monitors SET revision=?,definition=?,next_due=?,state=? WHERE id=?').run(revision,JSON.stringify(def),Date.now(),JSON.stringify({state:'Unknown',confirmedFailure:old.storedState.confirmedFailure??false,notificationOpen:old.storedState.notificationOpen??false}),id);this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').run(id,revision,JSON.stringify(def),Date.now());});return this.get(id);}
  get(id){const row=this.db.prepare('SELECT * FROM monitors WHERE id=?').get(id);return row?{id:row.id,revision:row.revision,definition:JSON.parse(row.definition),nextDue:row.next_due,storedState:JSON.parse(row.state)}:null;}
  list(now=Date.now()){return this.db.prepare('SELECT id FROM monitors ORDER BY rowid').all().map(r=>{const m=this.get(r.id), latest=this.latest(m.id,m.revision);const state=evaluate(m.definition,latest,m.storedState,now,false);return {...m,state:latest.length?state:{...state,state:m.definition.maintenanceUntil>now?'Maintenance':'Unknown'}};});}
  latest(id,revision){const slot=this.db.prepare("SELECT id FROM slots WHERE monitor_id=? AND revision=? AND status='complete' AND manual=0 ORDER BY due_at DESC,rowid DESC LIMIT 1").get(id,revision);if(!slot)return [];const rows=this.db.prepare('SELECT evidence FROM observations WHERE slot_id=? ORDER BY attempt DESC').all(slot.id);const seen=new Set();return rows.map(r=>JSON.parse(r.evidence)).filter(o=>{if(seen.has(o.probe))return false;seen.add(o.probe);return true;});}
  claim(id,now=Date.now(),manual=false){this.expireLeases(now);return this.transaction(()=>{const m=this.get(id);if(!m||!m.definition.enabled||(!manual&&m.nextDue>now))return null;if(this.db.prepare("SELECT 1 FROM slots WHERE monitor_id=? AND status='running'").get(id))return null;const due=manual?now:m.nextDue,slotId=manual?`${id}:${m.revision}:manual:${randomUUID()}`:`${id}:${m.revision}:${due}`;const inserted=this.db.prepare('INSERT OR IGNORE INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual) VALUES(?,?,?,?,?,?,?,?,?,?)').run(slotId,id,m.revision,due,'running',JSON.stringify(m.definition),this.owner,now+Math.max(30000,m.definition.probes.length*(m.definition.retries+1)*m.definition.timeoutMs+10000),manual?0:Math.max(0,Math.floor((now-due)/m.definition.intervalMs)),manual?1:0);if(!inserted.changes)return null;if(!manual)this.db.prepare('UPDATE monitors SET next_due=? WHERE id=?').run(now+m.definition.intervalMs,id);return {id:slotId,monitorId:id,revision:m.revision,dueAt:due,definition:m.definition,leaseOwner:this.owner};});}
  complete(slot,attempts,now=Date.now()){return this.transaction(()=>{
    const currentSlot=this.db.prepare('SELECT * FROM slots WHERE id=?').get(slot.id);if(currentSlot?.status!=='running'||currentSlot.lease_owner!==this.owner||currentSlot.lease_owner!==slot.leaseOwner||currentSlot.lease_until<=now)return null;
    slot={id:currentSlot.id,monitorId:currentSlot.monitor_id,revision:currentSlot.revision,definition:JSON.parse(currentSlot.definition),leaseOwner:currentSlot.lease_owner};
    const def=slot.definition,seen=new Set();for(const o of attempts){const key=`${o.probe}:${o.attempt}`;if(!def.probes.includes(o.probe)||!Number.isInteger(o.attempt)||o.attempt<0||o.attempt>def.retries||seen.has(key)||!['pass','target_failure','runner_error'].includes(o.outcome))throw Error('Invalid completion evidence');seen.add(key);}
    for(const o of attempts)this.db.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').run(o.id,slot.id,o.probe,o.attempt,JSON.stringify(o));
    this.db.prepare("UPDATE slots SET status='complete' WHERE id=?").run(slot.id);
    const m=this.get(slot.monitorId);if(m.revision!==slot.revision)return null;if(currentSlot.manual)return {accepted:true,policyAdvanced:false};
    const state=evaluate(slot.definition,this.latest(m.id,m.revision),m.storedState,now);
    this.db.prepare('UPDATE monitors SET state=? WHERE id=?').run(JSON.stringify(state),m.id);
    const previous=m.storedState;
    const kind=state.targetState==='Failing'&&!previous.notificationOpen?'trigger':state.targetState==='Healthy'&&previous.notificationOpen?'recovery':null;
    if(kind&&!state.maintenance){const id=`${slot.id}:${kind}`;const event={schemaVersion:1,id,kind,monitorId:m.id,monitorRevision:m.revision,slotId:slot.id,observedAt:now,visibility:'private',evidenceRef:`/api/monitors/${m.id}/history`,explanation:state.reason,delivery:'local-outbox-only'};this.db.prepare('INSERT OR IGNORE INTO outbox(id,monitor_id,slot_id,kind,event) VALUES(?,?,?,?,?)').run(id,m.id,slot.id,kind,JSON.stringify(event));state.notificationOpen=kind==='trigger';this.db.prepare('UPDATE monitors SET state=? WHERE id=?').run(JSON.stringify(state),m.id);}
    return state;
  });}
  history(id){return this.db.prepare('SELECT * FROM slots WHERE monitor_id=? ORDER BY due_at DESC,rowid DESC LIMIT 100').all(id).map(s=>({...s,definition:JSON.parse(s.definition),observations:this.db.prepare('SELECT evidence FROM observations WHERE slot_id=? ORDER BY probe,attempt').all(s.id).map(r=>JSON.parse(r.evidence))}));}
  alerts(){return this.db.prepare('SELECT * FROM outbox ORDER BY rowid DESC LIMIT 200').all().map(r=>({...r,event:JSON.parse(r.event)}));}
  archive(){return this.transaction(()=>{const payload={schemaVersion:1,createdAt:Date.now(),tables:Object.fromEntries(['migrations','monitors','revisions','slots','observations','outbox'].map(t=>{const rows=this.db.prepare(`SELECT * FROM ${t} LIMIT 10001`).all();if(rows.length>10000)throw Error('Archive row limit exceeded; operator backup required');return [t,rows];}))};const serialized=JSON.stringify(payload);if(Buffer.byteLength(serialized)>2*1024*1024)throw Error('Archive exceeds 2 MiB; operator backup required');return {payload,sha256:createHash('sha256').update(serialized).digest('hex')};});}
  restore(archive){
    if(Buffer.byteLength(JSON.stringify(archive??{}))>2*1024*1024)throw Error('Archive exceeds 2 MiB');
    if(!archive?.payload||archive.payload.schemaVersion!==1||createHash('sha256').update(JSON.stringify(archive.payload)).digest('hex')!==archive.sha256)throw Error('Invalid archive integrity/version');
    const tables=archive.payload.tables;
    if(!tables||Object.keys(tables).sort().join(',')!==['migrations','monitors','revisions','slots','observations','outbox'].sort().join(','))throw Error('Invalid archive tables');
    for(const rows of Object.values(tables))if(!Array.isArray(rows)||rows.length>10000)throw Error('Archive capacity exceeded');
    const monitorIds=new Set(),revisionIds=new Set(),revisionDefinitions=new Map(),slotIds=new Map();
    const validId=id=>typeof id==='string'&&id.length>0&&id.length<300;
    for(const m of tables.monitors){if(!validId(m.id)||monitorIds.has(m.id)||!Number.isInteger(m.revision)||m.revision<1||!Number.isFinite(m.next_due))throw Error('Invalid monitor archive');monitorIds.add(m.id);validateDefinition(JSON.parse(m.definition),this.grants);JSON.parse(m.state);}
    for(const r of tables.revisions){if(!monitorIds.has(r.monitor_id)||!Number.isInteger(r.revision)||r.revision<1||revisionIds.has(`${r.monitor_id}:${r.revision}`))throw Error('Invalid revision archive');revisionIds.add(`${r.monitor_id}:${r.revision}`);revisionDefinitions.set(`${r.monitor_id}:${r.revision}`,r.definition);validateDefinition(JSON.parse(r.definition),this.grants);}
    for(const m of tables.monitors)if(!revisionIds.has(`${m.id}:${m.revision}`))throw Error('Missing current revision');
    for(const r of tables.slots){if(!validId(r.id)||slotIds.has(r.id)||!revisionIds.has(`${r.monitor_id}:${r.revision}`)||!['running','complete','interrupted'].includes(r.status)||!Number.isFinite(r.due_at))throw Error('Invalid slot archive');validateDefinition(JSON.parse(r.definition),this.grants);if(r.definition!==revisionDefinitions.get(`${r.monitor_id}:${r.revision}`))throw Error('Slot definition differs from revision');slotIds.set(r.id,r);}
    for(const o of tables.observations){const slot=slotIds.get(o.slot_id);if(!validId(o.id)||!slot||!JSON.parse(slot.definition).probes.includes(o.probe)||!Number.isInteger(o.attempt)||o.attempt<0||o.attempt>2)throw Error('Invalid observation archive');const e=JSON.parse(o.evidence);if(e.id!==o.id||e.probe!==o.probe||e.attempt!==o.attempt||!['pass','target_failure','runner_error'].includes(e.outcome)||!Number.isFinite(e.completedAt)||!Number.isFinite(e.startedAt)||e.completedAt<e.startedAt||!Array.isArray(e.checks)||Object.keys(e).some(k=>!['id','probe','outcome','completedAt','startedAt','durationMs','runnerVersion','status','bytes','checks','attempt'].includes(k)))throw Error('Invalid evidence archive');}
    for(const a of tables.outbox){const slot=slotIds.get(a.slot_id),e=JSON.parse(a.event);if(!slot||a.monitor_id!==slot.monitor_id||!['trigger','recovery'].includes(a.kind)||e.monitorId!==a.monitor_id||e.slotId!==a.slot_id||e.id!==a.id)throw Error('Invalid outbox archive');}
    for(const m of tables.migrations)if(![1,2,3].includes(m.version)||!Number.isFinite(m.applied_at))throw Error('Unsupported migration ledger');
    if(this.db.prepare('SELECT COUNT(*) n FROM monitors').get().n)throw Error('Restore requires empty installation');
    this.transaction(()=>{for(const t of ['migrations','monitors','revisions','slots','observations','outbox']){for(const original of tables[t]){const row={...original};if(t==='monitors'){const def=JSON.parse(row.definition);def.enabled=false;row.definition=JSON.stringify(def);row.state=JSON.stringify({state:'Unknown',confirmedFailure:false,notificationOpen:false});}
      if(t==='slots'){if(row.status==='running')row.status='interrupted';row.lease_owner=null;row.lease_until=null;row.missed_count??=0;row.manual??=0;}
      if(t==='outbox')row.status='imported-inactive';
      const columns=this.db.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name);if(Object.keys(row).sort().join(',')!==columns.slice().sort().join(','))throw Error('Archive row schema mismatch');
      this.db.prepare(`INSERT ${t==='migrations'?'OR REPLACE ':''}INTO ${t}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]));
    }}});return {monitors:tables.monitors.length,enabled:false,executionReauthorizationRequired:true};
  }
  close(){this.db.close();}
}
export class Scheduler {
  constructor(store,{execute=probeHttp,maxConcurrent=2}={}){this.store=store;this.execute=execute;this.maxConcurrent=maxConcurrent;this.active=0;}
  async run(id,manual=false){if(this.active>=this.maxConcurrent)return null;const slot=this.store.claim(id,Date.now(),manual);if(!slot)return null;this.active++;try{const attempts=[];for(const p of slot.definition.probes){for(let attempt=0;attempt<=slot.definition.retries;attempt++){let evidence;try{evidence=await this.execute(slot.definition,p,this.store.grants);}catch{evidence={id:randomUUID(),probe:p,startedAt:Date.now(),completedAt:Date.now(),durationMs:0,runnerVersion:RUNNER_VERSION,outcome:'runner_error',checks:[{assertion:'runner',pass:false,reason:'Runner execution failed'}]};}attempts.push({...evidence,attempt});if(evidence.outcome==='pass'||evidence.outcome==='runner_error')break;}}return this.store.complete(slot,attempts);}finally{this.active--;}}
  async tick(){const due=this.store.list().filter(m=>m.definition.enabled&&m.nextDue<=Date.now());await Promise.all(due.slice(0,this.maxConcurrent-this.active).map(m=>this.run(m.id)));}
}
