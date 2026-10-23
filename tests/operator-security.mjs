import {proveMfaPolicy} from './mfa-policy-support.mjs';
import {proveMfaWebAuthn} from './mfa-webauthn-support.mjs';
import {testAuthBindings,signInOwner,emailSignIn} from './auth-test-support.mjs';
import {maintenance} from '../src/domain/maintenance.server.ts';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {startLocalWorker} from './mail-provider-fixture.mjs';
const {unstable_splitSqlQuery:splitSql}=createRequire(import.meta.url)('wrangler');
const dir=await mkdtemp(join(tmpdir(),'uptime-security-')),port=15503,origin=`http://127.0.0.1:${port}`;
const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:'test-only-loopback-runner-credential'};
let worker,passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
try{
 worker=await startLocalWorker({port,persist:dir,bindings});const db=await worker.getD1Database('DB');
 const files=(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort();
 for(const file of files.filter(f=>f!=='0067_edition_access.sql'))for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const call=(path,body,headers={})=>fetch(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{origin,'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 let cookie=await signInOwner(origin,{bindings});
 const originalOwner=await db.prepare("SELECT id,version FROM oa_operators WHERE role='owner'").first();
 const legacyAdmin=crypto.randomUUID(),legacyMember=crypto.randomUUID();
 await db.batch([db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,?,'Upgrade admin','admin','active',1,?)").bind(legacyAdmin,'synthetic-upgrade-admin@example.test',Date.now()),db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,?,'Upgrade member','member','active',1,?)").bind(legacyMember,'synthetic-upgrade-member@example.test',Date.now())]);
 for(const sql of splitSql(await readFile(join('migrations','0067_edition_access.sql'),'utf8')))await db.prepare(sql).run();
 await check('loopback bootstrap uses Base native session and protects private APIs',async()=>{assert.equal((await call('/api/overview')).status,401);assert.match(cookie,/^operator_session_local(_\d+)?=/);assert.equal((await db.prepare('SELECT kind FROM oa_sessions').first()).kind,'native');assert.equal((await db.prepare('SELECT COUNT(*) n FROM sessions').first()).n,0);assert.equal((await call('/api/overview',undefined,{cookie})).status,200);const people=await (await call('/api/access/members',undefined,{cookie})).json();assert.ok(people.some(p=>p.id===originalOwner.id&&p.productRole==='owner'&&p.version===originalOwner.version&&p.assignmentCurrent));assert.ok(people.some(p=>p.id===legacyAdmin&&p.productRole==='admin'&&p.assignmentCurrent));assert.ok(people.some(p=>p.id===legacyMember&&p.productRole===null&&!p.assignmentCurrent));await db.batch([db.prepare('DELETE FROM uptime_member_roles WHERE operator_id=?').bind(legacyAdmin),db.prepare('DELETE FROM oa_operators WHERE id IN (?,?)').bind(legacyAdmin,legacyMember)])});
 await check('cross-origin Base public mutation requests are rejected',async()=>{assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL},{origin:'https://attacker.test'})).status,403);assert.equal((await call('/auth/bootstrap',{token:'wrong'})).status,403);assert.equal((await call('/auth/confirm',{token:'wrong'},{origin:'https://attacker.test'})).status,403)});
 await check('one-time setup remains claimed and provider sign-in uses Base durable native session',async()=>{assert.equal((await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Other owner'})).status,409);cookie=await emailSignIn(origin,{bindings});assert.equal((await db.prepare("SELECT COUNT(*) n FROM oa_sessions WHERE kind='native'").first()).n,2);assert.equal((await db.prepare('SELECT COUNT(*) n FROM oa_bootstrap').first()).n,1)});
 let id,token;
 await check('heartbeat accepts exactly sixty concurrent receipts and returns HTTP429',async()=>{const m=await call('/api/monitors',{name:'Heartbeat quota',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000}},{cookie});assert.equal(m.status,201,await m.clone().text());id=(await m.json()).id;const key=await call(`/api/monitors/${id}/heartbeat-key`,{},{cookie});token=(await key.json()).token;
 // Race distinct increasing sequences; concurrency may reject old sequences,
 // but cannot admit more than the durable quota.
 for(let i=1;i<=59;i++)assert.equal((await call(`/api/heartbeats/${id}`,{}, {authorization:`Bearer ${token}`,'x-heartbeat-sequence':String(i)})).status,200);
 const results=await Promise.all(Array.from({length:12},(_,i)=>call(`/api/heartbeats/${id}`,{}, {authorization:`Bearer ${token}`,'x-heartbeat-sequence':String(60+i)})));
 assert.equal(results.filter(r=>r.status===200).length,1);assert.ok(results.some(r=>r.status===429));assert.equal((await db.prepare('SELECT receipts FROM heartbeat_limits WHERE monitor_id=?').bind(id).first()).receipts,60);
 const before=await db.prepare('SELECT last_sequence,received_at FROM heartbeat_authority WHERE monitor_id=?').bind(id).first();
 const denied=await call(`/api/heartbeats/${id}`,{}, {authorization:`Bearer ${token}`,'x-heartbeat-sequence':'1000'});assert.equal(denied.status,429);assert.equal(denied.headers.get('retry-after'),'60');assert.deepEqual(await db.prepare('SELECT last_sequence,received_at FROM heartbeat_authority WHERE monitor_id=?').bind(id).first(),before);
 const other=await (await call('/api/monitors',{name:'Independent heartbeat',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000}},{cookie})).json();const otherKey=await (await call(`/api/monitors/${other.id}/heartbeat-key`,{},{cookie})).json();assert.equal((await call(`/api/heartbeats/${other.id}`,{}, {authorization:`Bearer ${otherKey.token}`,'x-heartbeat-sequence':'1'})).status,200);
 token=(await (await call(`/api/monitors/${id}/heartbeat-key`,{},{cookie})).json()).token;assert.equal((await call(`/api/heartbeats/${id}`,{}, {authorization:`Bearer ${token}`,'x-heartbeat-sequence':'1'})).status,429)});
 await check('quota survives Worker restart and recovers only after the window',async()=>{await worker.dispose();worker=await startLocalWorker({port,persist:dir,bindings});const db2=await worker.getD1Database('DB');assert.equal((await call(`/api/heartbeats/${id}`,{}, {authorization:`Bearer ${token}`,'x-heartbeat-sequence':'1001'})).status,429);await db2.prepare('UPDATE heartbeat_limits SET window_start=? WHERE monitor_id=?').bind(Date.now()-60001,id).run();assert.equal((await call(`/api/heartbeats/${id}`,{}, {authorization:`Bearer ${token}`,'x-heartbeat-sequence':'1002'})).status,200);assert.equal((await db2.prepare('SELECT receipts FROM heartbeat_limits WHERE monitor_id=?').bind(id).first()).receipts,1)});
 await check('Cron expires abandoned leases without changing evidence or durable bootstrap',async()=>{const db3=await worker.getD1Database('DB');const before=(await db3.prepare('SELECT COUNT(*) n FROM oa_bootstrap').first()).n;await db3.prepare("INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual) VALUES('expired-maintenance',?,1,?,'running','{}','lease',0,0,0)").bind(id,Date.now()).run();const result=await maintenance({DB:db3},Date.now());assert.equal(result.interrupted,1);assert.equal((await db3.prepare("SELECT status FROM slots WHERE id='expired-maintenance'").first()).status,'interrupted');assert.equal((await db3.prepare('SELECT COUNT(*) n FROM oa_bootstrap').first()).n,before);assert.equal((await db3.prepare('SELECT COUNT(*) n FROM observations').first()).n,0)});
 await proveMfaPolicy({origin,bindings,call,cookie,DB:await worker.getD1Database('DB')});
 await worker.dispose();worker=null;
 await proveMfaWebAuthn();
 console.log(`OPERATOR-SECURITY passed ${passed} checks`);
}finally{await worker?.dispose();await rm(dir,{recursive:true,force:true})}
