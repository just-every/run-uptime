import {api} from './api.mjs';
// A website check is a job the console queues and the owner's runner answers. The page asks for it, then asks about it
// once a second until the runner has answered, the job has expired, or the owner cancels.
const wait=(ms,signal)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve()},ms),stop=()=>{clearTimeout(timer);reject(signal.reason)};
 if(signal.aborted)return stop();
 signal.addEventListener('abort',stop,{once:true});
});
export const requestCheck=url=>api('/api/discoveries','POST',{url});
export const readCheck=id=>api(`/api/discoveries/${encodeURIComponent(id)}`);
// Resolves with the finished job (done, failed or expired). onJob sees every state on the way. A few failed reads in a
// row end the wait with the error; a missing job ends it at once.
export async function followCheck({id,signal,onJob,intervalMs=1000,tolerate=3}){
 let failures=0;
 for(;;){
  signal.throwIfAborted();
  try{
   const job=await readCheck(id);failures=0;onJob(job);
   if(job.status!=='queued'&&job.status!=='running')return job;
  }catch(error){
   if(signal.aborted)throw signal.reason;
   if(error.status===404||++failures>=tolerate)throw error;
  }
  await wait(intervalMs,signal);
 }
}
