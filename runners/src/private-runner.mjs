import {demoMode} from './demo-policy.mjs';
import {validateConfiguration} from '../../src/domain/startup-config.mjs';
import {controlOrigin} from './control-origin.mjs';
import {createHmac,createHash,randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {executeTaskProbe} from './execute-task.mjs';
import {dispatchNotifications} from './notification-dispatch.mjs';
import {NotificationTransport} from './notification-transport.mjs';
import {createWatch} from './watch.mjs';
import {runDiscoveryLoop} from './discovery-loop.mjs';
import {createClock} from './clock.mjs';
import {browserCapabilities} from './flow/browser.mjs';
import {prepareFlowWorkspace} from './flow/workspace.mjs';
import {readControlResponse} from './control-response.mjs';
import {RUNNER_VERSION} from '../../src/domain/policy.mjs';
import {evaluatedAt} from '../../src/domain/protocol/evaluate.mjs';
export async function runRunner({origin,key,controlAddress,runnerId:configuredId,networkLabel,watch,grantPath=resolve('data/synthetic-grant.json'),localReview=false,transport=new NotificationTransport(),signal,once=false,pollMs=1000}){
 validateConfiguration({UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,UPTIME_LOCAL_REVIEW:String(localReview)},{scope:'runner'});
 const u=controlOrigin(origin,{localReview});
 if(demoMode()&&!controlAddress&&(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port))throw Error('Demo control transport requires its exact loopback origin');
 if(controlAddress&&(!demoMode()||controlAddress!==`http://127.0.0.1:${process.env.PORT??8080}`))throw Error('Invalid demo control address');
 if(!key||key.length<24)throw Error('Scoped control-plane runner key required');
 let runnerId=configuredId,registered=false;
 // Flow profiles live in this runner's own folder, emptied now: a profile a hard stop left behind never outlives this start.
 const flowWorkspace=await prepareFlowWorkspace(key).catch(()=>{console.error('The flow folder is not a private folder this runner owns; flows will report Unknown until UPTIME_FLOW_DIR is fixed.');return undefined});
 const watcher=createWatch({identity:`${origin}\n${key}`,statePath:resolve(dirname(grantPath),'watch',createHash('sha256').update(`${origin}\n${key}\n${watch?.url??''}`).digest('hex')+'.sqlite'),...watch,transport:watch?.transport??transport}),clock=createClock();
 const api=async(path,data,signed=false,{shutdown=false}={})=>{const body=JSON.stringify(data),timestamp=String(clock.now()),headers={'content-type':'application/json','x-runner-key':key};if(runnerId)headers['x-runner-id']=runnerId;if(signed){headers['x-sent-at']=timestamp;headers['x-runner-signature']=createHmac('sha256',key).update(`${timestamp}.${path==='/api/runner/enroll'?'runner-enrolment.':''}${body}`).digest('hex')}const requestSignal=AbortSignal.any([AbortSignal.timeout(shutdown?2000:30000),...(!shutdown&&signal?[signal]:[])]),r=await fetch((controlAddress??origin)+path,{method:'POST',headers,body,redirect:'error',signal:requestSignal});if(!r.ok){const answer=await readControlResponse(r,requestSignal).catch(()=>null),pick=(value,pattern)=>typeof value==='string'&&pattern.test(value)?value:null,code=pick(answer?.code,/^[a-z_]{1,40}$/),operation=pick(answer?.operation,/^[a-z][A-Za-z0-9_.]{0,80}$/),kind=pick(answer?.class,/^[a-z_]{1,20}$/),cause=pick(answer?.cause,/^[\x20-\x7e]{1,200}$/);throw Object.assign(Error(`Control-plane response ${r.status}${code?` ${code}`:''}${kind?` (${kind})`:''}${operation?` in ${operation}`:''}${cause?`: ${cause}`:''} for ${path}`),{status:r.status,code,operation,class:kind})}return readControlResponse(r,requestSignal)};
 let discovering;
 try{do{
  let task;
  try{
   if(!registered){const registration=await api('/api/runner/enroll',{version:1,...(networkLabel?{networkLabel}:{}),capabilities:{...await browserCapabilities(),privateNetwork:true,capacity:1,version:RUNNER_VERSION}},true);if(!/^self-[0-9a-f-]{36}$/.test(registration.runnerId)||registration.scope!=='self-runner')throw Error('Invalid runner registration');runnerId=registration.runnerId;registered=true}
   {const sentAt=Date.now(),answer=await api('/api/runner/claim',{});clock.observe(sentAt,Date.now(),answer.now);({task}=answer)}await watcher.contacted();
  }catch(error){if(signal?.aborted)break;await watcher.failed();if(once)throw error;console.error('Runner poll failed; watching independently for loss of contact.')}
  // Website checks run in their own loop once the runner is enrolled, so a slow crawl never holds a probe claim.
  if(registered&&!once&&!discovering)discovering=runDiscoveryLoop({api,signal,pollMs});
  if(task)try{
   const attempts=[];
   for(const probe of task.probes??task.definition.probes){
    if(signal?.aborted)break;
    const canaryUrl=task.definition.assignments?.[probe]?.canaryUrl;
    let canary;
    // The external check is HTTP even when the monitored task is a heartbeat, flow or protocol check.
    if(canaryUrl){const canaryTask={...task,definition:{...task.definition,type:'http',network:'public',privateGrantRef:undefined,tlsTrust:undefined,url:canaryUrl,method:'GET',request:undefined,heartbeat:undefined,api:undefined,mail:undefined,flow:undefined,tcp:undefined,udp:undefined,ping:undefined,dns:undefined,tls:undefined,domain:undefined,assertions:{status:200},timeoutMs:Math.min(task.definition.timeoutMs,10000),retries:0}};canary={...await executeTaskProbe(canaryTask,probe,{grantPath,runnerId,controlOrigin:origin,controlPort:Number(u.port||(u.protocol==='https:'?443:80)),statusOnly:true,signal,now:clock.now}),attempt:0}}
    for(let attempt=0;attempt<=task.definition.retries;attempt++){
     let evidence;try{evidence=await executeTaskProbe(task,probe,{grantPath,runnerId,controlOrigin:origin,controlPort:Number(u.port||(u.protocol==='https:'?443:80)),flowWorkspace,signal,now:clock.now})}catch{const now=Date.now();evidence={id:randomUUID(),probe,startedAt:now,completedAt:now,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'runner_error',checks:[{assertion:'runner',pass:false,reason:signal?.aborted?'Runner stopped before the attempt completed':'Custody or runner execution unavailable'}]}}
     // Protocol checks depend on the time they ran, so they are evaluated again at the aligned completion time.
     attempts.push({...evaluatedAt(task.definition,clock.align(evidence,{dueAt:task.dueAt})),attempt,...(canary?{canary:clock.align(canary,{dueAt:task.dueAt})}:{})});if(signal?.aborted||evidence.outcome==='pass'||evidence.outcome==='runner_error')break;
    }
   }
   if(attempts.length)await api('/api/runner/results',{slotId:task.id,attempts},true,{shutdown:Boolean(signal?.aborted)});
  }catch(error){if(signal?.aborted)break;if(once)throw error;console.error('Runner execution failed; retained evidence remains available.')}
  if(registered&&!signal?.aborted)try{await dispatchNotifications(api,transport)}catch(error){if(!signal?.aborted)console.error(`Runner notification operation failed (${/^Control-plane response /.test(error?.message)?error.message:'local error'}); the next poll retries it.`)}
  if(once||signal?.aborted)break;
  await new Promise(resolve=>{const timer=setTimeout(done,pollMs);function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve()}signal?.addEventListener('abort',done,{once:true})});
 }while(!signal?.aborted)
 await discovering;
 }finally{await watcher.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 validateConfiguration(process.env,{scope:'runner'});
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
 await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,runnerId:process.env.UPTIME_RUNNER_ID,networkLabel:process.env.UPTIME_NETWORK_LABEL,localReview:process.env.UPTIME_LOCAL_REVIEW==='true',grantPath:resolve(process.env.UPTIME_GRANT_FILE??'data/synthetic-grant.json'),watch:{url:process.env.UPTIME_WATCH_SLACK_URL??process.env.UPTIME_WATCH_WEBHOOK_URL,slack:Boolean(process.env.UPTIME_WATCH_SLACK_URL),afterMs:process.env.UPTIME_WATCH_AFTER_MS,repeatMs:process.env.UPTIME_WATCH_REPEAT_MS},signal:controller.signal});
}
