import {validateDiscoveryResult} from '../../src/domain/discovery-result.mjs';
import {discover as discoverSite} from './discovery/index.mjs';
// Answers the owner's "check this website" jobs. It runs beside the probe loop, never inside it: one claim route poll
// at a time, one discovery at a time, and a slow crawl only delays the next discovery, never a probe or a notification.
const ERROR_MAX=200,RUN_LIMIT_MS=100_000;
const sleep=(ms,signal)=>signal?.aborted?Promise.resolve():new Promise(resolve=>{const timer=setTimeout(done,ms);function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve()}signal?.addEventListener('abort',done,{once:true})});
// A failure the owner reads in the console: plain, one line, within the Worker's limit.
export const failureText=(error,prefix)=>{const detail=String(error?.message??error).replace(/[\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim();return (prefix+(detail?`: ${detail}`:'.')).slice(0,ERROR_MAX)};
// api(path,body,signed) is the runner's own control-plane call; it throws an Error whose `status` is the HTTP status.
export async function runDiscoveryLoop({api,signal,pollMs=1000,discover=discoverSite,log=console.error}){
 let reported=false;
 const note=message=>{if(!reported&&!signal?.aborted)log(message);reported=true};
 async function answer(job){
  let body;
  try{
   const run=AbortSignal.any([AbortSignal.timeout(RUN_LIMIT_MS),...(signal?[signal]:[])]);
   body={result:validateDiscoveryResult(await discover(job.url,{signal:run}))};
  }catch(error){
   if(signal?.aborted)return;
   body={error:failureText(error,'The runner could not check this website')};
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
