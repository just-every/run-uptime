import { createConnection, createServer } from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { userInfo, tmpdir } from 'node:os';
import { chmod, realpath, unlink, lstat, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { processInfo } from '../modules/job-queue/processes.mjs';
import { identity, alive } from '../modules/job-queue/identity.mjs';
import { transaction } from '../modules/job-queue/storage.mjs';
import { refuse, invalid } from './errors.mjs';

export function positive(value, name, fallback) {
 if(value===undefined)return fallback;
 if(!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))throw invalid(`${name} must be positive integer seconds/count.`);
 return Number(value);
}
export const stopInstruction = record => `rer ${record.mode} --cwd ${JSON.stringify(record.checkout)} --stop`;
export const description = record => `${record.mode} ${record.url ?? '(starting)'}; ${stopInstruction(record)}`;
async function request(record, action) {
 return new Promise((resolveRequest,reject)=>{
  const socket=createConnection(record.control);let text='';
  socket.setTimeout(35000,()=>socket.destroy(Error('Managed server did not complete cleanup.')));
  socket.on('connect',()=>socket.end(JSON.stringify({token:record.token,action})));
  socket.on('data',chunk=>{text+=chunk;if(text.length>16384)socket.destroy(Error('Invalid managed server reply.'));});
  socket.on('end',()=>{try{const value=JSON.parse(text);if(value.token!==record.token)throw Error('Unverified server');resolveRequest(value);}catch(error){reject(error);}});
  socket.on('error',reject);
 });
}

