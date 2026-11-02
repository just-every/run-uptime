// One isolated native journey. Diagnostics and the fresh bearer stay in memory;
// even a failed assertion must not publish the captured child output.
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertSecretFree} from './agent-query-token-child.mjs';

const child=fork(fileURLToPath(new URL('./agent-query-token-child.mjs',import.meta.url)),[],{stdio:['ignore','pipe','pipe','ipc']});
const output={stdout:[],stderr:[]},messages=[];
for(const stream of ['stdout','stderr']){
 assert.ok(child[stream]?.readable,'the complete child diagnostic stream is available');
 child[stream].on('data',chunk=>output[stream].push(Buffer.from(chunk)));
}
child.on('message',message=>messages.push(message));
let timedOut=false,killTimer;
const timer=setTimeout(()=>{
 timedOut=true;child.kill('SIGTERM');
 killTimer=setTimeout(()=>child.kill('SIGKILL'),5000);
},120_000);
let result;
try{
 result=await new Promise((resolve,reject)=>{
  child.once('error',()=>reject(Error('Native diagnostic child could not start')));
  child.once('close',(code,signal)=>resolve({code,signal}));
 });
}finally{clearTimeout(timer);clearTimeout(killTimer)}
const secrets=messages.find(message=>message.type==='secrets');
const failure=messages.find(message=>message.type==='failure');
assert.ok(secrets?.values?.length,'native journey reached its private exclusion checks; stage: '+(failure?.stage??'child startup'));
for(const stream of ['stdout','stderr']){
 const text=Buffer.concat(output[stream]).toString('utf8');
 assertSecretFree(text,secrets.values,'complete child '+stream);
}
assert.equal(timedOut,false,'native query-token journey completes within its bound');
assert.equal(result.signal,null,'native query-token child shuts down normally');
assert.equal(result.code,0,'native query-token journey failed at '+(failure?.stage??'child startup'));
for(const stream of ['stdout','stderr'])for(const phase of ['before','after'])assert.ok(Buffer.concat(output[stream]).includes(`synthetic-uptime-node-${stream}-${phase}`),'both ends of each process stream are captured');
const proof=messages.find(message=>message.type==='proof');
assert.ok(proof,'native diagnostic capture and refusal proof completed');
assert.equal(proof.cases,4);
assert.equal(proof.refusals,8);
assert.equal(proof.providerRequests,0);
assert.equal(proof.runtimeCapture,true);
assert.equal(proof.unchangedRefusals,8);
console.log(`PROBE BASE-AGENT-004 acceptance-5: native MCP under autonomous and held policies, both protocol versions -> valid Authorization served; query-only and query with valid Authorization return 401; ${proof.tables} durable tables unchanged; zero provider traffic; complete process and runtime diagnostics plus response headers and bodies exclude raw and encoded credentials`);
console.log('PASS BASE-AGENT-004 isolated native query-token refusal and diagnostic-secret exclusion');
