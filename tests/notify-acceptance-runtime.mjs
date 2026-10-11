import {testAuthBindings,signInOwner} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {startLocalWorker} from '../scripts/local-worker.mjs';
import {splitSql} from './migration-support.mjs';

export const root=fileURLToPath(new URL('../',import.meta.url));
export async function waitFor(fn,label,timeout=35000){
 const until=Date.now()+timeout;let last;
 while(Date.now()<until){try{const result=await fn();if(result)return result}catch(error){last=error}await new Promise(resolve=>setTimeout(resolve,150))}
 throw Error(`${label} did not complete${last?`: ${last.message}`:''}`);
}
export async function availablePorts(count){
 const custody=[];
 try{
  for(let port=15519;port>=15481&&custody.length<count;port--){
   const server=createServer();
   try{server.listen(port,'127.0.0.1');await once(server,'listening');custody.push({port,server})}catch{server.close()}
  }
  assert.equal(custody.length,count,'enough ports within assignment');
  return custody.map(item=>item.port);
 }finally{await Promise.all(custody.map(({server})=>new Promise(resolve=>server.close(resolve))))}
}
export async function migratedWorker({port,persist,bindings,outboundService,baselineOnly=false}){
 const worker=await startLocalWorker({root,port,persist,bindings:{...testAuthBindings,...bindings},outboundService});
 try{
  const DB=await worker.getD1Database('DB');
  const existing=await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='monitors'").first();
  if(!existing)for(const name of(await readdir(join(root,'migrations'))).filter(name=>name.endsWith('.sql')).sort()){
   if(baselineOnly&&Number(name.slice(0,4))>6)continue;
   for(const sql of splitSql(await readFile(join(root,'migrations',name),'utf8')))await DB.prepare(sql).run();
  }
  return {worker,DB};
 }catch(error){await worker.dispose();throw error}
}
export async function runtimeDirectory(){return mkdtemp(join(tmpdir(),'uptime-notify-'))}
export function fixtureProcess(port,grantPath,directory){
 const child=spawn(process.execPath,[join(root,'runners/src/synthetic.mjs')],{cwd:directory,env:{...process.env,UPTIME_SYNTHETIC_PORT:String(port),UPTIME_GRANT_FILE:grantPath},stdio:['ignore','pipe','pipe']});
 // Child output is deliberately retained privately: even test credentials and
 // capability URLs must not appear in a failing public assertion.
 let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
 return {child,getLogs:()=>logs,async stop(){if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit')}}};
}
export async function cleanupDirectory(directory){await rm(directory,{recursive:true,force:true})}
export function ownerAPI(origin){
 let cookie='';
 const api=async(path,method='GET',value,headers={})=>{
  const response=await fetch(origin+path,{method,headers:{'content-type':'application/json',cookie,...headers},body:value===undefined?undefined:JSON.stringify(value)});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}
  return {status:response.status,headers:response.headers,data};
 };
 return {api,async signIn(bindings=testAuthBindings){cookie=await signInOwner(origin,{bindings:{...testAuthBindings,...bindings}})}};
}
