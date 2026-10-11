import {testAuthBindings,signInOwner} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {startLocalWorker} from '../scripts/local-worker.mjs';
export const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:'synthetic-probe-runner-key-local-only',UPTIME_SYNTHETIC_PORT:'15516'};
export async function migrate(persist){
 const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','uptime-local','--local','--persist-to',persist],{stdio:'pipe'});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const code=await new Promise(resolve=>child.once('exit',resolve));assert.equal(code,0,output);
}
export async function installation(persist,port){
 const worker=await startLocalWorker({persist,port,bindings});const DB=await worker.getD1Database('DB'),origin=`http://127.0.0.1:${port}`;let cookie='';
 async function api(path,method='GET',body,headers={},owner=true){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(owner?{cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),headers:r.headers}}
 async function login(){cookie=await signInOwner(origin,{bindings});}
 async function claim(){const r=await api('/api/runner/claim','POST',{}, {'x-runner-key':bindings.UPTIME_RUNNER_KEY},false);assert.equal(r.status,200);return r.data.task}
 async function submit(task,attempts,valid=true){const body={slotId:task.id,leaseOwner:task.leaseOwner,attempts},text=JSON.stringify(body),stamp=String(Date.now());return api('/api/runner/results','POST',body,{'x-runner-key':bindings.UPTIME_RUNNER_KEY,'x-sent-at':stamp,'x-runner-signature':valid?createHmac('sha256',bindings.UPTIME_RUNNER_KEY).update(`${stamp}.${text}`).digest('hex'):'invalid'},false)}
 async function due(id){await DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),id).run()}
 async function monitor(id){return (await api('/api/overview')).data.monitors.find(m=>m.id===id)}
 await login();return {worker,DB,api,claim,submit,due,monitor,origin};
}
