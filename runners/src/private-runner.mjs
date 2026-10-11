import {controlOrigin} from './control-origin.mjs';
import {createHmac,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {executeTaskProbe} from './execute-task.mjs';
import {dispatchNotifications} from './notification-dispatch.mjs';
import {NodePinnedTransport} from '../../src/base/modules/integrations/core/node-transport.ts';
export async function runRunner({origin,key,grantPath=resolve('data/synthetic-grant.json'),localReview=false,transport=new NodePinnedTransport(),signal,once=false}){
 const u=controlOrigin(origin,{localReview});
 if(!key||key.length<24)throw Error('Scoped control-plane runner key required');
 let runnerId;
 const api=async(path,data,signed=false)=>{const body=JSON.stringify(data),timestamp=String(Date.now()),headers={'content-type':'application/json','x-runner-key':key};if(runnerId)headers['x-runner-id']=runnerId;if(signed){headers['x-sent-at']=timestamp;headers['x-runner-signature']=createHmac('sha256',key).update(`${timestamp}.${path==='/api/runner/enroll'?'runner-enrolment.':''}${body}`).digest('hex')}const r=await fetch(origin+path,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Control-plane response ${r.status}`);return r.json()};
 // Stopping a local app closes it before its runner is signalled; the runner then sees the app refuse connections. That is a clean stop, not a crash.
 const closed=error=>signal?.aborted||(localReview&&error?.cause?.code==='ECONNREFUSED');
 let registration;try{registration=await api('/api/runner/enroll',{version:1},true)}catch(error){if(closed(error))return;throw error}
 if(!/^self-[0-9a-f-]{36}$/.test(registration.runnerId)||registration.scope!=='self-runner')throw Error('Invalid runner registration');
 runnerId=registration.runnerId;
 do{try{
  await dispatchNotifications(api,transport);
  const {task}=await api('/api/runner/claim',{});
  if(task){const attempts=[];for(const probe of task.definition.probes){for(let attempt=0;attempt<=task.definition.retries;attempt++){
   let evidence;try{evidence=await executeTaskProbe(task,probe,{grantPath,controlPort:Number(u.port||(u.protocol==='https:'?443:80))})}catch{const now=Date.now();evidence={id:randomUUID(),probe,startedAt:now,completedAt:now,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'runner_error',checks:[{assertion:'runner',pass:false,reason:'Custody or runner execution unavailable'}]}}
   attempts.push({...evidence,attempt});if(evidence.outcome==='pass'||evidence.outcome==='runner_error')break;
  }}await api('/api/runner/results',{slotId:task.id,leaseOwner:task.leaseOwner,attempts},true);await dispatchNotifications(api,transport)}
 }catch(error){if(closed(error))break;if(once)throw error;console.error('Runner operation failed; retained work will be checked on the next poll.')}
 if(once||signal?.aborted)break;await new Promise(resolve=>{const timer=setTimeout(done,1000);function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve()}signal?.addEventListener('abort',done,{once:true})});
 }while(!signal?.aborted)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(!process.env.UPTIME_CONTROL_ORIGIN)throw Error('Explicit UPTIME_CONTROL_ORIGIN required');
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
 await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,localReview:process.env.UPTIME_LOCAL_REVIEW==='true',grantPath:resolve(process.env.UPTIME_GRANT_FILE??'data/synthetic-grant.json'),signal:controller.signal});
}
