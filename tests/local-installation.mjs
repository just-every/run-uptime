import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {freePort} from '../scripts/local-ports.mjs';
import {readGrant} from '../runners/src/grants.mjs';
test('ports are dynamically allocated or explicit and invalid ports fail closed',async()=>{
 const port=await freePort();assert.ok(port>0&&port<=65535);assert.equal(await freePort(port),port);
 for(const value of ['-1','65536','bad'])await assert.rejects(freePort(value));
});
test('live synthetic grants bind exact port/path/process/expiry and cannot target control',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'uptime-local-grant-')),path=join(dir,'grant.json'),port=await freePort();
 const grant={schemaVersion:1,custody:'local-uptime-synthetic',host:'127.0.0.1',port,pid:process.pid,identity:'local-test-identity',expiresAt:Date.now()+60000,paths:['/health']};
 try{
  const save=async value=>writeFile(path,JSON.stringify(value),{mode:0o600});await save(grant);assert.deepEqual(await readGrant(path,port===1?2:1),grant);await assert.rejects(readGrant(path,port),/invalid/);
  for(const patch of [{paths:['/not-granted']},{expiresAt:Date.now()-1},{pid:2147483647},{identity:''},{port:0}]){await save({...grant,...patch});await assert.rejects(readGrant(path,port===1?2:1))}
 }finally{await rm(dir,{recursive:true,force:true})}
});
