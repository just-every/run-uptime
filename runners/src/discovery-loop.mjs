import {validateDiscoveryResult} from '../../src/domain/discovery-result.mjs';
import {discover as discoverSite} from './discovery/index.mjs';
import {publicReport} from './public-http.mjs';
import {failureText} from './discovery/failure.mjs';
import {checkCatalogSource} from '../../src/domain/service-catalog/source-check.mjs';
import {runSource} from './discovery/sources/run.mjs';
import {SourceError} from './discovery/sources/errors.mjs';
// Answers the owner's "check this website" jobs, catalog status-source checks and discovery-source runs (DISCOVERY-001). It runs beside the probe loop, never inside it: one claim route poll
// at a time, one discovery at a time, and a slow crawl only delays the next discovery, never a probe or a notification.
const RUN_LIMIT_MS=100_000;
const sleep=(ms,signal)=>signal?.aborted?Promise.resolve():new Promise(resolve=>{const timer=setTimeout(done,ms);function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve()}signal?.addEventListener('abort',done,{once:true})});
// api(path,body,signed) is the runner's own control-plane call; it throws an Error whose `status` is the HTTP status.
export async function runDiscoveryLoop({api,signal,pollMs=1000,discover=discoverSite,log=console.error}){
 let reported=false;
 const note=message=>{if(!reported&&!signal?.aborted)log(message);reported=true};
 async function answer(job){
  let body;
  try{
   const run=AbortSignal.any([AbortSignal.timeout(RUN_LIMIT_MS),...(signal?[signal]:[])]);
   body={result:job.kind==='catalog'?await checkCatalogSource(job.spec,{transport:publicReport,signal:run}):job.kind==='source'?await runSource(job.spec,{transport:publicReport,signal:run}):validateDiscoveryResult(await discover(job.url,{signal:run,transport:publicReport}))};
  }catch(error){
   if(signal?.aborted)return;
   // A source run's own refusal (a missing credential, a provider's 403) is already one plain sentence for the owner.
   body={error:error instanceof SourceError?failureText(error,'').slice(2):failureText(error,job.kind==='catalog'?'The runner could not read this status source':job.kind==='source'?'The runner could not read this discovery source':'The runner could not check this website')};
  }
  try{await api(`/api/runner/discoveries/${encodeURIComponent(job.id)}/result`,body,true)}
  catch(error){if(error?.status!==409)note(`Runner discovery answer failed (${/^Control-plane response /.test(error?.message)?error.message:'local error'}); the job expires on its own.`)}
 }
 while(!signal?.aborted){
  let job=null;
  try{({job}=await api('/api/runner/discoveries/claim',{}));reported=false}
  catch(error){note(`Runner discovery poll failed (${/^Control-plane response /.test(error?.message)?error.message:'local error'}); polling again.`)}
  if(job)await answer(job);else await sleep(pollMs,signal);
 }
}
