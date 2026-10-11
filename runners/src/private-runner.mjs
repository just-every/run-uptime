import {validateConfiguration} from '../../src/domain/startup-config.mjs';
import {controlOrigin} from './control-origin.mjs';
import {createHmac,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {executeTaskProbe} from './execute-task.mjs';
import {dispatchNotifications} from './notification-dispatch.mjs';
import {NodePinnedTransport} from '../../src/base/modules/integrations/core/node-transport.ts';
import {createWatch} from './watch.mjs';
export async function runRunner({origin,key,runnerId:configuredId,networkLabel,watch,grantPath=resolve('data/synthetic-grant.json'),localReview=false,transport=new NodePinnedTransport(),signal,once=false,pollMs=1000}){
 validateConfiguration({UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,UPTIME_LOCAL_REVIEW:String(localReview)},{scope:'runner'});
 const u=controlOrigin(origin,{localReview});
 if(!key||key.length<24)throw Error('Scoped control-plane runner key required');
 let runnerId=configuredId,registered=false;
 const watcher=createWatch({...watch,transport:watch?.transport??transport});
 const api=async(path,data,signed=false)=>{const body=JSON.stringify(data),timestamp=String(Date.now()),headers={'content-type':'application/json','x-runner-key':key};if(runnerId)headers['x-runner-id']=runnerId;if(signed){headers['x-sent-at']=timestamp;headers['x-runner-signature']=createHmac('sha256',key).update(`${timestamp}.${path==='/api/runner/enroll'?'runner-enrolment.':''}${body}`).digest('hex')}const r=await fetch(origin+path,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(30000),...(signal?[signal]:[])])});if(!r.ok)throw Error(`Control-plane response ${r.status}`);return r.json()};
 do{
  let task;
  try{
   if(!registered){const registration=await api('/api/runner/enroll',{version:1,...(networkLabel?{networkLabel}:{})},true);if(!/^self-[0-9a-f-]{36}$/.test(registration.runnerId)||registration.scope!=='self-runner')throw Error('Invalid runner registration');runnerId=registration.runnerId;registered=true}
   ({task}=await api('/api/runner/claim',{}));await watcher.contacted();
  }catch(error){if(signal?.aborted)break;await watcher.failed();if(once)throw error;console.error('Runner poll failed; watching independently for loss of contact.')}
  if(task)try{
   const attempts=[];
   for(const probe of task.probes??task.definition.probes){
    const canaryUrl=task.definition.assignments?.[probe]?.canaryUrl;
    let canary;
    if(canaryUrl){const canaryTask={...task,definition:{...task.definition,type:'http',network:'public',url:canaryUrl,method:'GET',request:undefined,assertions:{status:200},retries:0}};canary={...await executeTaskProbe(canaryTask,probe,{grantPath,controlPort:Number(u.port||(u.protocol==='https:'?443:80))}),attempt:0}}
    for(let attempt=0;attempt<=task.definition.retries;attempt++){
     let evidence;try{evidence=await executeTaskProbe(task,probe,{grantPath,controlPort:Number(u.port||(u.protocol==='https:'?443:80))})}catch{const now=Date.now();evidence={id:randomUUID(),probe,startedAt:now,completedAt:now,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'runner_error',checks:[{assertion:'runner',pass:false,reason:'Custody or runner execution unavailable'}]}}
     attempts.push({...evidence,attempt,...(canary?{canary}:{})});if(evidence.outcome==='pass'||evidence.outcome==='runner_error')break;
    }
   }
   await api('/api/runner/results',{slotId:task.id,attempts},true);
  }catch(error){if(signal?.aborted)break;if(once)throw error;console.error('Runner execution failed; retained evidence remains available.')}
  if(registered)try{await dispatchNotifications(api,transport)}catch{if(!signal?.aborted)console.error('Runner notification operation failed.')}
  if(once||signal?.aborted)break;
  await new Promise(resolve=>{const timer=setTimeout(done,pollMs);function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve()}signal?.addEventListener('abort',done,{once:true})});
 }while(!signal?.aborted)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 validateConfiguration(process.env,{scope:'runner'});
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
 await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,runnerId:process.env.UPTIME_RUNNER_ID,networkLabel:process.env.UPTIME_NETWORK_LABEL,localReview:process.env.UPTIME_LOCAL_REVIEW==='true',grantPath:resolve(process.env.UPTIME_GRANT_FILE??'data/synthetic-grant.json'),watch:{url:process.env.UPTIME_WATCH_SLACK_URL??process.env.UPTIME_WATCH_WEBHOOK_URL,slack:Boolean(process.env.UPTIME_WATCH_SLACK_URL),afterMs:process.env.UPTIME_WATCH_AFTER_MS,repeatMs:process.env.UPTIME_WATCH_REPEAT_MS},signal:controller.signal});
}
