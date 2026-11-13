import {createHash} from 'node:crypto';
import {readArchive,canonicalJson} from '@runeditrun/rer/modules/portability';
import {ContentVerifier,ArchiveVerifier} from '@runeditrun/rer/modules/portability/format';
import assert from 'node:assert/strict';
import {watch} from 'node:fs';
import {cp,mkdir,mkdtemp,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {TABLES} from '../src/domain/archive-schema.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
/** Crash the actual local command after its fsynced checkpoint appears. The
 * isolated files and database contain only this journey's synthetic installation. */
export async function proveLocalArchiveResume(source,installation){
 const directory=await mkdtemp(join(tmpdir(),'uptime-cli-resume-')),children=new Set();
 const prepare=async(site,name)=>{
  await site.owner.signIn(site.bindings);
  const origin=(await site.worker.ready).origin,cookie=site.owner.cookie;
  await site.worker.dispose();
  const checkout=join(directory,name);await mkdir(checkout,{mode:0o700});
  for(const name of ['scripts','src','migrations','dist','package.json','rer-local-setup.json'])await cp(join(root,name),join(checkout,name),{recursive:true});
  await symlink(join(root,'node_modules'),join(checkout,'node_modules'),'dir');
  await mkdir(join(checkout,'data'),{mode:0o700});
  const bindings={...site.bindings,UPTIME_ORIGIN:origin};
  await writeFile(join(checkout,'data/local-secrets.json'),JSON.stringify(bindings),{mode:0o600});
  await mkdir(join(checkout,'.wrangler'),{mode:0o700});await cp(site.persist,join(checkout,'.wrangler/state'),{recursive:true});
  return {checkout,bindings,cookie};
 };
 const run=(site,direction,path)=>{
  const child=spawn(process.execPath,[join(site.checkout,'scripts/local/transfer.mjs'),direction,path],{cwd:site.checkout,env:{...process.env,UPTIME_ACCESS_COOKIE:site.cookie},detached:true,stdio:['ignore','pipe','pipe']});
  children.add(child);let output='';child.stdout.on('data',bytes=>output+=bytes);child.stderr.on('data',()=>{});
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{children.delete(child);resolve({code,signal,output})})});
  return {child,done};
 };
 const interrupt=async(site,direction,path)=>{
  const checkpoint=path+'.'+direction+'.transfer.json';
  await mkdir(join(path,'..'),{recursive:true,mode:0o700});
  let watcher,timer;
  const observed=new Promise((resolve,reject)=>{
   watcher=watch(join(path,'..'),(_event,name)=>{if(name===basename(checkpoint))resolve()});
   timer=setTimeout(()=>reject(Error('Local command did not expose a durable checkpoint')),60000);
  });
  const process=run(site,direction,path);
  try{
   await Promise.race([observed,process.done.then(()=>{throw Error('Local command completed before the interruption probe')})]);
   // This exact group was created by this test; no shared process is targeted.
   globalThis.process.kill(-process.child.pid,'SIGKILL');
   assert.equal((await process.done).signal,'SIGKILL');
   const saved=JSON.parse(await readFile(checkpoint,'utf8'));assert.ok(saved.id);
   return saved;
  }finally{clearTimeout(timer);watcher?.close()}
 };
 try{
  const original=await prepare(source,'source'),archive=join(original.checkout,'exports/synthetic.rer');
  const exportCheckpoint=await interrupt(original,'export',archive);
  const inspect=async(site,fn)=>{const worker=await startLocalWorker({root:site.checkout,persist:join(site.checkout,'.wrangler/state'),bindings:site.bindings,assets:false});try{return await fn(await worker.getD1Database('DB'))}finally{await worker.dispose()}};
  const sourceJob=await inspect(original,db=>db.prepare('SELECT phase,completed FROM rer_portability_jobs WHERE id=?').bind(exportCheckpoint.id).first());assert.ok(['building','complete'].includes(sourceJob.phase));
  const resumed=await run(original,'export',archive).done;assert.equal(resumed.code,0,'the interrupted local export resumes');assert.equal(JSON.parse(resumed.output.trim().split('\n').at(-1)).ok,true);
  assert.ok(!(await readdir(join(archive,'..'))).some(name=>name.endsWith('transfer.json')),'successful export removes its checkpoint');
  const receiving=await prepare(await installation('cli-resume-receiver'),'receiver');
  const records=[];for await(const record of readArchive(new Response(await readFile(archive)).body))records.push(record);
  const foreignManifest={...records[0],product:'synthetic-uptime-foreign'},parts=records.filter(record=>record.kind==='part'),content=new ContentVerifier(foreignManifest),wire=new ArchiveVerifier(foreignManifest);
  for(const part of parts){wire.add(part);for(const item of part.items)content.add(item)}
  const foreignPath=join(original.checkout,'exports/foreign.rer');await writeFile(foreignPath,[foreignManifest,...parts,{kind:'closing',partCount:parts.length,contentHash:content.digest(),archiveHash:wire.digest()}].map(canonicalJson).join('\n')+'\n',{mode:0o600});
  const inventory=async db=>{
   const names=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;
   return Object.fromEntries(await Promise.all(names.map(async({name})=>[name,createHash('sha256').update(JSON.stringify((await db.prepare(`SELECT * FROM \"${name}\" ORDER BY rowid`).all()).results)).digest('hex')])));
  };
  const beforeForeign=await inspect(receiving,inventory),foreign=await run(receiving,'import',foreignPath).done;
  assert.notEqual(foreign.code,0);assert.equal(JSON.parse(foreign.output.trim().split('\n').at(-1)).reason,'wrong_product');assert.deepEqual(await inspect(receiving,inventory),beforeForeign,'wrong-product CLI refusal preserves every durable table before transfer identity initialization');
  const importCheckpoint=await interrupt(receiving,'import',archive);
  const captured=await inspect(receiving,db=>db.prepare('SELECT phase,completed FROM rer_portability_jobs WHERE id=?').bind(importCheckpoint.id).first());assert.equal(captured.phase,'staging');
  const product=db=>Promise.all(TABLES.map(async name=>[name,(await db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()).results])).then(Object.fromEntries);
  const before=await inspect(receiving,product),bytes=await readFile(archive);
  await writeFile(archive,Buffer.concat([bytes,Buffer.from('\n')]));
  const changed=await run(receiving,'import',archive).done;assert.notEqual(changed.code,0,'a changed archive cannot reuse its checkpoint');
  assert.deepEqual(await inspect(receiving,product),before,'changed-file resume writes no product');
  await writeFile(archive,bytes);
  const imported=await run(receiving,'import',archive).done;assert.equal(imported.code,0,'the interrupted local import resumes from the original archive');assert.equal(JSON.parse(imported.output.trim().split('\n').at(-1)).ok,true);
  const after=await inspect(receiving,product);assert.equal(after.monitors.length,120);assert.ok(after.monitors.every(m=>!JSON.parse(m.definition).enabled));assert.ok(after.observations.length>0);assert.ok(after.slots.every(s=>s.lease_owner==='restored-inactive'&&s.lease_until===0));
  console.log('ARCHIVE_LOCAL_RESUME_RECEIPT '+JSON.stringify({schema:1,exportPhaseAtCrash:sourceJob.phase,exportPartsAtCrash:sourceJob.completed,importPhaseAtCrash:captured.phase,importPartsAtCrash:captured.completed,changedFileExit:changed.code,exportExit:resumed.code,importExit:imported.code,restoredMonitors:after.monitors.length,restoredObservations:after.observations.length,inactive:true,changedFileNoWrite:true,foreignProductExit:foreign.code,foreignProductNoWrite:true}));
  console.log('PASS local archive interrupted-process resume: fsynced owner and installation checkpoints, original-file binding, no-write changed-file refusal and inactive completion');
 }finally{
  for(const child of children){try{process.kill(-child.pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}}
  await rm(directory,{recursive:true,force:true});
 }
}
