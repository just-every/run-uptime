import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {CredentialBindingRequired} from './credential-diagnostic.mjs';
import {RUNNER_VERSION,MAX_BODY,validateDefinition} from '../../src/domain/policy.mjs';
import {publicHttp,ProbeError,PROBE_ACCEPT} from './public-http.mjs';
function assertions(def,response,durationMs){
  const a=def.assertions,{body,headers,status}=response;
  const checks=[{assertion:'status',pass:status===a.status,reason:'Expected HTTP status'}];
  if(a.bodyIncludes!==undefined)checks.push({assertion:'body',pass:body.includes(a.bodyIncludes),reason:'Body contains required text'});
  if(a.header)checks.push({assertion:'header',pass:headers[a.header.name.toLowerCase()]===a.header.equals,reason:'Header equals required value'});
  if(a.json){let value;try{value=a.json.path.split('.').reduce((obj,key)=>obj?.[key],JSON.parse(body))}catch{}checks.push({assertion:'json',pass:value===a.json.equals,reason:'JSON value matches assertion'})}
  if(a.latencyMs)checks.push({assertion:'latency',pass:durationMs<=a.latencyMs,reason:'Response within required time'});
  return checks;
}
function syntheticHttp(def,signal,onRequest){
  if(!def.fixtureIdentity)throw new ProbeError('custody');
  return new Promise((resolve,reject)=>{
    let size=0,chunks=[];
    const fail=category=>reject(new ProbeError(category));
    const req=http.request(def.url,{method:def.method,agent:new http.Agent({keepAlive:false,proxyEnv:{}}),signal,headers:{'User-Agent':RUNNER_VERSION,'Accept':PROBE_ACCEPT}},res=>{
      if(res.headers['x-uptime-fixture']!==def.fixtureIdentity){fail('custody');res.destroy();return}
      if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){fail('encoding');res.destroy();return}
      if(res.statusCode>=300&&res.statusCode<400){fail('redirect');res.destroy();return}
      res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){fail('body-limit');res.destroy()}else chunks.push(chunk)});
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),bytes:size}));
      res.on('error',()=>fail('transport'));
    });req.on('error',()=>fail(signal.aborted?'timeout':'connection'));req.on('close',()=>req.agent.destroy());onRequest(req);req.end();
  });
}
export function probeHeartbeat(def,probe,receipt){
  const now=Date.now(),receivedAt=receipt?.receivedAt;
  const pass=Number.isFinite(receivedAt)&&receivedAt<=now&&now-receivedAt<=def.heartbeat.maxAgeMs;
  return {id:randomUUID(),probe,startedAt:now,completedAt:now,durationMs:0,runnerVersion:RUNNER_VERSION,outcome:pass?'pass':'target_failure',...(Number.isFinite(receivedAt)?{heartbeatReceivedAt:receivedAt}:{}),checks:[{assertion:'heartbeat',pass,reason:pass?'Authenticated receipt is fresh':'Authenticated receipt absent or stale'}]};
}
// statusOnly is for the external canary: it asserts the status alone, so the page's body is never read, bounded or kept.
export async function probeHttp(input,probe,grants=[],{statusOnly=false,monitorId,signal}={}) {
  const def=validateDefinition(input,grants),startedAt=Date.now();
  if(statusOnly&&(def.network!=='public'||Object.keys(def.assertions).some(key=>key!=='status')))throw Error('Status-only reads serve public status assertions only');
  if(def.type==='heartbeat')throw Error('Heartbeat requires a signed scheduled receipt snapshot');
  const abort=new AbortController();let active;
  const executionSignal=signal?AbortSignal.any([signal,abort.signal]):abort.signal;
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();active?.destroy();reject(new ProbeError('timeout'))},def.timeoutMs)});
  try{
    const response=await Promise.race([timeout,def.network==='public'?publicHttp(def,executionSignal,r=>active=r,{statusOnly,monitorId}):syntheticHttp({...def,fixtureIdentity:input.fixtureIdentity},executionSignal,r=>active=r)]);
    const completedAt=Date.now(),checks=assertions(def,response,completedAt-startedAt);
    return evidence({outcome:checks.every(c=>c.pass)?'pass':'target_failure',status:response.status,bytes:response.bytes,checks},completedAt);
  }catch(error){if(error instanceof CredentialBindingRequired)return evidence({outcome:'runner_error',credentialBinding:error.diagnostic,checks:[{assertion:'credential',pass:false,reason:error.message}]});const category=error instanceof ProbeError?error.category:'runner';return evidence({outcome:['custody','runner','network','dns'].includes(category)?'runner_error':'target_failure',checks:[{assertion:category,pass:false,reason:'Probe '+category+' check failed'}]})}
  finally{clearTimeout(timer);abort.abort();active?.destroy()}
  function evidence(data,completedAt=Date.now()){return {id:randomUUID(),probe,startedAt,completedAt,durationMs:completedAt-startedAt,runnerVersion:RUNNER_VERSION,...data}}
}
