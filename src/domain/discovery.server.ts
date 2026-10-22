// @ts-ignore Edition URL validation is JavaScript.
import {publicTarget,isLoopbackHostname} from './public-target.mjs'
// @ts-ignore Shared with the runner; edition JavaScript.
import {validateDiscoveryResult} from './discovery-result.mjs'
import {runnerRuntime} from './private-runner.ts'
import {listRunners} from './runner-registration.server.ts'
import {ensureFirstRunner,type Runner} from './runner-registration.server.ts'
import type {Bindings} from './control.server.ts'
import {answerInWorker} from './worker-discovery.server.ts'
// @ts-ignore Shared with the runner; edition JavaScript.
import {validateCatalogCheck,catalogSpec} from './service-catalog/source-check.mjs'
// @ts-ignore Shared catalog data.
import {catalogEntry} from './service-catalog/index.mjs'
// A discovery job is the owner's console asking the owner's runner to check one URL. The Worker never fetches the
// target: it queues the question, hands it to a runner that claims it, and keeps the runner's derived answer. A hosted
// demo has no runner, so there the Worker answers the job itself (worker-discovery.server.ts). No monitor, slot,
// observation, state, outbox or notification row is written here.
export const DISCOVERY_DEADLINE_MS=120_000,DISCOVERY_ACTIVE_LIMIT=5,DISCOVERY_ERROR_MAX=200,DISCOVERY_RESULT_BYTES=131_072;
const UNCLAIMED='No runner picked this up. Check that your runner is running.',UNFINISHED='The runner did not finish in time. Check that your runner is running.';
const refuse=(message:string,status:number)=>Object.assign(Error(message),{status});
// The owner reads this message under the address field, so a refused address says why in plain words, not the policy's own.
function discoveryTarget(value:unknown){
 try{
  const target=publicTarget(value as string);
  if(isLoopbackHostname(target.hostname))throw Error('Public target address forbidden');
  return target;
 }catch(error){
  const reason=(error as Error).message;
  if(/forbidden/.test(reason))throw Error('That is a private, loopback or link-local address, so it was not contacted. Use a private-network monitor to check it.');
  if(/requires HTTP/.test(reason))throw Error('Only http and https addresses can be checked, without a username, password or # fragment.');
  throw Error('That is not a web address Uptime can check. Use a full address such as https://example.com.')
 }
}
const idShape=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object=(value:unknown,keys:string[],what:string)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error(`Invalid ${what}`);
 return value as Record<string,unknown>
}
// Lazy expiry on read and on claim: a queued job nobody claimed, or a running job nobody finished, stops waiting.
async function expire(env:Bindings,now:number){
 await env.DB.batch([
  env.DB.prepare("UPDATE discovery_jobs SET status='expired',finished_at=?,error=? WHERE status='queued' AND created_at<=?").bind(now,UNCLAIMED,now-DISCOVERY_DEADLINE_MS),
  env.DB.prepare("UPDATE discovery_jobs SET status='expired',finished_at=?,error=? WHERE status='running' AND claimed_at<=?").bind(now,UNFINISHED,now-DISCOVERY_DEADLINE_MS)])
}
const FULL=`${DISCOVERY_ACTIVE_LIMIT} discoveries are already waiting or running. Wait for one to finish, then try again.`;
// The cap, and for first-run setup the one-job-per-site rule, are part of the insert, so concurrent requests cannot both take the last place or both queue the same site.
function insertJob(env:Bindings,id:string,url:string,now:number,reuse:boolean,kind='site',spec:string|null=null){
 return env.DB.prepare(`INSERT INTO discovery_jobs(id,url,status,created_at,kind,spec) SELECT ?,?,'queued',?,?,? WHERE (SELECT COUNT(*) FROM discovery_jobs WHERE status IN ('queued','running'))<?${reuse?" AND NOT EXISTS (SELECT 1 FROM discovery_jobs WHERE url=? AND kind='site' AND status IN ('queued','running','done'))":''}`).bind(id,url,now,kind,spec,DISCOVERY_ACTIVE_LIMIT,...(reuse?[url]:[])).run()
}
export async function createDiscovery(env:Bindings,text:string){
 const runtime=runnerRuntime(env,await listRunners(env));
 if(runtime.hosted&&!runtime.privateRunnerReady&&!runtime.workerDiscovery)throw Error('Website discovery needs a connected private runner. Start it from the deploying checkout: '+runtime.privateRunnerCommand);
 let input;try{input=JSON.parse(text)}catch{throw Error('Invalid discovery request')}
 const url=discoveryTarget(object(input,['url'],'discovery request').url).href,id=crypto.randomUUID(),now=Date.now();
 await expire(env,now);
 if(!(await insertJob(env,id,url,now,false)).meta.changes)throw refuse(FULL,429);
 if(runtime.workerDiscovery){await answerInWorker(env,id,{kind:'site',url},(answer,runner)=>completeDiscovery(env,id,answer,runner));return {id,status:(await readDiscovery(env,id)).status}}
 return {id,status:'queued'}
}
// DEPENDENCY-002: the owner asks the runner to read a catalog entry's status source before following it. The request names the
// catalog entry and the chosen parts; the address is the catalog's own and is not taken from the owner.
export async function createCatalogCheck(env:Bindings,text:string){
 const runtime=runnerRuntime(env,await listRunners(env));
 if(runtime.hosted&&!runtime.privateRunnerReady&&!runtime.workerDiscovery)throw Error('Checking a provider\u2019s status source needs a connected private runner. Start it from the deploying checkout: '+runtime.privateRunnerCommand);
 let input;try{input=JSON.parse(text)}catch{throw Error('Invalid catalog check')}
 const spec=catalogSpec(input),id=crypto.randomUUID(),now=Date.now();
 await expire(env,now);
 if(!(await insertJob(env,id,catalogEntry(spec.entry).source.url,now,false,'catalog',JSON.stringify(spec))).meta.changes)throw refuse(FULL,429);
 if(runtime.workerDiscovery){await answerInWorker(env,id,{kind:'catalog',spec},(answer,runner)=>completeDiscovery(env,id,answer,runner));return {id,status:(await readDiscovery(env,id)).status}}
 return {id,status:'queued'}
}
// First-run setup asks about the owner's site once: a queued, running or finished job for this address is reused, anything else queues a new one.
// A bad address throws the same plain refusal as the owner route.
export async function ensureDiscovery(env:Bindings,address:string){
 const url=discoveryTarget(address).href,now=Date.now();
 await expire(env,now);
 const existing=()=>env.DB.prepare("SELECT id FROM discovery_jobs WHERE url=? AND status IN ('queued','running','done') ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(url).first<{id:string}>();
 const found=await existing();if(found)return found.id;
 const id=crypto.randomUUID();
 if((await insertJob(env,id,url,now,true)).meta.changes)return id;
 const raced=await existing();if(raced)return raced.id;
 throw refuse(FULL,429)
}
export async function readDiscovery(env:Bindings,id:string){
 if(!idShape.test(id))throw refuse('Discovery not found',404);
 await expire(env,Date.now());
 const row=await env.DB.prepare('SELECT id,url,status,network_label,result,error,kind,spec FROM discovery_jobs WHERE id=?').bind(id).first<any>();
 if(!row)throw refuse('Discovery not found',404);
 return {id:row.id,url:row.url,status:row.status,...(row.kind!=='site'?{kind:row.kind,spec:JSON.parse(row.spec)}:{}),...(row.network_label?{networkLabel:row.network_label}:{}),...(row.result?{result:JSON.parse(row.result)}:{}),...(row.error?{error:row.error}:{})}
}
export async function claimDiscovery(env:Bindings,text:string,runner:Runner){
 let input;try{input=JSON.parse(text)}catch{throw Error('Invalid discovery claim')}
 object(input,[],'discovery claim');
 const row=runner.runner_id?runner:await ensureFirstRunner(env),now=Date.now();
 await expire(env,now);
 const job=await env.DB.prepare("UPDATE discovery_jobs SET status='running',claimed_at=?,runner_id=?,network_label=? WHERE id=(SELECT id FROM discovery_jobs WHERE status='queued' ORDER BY created_at,rowid LIMIT 1) AND status='queued' RETURNING id,url,kind,spec").bind(now,row.runner_id,row.network_label).first<{id:string;url:string;kind:string;spec:string|null}>();
 return {job:job?{id:job.id,url:job.url,...(job.kind!=='site'?{kind:job.kind,spec:JSON.parse(job.spec!)}:{})}:null}
}
// One of the two answers a claiming runner may post: a derived result, or a short failure.
export function discoveryAnswer(text:string):{result:unknown}|{error:string}{
 let input;try{input=JSON.parse(text)}catch{throw Error('Invalid discovery answer')}
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid discovery answer');
 const keys=Object.keys(input);
 if(keys.length===1&&keys[0]==='result')return {result:input.result};
 if(keys.length===1&&keys[0]==='error'){
  if(typeof input.error!=='string'||!input.error.trim()||input.error.length>DISCOVERY_ERROR_MAX||/[\x00-\x1f\x7f]/.test(input.error))throw Error(`Invalid discovery failure: text of 1 to ${DISCOVERY_ERROR_MAX} characters required`);
  return {error:input.error}
 }
 throw Error('Invalid discovery answer: send exactly one of result or error')
}
// Stored only if this runner claimed the job and it has not expired or finished; anything else changes nothing. A result is
// validated by the question it answers: a website check by its own shape, a catalog check against the spec the owner asked for.
export async function completeDiscovery(env:Bindings,id:string,answer:{result:unknown}|{error:string},runner:Runner){
 if(!idShape.test(id))throw refuse('Discovery not found',404);
 const row=runner.runner_id?runner:await ensureFirstRunner(env),now=Date.now();
 await expire(env,now);
 const job=await env.DB.prepare('SELECT kind,spec FROM discovery_jobs WHERE id=?').bind(id).first<{kind:string;spec:string|null}>();
 if(!job)throw refuse('This runner has no running discovery with that id',409);
 let result:any=null;
 if('result' in answer)result=job.kind==='catalog'?validateCatalogCheck(answer.result,JSON.parse(job.spec!)):validateDiscoveryResult(answer.result);
 const stored=await env.DB.prepare("UPDATE discovery_jobs SET status=?,finished_at=?,result=?,error=? WHERE id=? AND status='running' AND runner_id=?").bind('error' in answer?'failed':'done',now,'result' in answer?JSON.stringify(result):null,'error' in answer?answer.error:null,id,row.runner_id).run();
 if(!stored.meta.changes)throw refuse('This runner has no running discovery with that id',409);
 // A catalog source that fails its live check is marked needs review for this installation; one that passes clears the mark.
 if(job.kind==='catalog'&&result)await env.DB.batch(result.ok?[env.DB.prepare('DELETE FROM catalog_review WHERE entry_id=?').bind(result.entry)]:[env.DB.prepare('INSERT INTO catalog_review(entry_id,catalog_version,problem,detail,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET catalog_version=excluded.catalog_version,problem=excluded.problem,detail=excluded.detail,checked_at=excluded.checked_at').bind(result.entry,result.catalogVersion,result.problem,result.detail,result.checkedAt)])
 return {stored:true}
}
