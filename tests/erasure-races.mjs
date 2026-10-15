import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {notificationTestDB} from './notify-unit-database.mjs';
import {save} from '../src/domain/control.server.ts';
import {erase} from '../src/domain/erasure.server.ts';
import {createDestination,rotateDestination} from '../src/domain/notification-destinations.server.ts';
import {testDestination} from '../src/domain/notifications.server.ts';
import {notificationRpc} from '../src/domain/notification-rpc.server.ts';
const environment=()=>({DB:notificationTestDB(),SESSION_SECRET:'synthetic-real-sqlite-test-sealing-key-abcdefghijklmnopqrstuvwxyz',UPTIME_LOCAL_REVIEW:'true',UPTIME_ORIGIN:'http://localhost:8787'});
const actor={kind:'feature',ref:'notification-dispatch'};
async function snapshot(DB){const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results;return Promise.all(names.map(async({name})=>[name,(await DB.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()).results]))}

test('a captured monitor edit cannot recreate revision or authority after erasure',async()=>{
 const env=environment();try{
  const monitor=await save(env,{name:'Race monitor',url:'https://example.com/health',enabled:false});let afterErasure;
  const DB={prepare:env.DB.prepare.bind(env.DB),async batch(statements){await erase(env,'monitor',monitor.id,actor,monitor.definition.name);afterErasure=await snapshot(env.DB);return env.DB.batch(statements)}};
  await assert.rejects(save({...env,DB},{...monitor.definition,name:'Stale personal edit'},monitor.id));
  assert.deepEqual(await snapshot(env.DB),afterErasure,'captured edit has no durable effect');
 }finally{env.DB.close()}
});

test('a prepared notification envelope cannot reappear after destination erasure',async()=>{
 const env=environment();try{
  const d=await createDestination(env,{name:'Erase race',kind:'webhook',url:'https://example.com/private'});await testDestination(env,d.id);let afterErasure,held=false;
  const wrap=statement=>new Proxy(statement,{get(target,key){if(key==='bind')return(...values)=>wrap(target.bind(...values));if(key==='run')return async()=>{if(!held){held=true;await erase(env,'destination',d.id,actor);afterErasure=await snapshot(env.DB)}return target.run()};return Reflect.get(target,key)}});
  const DB={batch:env.DB.batch.bind(env.DB),prepare(sql){const statement=env.DB.prepare(sql);return sql.startsWith('INSERT INTO integration_deliveries')?wrap(statement):statement}};
  const result=await notificationRpc({...env,DB},{operation:'poll'});assert.deepEqual(result.jobs,[]);
  const current=await snapshot(env.DB);assert.deepEqual(current.filter(([table])=>table!=='runner_contact'),afterErasure.filter(([table])=>table!=='runner_contact'),'cached envelope inserts no product or audit record');
 }finally{env.DB.close()}
});

test('the last-owner refusal happens inside the erasure transaction',async()=>{
 const env=environment();try{
  const a=randomUUID(),b=randomUUID();for(const id of [a,b])await env.DB.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'owner','active',?)").bind(id,`${id}@example.test`,'Owner',Date.now()).run();
  let before;
  const DB={prepare:env.DB.prepare.bind(env.DB),async batch(statements){await env.DB.prepare("UPDATE oa_operators SET status='inactive' WHERE id=?").bind(b).run();before=await snapshot(env.DB);return env.DB.batch(statements)}};
  await assert.rejects(erase({...env,DB},'operator',a,{kind:'operator',ref:a}),/last owner/);
  assert.deepEqual(await snapshot(env.DB),before,'last-owner transaction rolls back every deletion, journal and audit');
 }finally{env.DB.close()}
});


test('a job and credential arriving after dependent discovery abort the complete erasure plan',async()=>{
 const env=environment();try{
  const destination=await createDestination(env,{name:'Discovery race',kind:'webhook',url:'https://example.com/discovery'});let before,intercepted=false;
  const wrap=statement=>new Proxy(statement,{get(target,key){if(key==='bind')return(...values)=>wrap(target.bind(...values));if(key==='all')return async()=>{const result=await target.all();if(!intercepted){intercepted=true;await testDestination(env,destination.id);await rotateDestination(env,destination.id);before=await snapshot(env.DB)}return result};return Reflect.get(target,key)}});
  const DB={batch:env.DB.batch.bind(env.DB),prepare(sql){const statement=env.DB.prepare(sql);return sql==='SELECT id,event FROM notification_jobs WHERE destination_id=?'?wrap(statement):statement}};
  await assert.rejects(erase({...env,DB},'destination',destination.id,actor),/changed during erasure/);
  // Base initializes its empty local journal while planning. Product, authority,
  // audit and receipt records must exactly retain the competing operation.
  assert.deepEqual((await snapshot(env.DB)).filter(([name])=>!name.startsWith('rer_portability_')),before.filter(([name])=>!name.startsWith('rer_portability_')));
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM notification_jobs WHERE destination_id=?').bind(destination.id).first()).n,1);
 }finally{env.DB.close()}
});