// Lock order: short machine transaction -> reserve checkout; release transaction
// before queue admission/local operation. Stop waits for process+state cleanup,
// which never needs the machine transaction. Generation removal happens last.
export async function serverRegistry(root,{env=process.env}={}) {
 const limit=positive(env.RER_SERVER_LIMIT,'RER_SERVER_LIMIT',2);
 const checkout=await realpath(root), lifetime=await identity();
 const directory=resolve(env.RER_SERVERS_DIR??join(userInfo().homedir,'.rer/servers'));
 let secured;
 async function secure(){
  for(const path of [directory,join(directory,'locks')]){
   await mkdir(path,{recursive:true,mode:0o700});const info=await lstat(path);
   if(info.isSymbolicLink()||!info.isDirectory()||info.uid!==process.getuid())throw refuse('Server registry directory is foreign or linked. Preserve it and choose an owned RER_SERVERS_DIR.');
   await chmod(path,0o700);
  }
  try{const info=await lstat(join(directory,'state.json'));if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.uid!==process.getuid())throw refuse('Server registry state is foreign or linked. Preserve it for inspection.');await chmod(join(directory,'state.json'),0o600);}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 const change=async action=>{await (secured??=secure());return transaction(directory,lifetime.info,action);};
 let owned, control, closing;
 async function inspect(state) {
  const kept=[];
  for(const record of state.running){
   let live;try{live=await alive(record.owner);}catch{throw refuse(`Unverifiable server identity: ${description(record)}. Preserve it for inspection.`);}
   if(live) kept.push(record);
   else {
    const current=await processInfo(record.owner.pid);
    if(current&&!current.zombie&&current.start===record.owner.start)throw refuse(`Server lifetime cannot be verified: ${description(record)}. Preserve its process.`);
    // A runtime capability grants recovery only to the captured process scope.
    if(record.runtime) {
     const { shared }=await import('./shared.mjs');
     const { recoverCommand }=await shared('command-recovery.mjs');
     await recoverCommand(record.runtime);
    }
   }
  }
  state.running=kept;
 }
 async function existing(mode,options,{stop=false}={}) {
  return change(async state=>{
   await inspect(state);const record=state.running.find(item=>item.checkout===checkout);
   if(!record)return null;
   if(record.mode!==mode)throw refuse(`This checkout already owns ${description(record)}.`);
   if(!stop && (options.supplied.has('--host')&&record.host!==undefined&&options.host!==record.host || options.supplied.has('--port')&&record.port!==undefined&&options.port!==record.port || options.supplied.has('--idle-timeout')&&options.idleTimeout!==record.idleTimeout))throw refuse(`Options conflict with ${description(record)}.`);
   return record;
  });
 }
 async function stop(mode,options) {
  try{await lstat(join(directory,'state.json'));}catch(error){if(error.code==='ENOENT')return;throw error;}
  const record=await existing(mode,options,{stop:true});if(!record)return;
  await request(record,'stop');
  await change(state=>{state.running=state.running.filter(item=>item.generation!==record.generation);});
 }
 async function reserve(mode,options) {
  return change(async state=>{
   await inspect(state);
   const same=state.running.find(item=>item.checkout===checkout);
   if(same)return {existing:same};
   const cap=Math.min(limit,...state.running.map(item=>item.limit));
   while(state.running.length>=cap){
    const eligible=[];
    for(const record of state.running){
     let status;try{status=await request(record,'status');}catch{throw refuse(`Cannot verify managed server ${description(record)}. Preserve it and inspect its foreground process.`);}
     if(status.ready && !status.active && status.idleSeconds>=60)eligible.push({...record,...status});
    }
    eligible.sort((a,b)=>a.lastActivity-b.lastActivity||a.startedAt-b.startedAt||a.checkout.localeCompare(b.checkout));
    if(!eligible.length)throw refuse(`Server limit ${cap} reached. ${state.running.map(description).join('\n')}`);
    const victim=eligible[0],eviction=await request(victim,'evict');
    if(eviction.evicted!==true)throw refuse(`Server became active before eviction: ${description(victim)}. Retry after its owner is idle.`);
    state.running=state.running.filter(item=>item.generation!==victim.generation);
    options.onEvict?.(`Stopped idle checkout ${victim.checkout}: ${victim.mode} ${victim.url}; idle ${Math.floor(victim.idleSeconds)} seconds.`);
   }
   owned={checkout,mode,generation:randomUUID(),token:randomUUID(),owner:lifetime.info,limit,startedAt:Number(process.hrtime.bigint()/1000000n),idleTimeout:options.idleTimeout};
   owned.lastActivity=owned.startedAt;owned.active=0;
   const name=`rer-server-${createHash('sha256').update(owned.generation).digest('hex').slice(0,20)}.sock`;
   owned.control=join(tmpdir(),name);if(Buffer.byteLength(owned.control)>=100)owned.control=join('/tmp',name);
   owned.runtime={pid:process.pid,token:owned.token};
   state.running.push(owned);return {owned};
  });
 }
 async function serve(handler) {
  control=createServer({allowHalfOpen:true},socket=>{
   let text='';socket.setTimeout(35000,()=>socket.destroy());
   socket.on('data',data=>{text+=data;if(text.length>1024)socket.destroy();});
   socket.on('end',async()=>{
    try{const request=JSON.parse(text);if(request.token!==owned.token)throw Error('Invalid capability');socket.end(JSON.stringify({...await handler(request.action),token:owned.token}));}
    catch{socket.destroy();}
   });
  });
  await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(owned.control,resolve);});await chmod(owned.control,0o600);
 }
 async function update(fields){Object.assign(owned,fields);await change(state=>{const item=state.running.find(item=>item.generation===owned.generation);if(!item)throw Error('Server reservation disappeared');Object.assign(item,fields);});}
 async function updateActivity(fields){await change(state=>{const item=state.running.find(item=>item.generation===owned.generation);if(item)Object.assign(item,fields);});}
 async function waitReady(record,signal){
  for(let attempt=0;attempt<1200;attempt++){
   signal?.throwIfAborted();if(!await alive(record.owner))throw refuse('Concurrent server startup failed. Retry after recovery.');
   try{const status=await request(record,'status');if(status.ready)return {...record,...status};}catch(error){if(attempt===1199)throw error;}
   await delay(250,undefined,{signal});
  }
  throw refuse('The existing server is still starting. Wait for its ready output.');
 }
 return {checkout,existing,stop,reserve,serve,update,updateActivity,waitReady,custodyToken:()=>owned?.token,
  close(){return closing??=(async()=>{
   if(owned)await change(state=>{state.running=state.running.filter(item=>item.generation!==owned.generation);});
   if(control)await new Promise(resolve=>control.close(resolve));
   if(owned)await unlink(owned.control).catch(error=>{if(error.code!=='ENOENT')throw error;});
   await lifetime.close();
  })();}
 };
}
