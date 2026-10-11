import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {notificationTestDB} from './notify-unit-database.mjs';
import {digest} from '../src/domain/archive-schema.ts';
import {validateArchive} from '../src/domain/archive-validation.ts';
import {restore} from '../src/domain/archive.server.ts';

export const archiveEnvironment=options=>({DB:notificationTestDB(options),SESSION_SECRET:randomBytes(32).toString('base64url'),UPTIME_ORIGIN:'https://uptime.example.test'});

async function snapshot(DB){
 const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results;
 return Promise.all(names.map(async({name})=>[name,(await DB.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()).results]));
}

// The actual migrated database remains behind an access counter. Semantic
// rejection must precede even preparing SQL, including rolled-back writes.
export async function assertSemanticRefusal(env,input,expected){
 input.sha256=await digest(JSON.stringify(input.payload));
 await assert.rejects(validateArchive(input),expected);
 const before=await snapshot(env.DB),changes=await env.DB.prepare('SELECT total_changes() n').first();
 let accesses=0;
 const DB={
  prepare(...args){accesses++;return env.DB.prepare(...args)},
  batch(...args){accesses++;return env.DB.batch(...args)},
 };
 await assert.rejects(restore({...env,DB},input),expected);
 assert.equal(accesses,0,'semantic refusal precedes all database access');
 assert.deepEqual(await env.DB.prepare('SELECT total_changes() n').first(),changes,'no writes, including rolled-back writes');
 assert.deepEqual(await snapshot(env.DB),before,'receiving installation remains byte-for-byte unchanged');
}
