import {normalizeNetworkDiagnostics} from './network-diagnostics.mjs'
import {tryCaptureFailureSnapshot} from './failure-snapshot.mjs'
import {fetchDemoRead} from '@runeditrun/rer/modules/demo'
// Hosted public probes use Workers' public Internet fetch transport (no VPC binding).
// Node runners retain socket pinning for their separately authorized networks.
import {ownOrigin,SELF_CHECK_REFUSAL} from './hosted-runner.ts'
import {ProbeError,type PublicDNS} from './worker-dns.server.ts'
import {BudgetExhausted,type Allowance} from './worker-budget.ts'
import seed from '../../seed.json' with {type:'json'}
// @ts-ignore Shared public-address policy.
import {publicTarget} from './public-target.mjs'
// @ts-ignore Shared assertion policy.
import {statusAssertion} from './http-assertions/status.mjs'
// @ts-ignore Provider evidence semantics are shared with signed Node probes.
import {isDependencyStatus,dependencyMissingCheck} from './dependency-status-policy.mjs'
// @ts-ignore Shared evidence limits.
import {MAX_BODY} from './http-assertions/limits.mjs'
// runnerVersion names the evidence protocol the validator accepts; the User-Agent names this release.
const EVIDENCE_VERSION='uptime-worker/0.1.0',USER_AGENT=`uptime-worker/${seed.version}`
const BUDGET_REASON='Not checked: this scheduled run reached its outbound request budget. This is not a target failure.'
export async function boundedBody(response:Response,max:number,onPartial?:(body:string)=>void){
 const reader=response.body?.getReader();if(!reader)return {body:'',bytes:0};
 const chunks:Uint8Array[]= [];let bytes=0;
 const prefix=()=>{const all=new Uint8Array(Math.min(bytes,max));let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}return new TextDecoder().decode(all)};
 try{for(;;){const {value,done}=await reader.read();if(done)break;const before=bytes;bytes+=value.byteLength;chunks.push(value.subarray(0,Math.max(0,max-before)));if(bytes>max)throw new ProbeError('body-limit')}}catch(error){onPartial?.(prefix());throw error}finally{await reader.cancel()}
 const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength}
 return {body:new TextDecoder().decode(all),bytes}
}
interface ProbeContext {dns:PublicDNS;allowance:Allowance;appOrigin?:string;userAgent?:string;statusOnly?:boolean;snapshotPolicy?:{masks:string[];version?:number;safeValues?:any;screenshot?:boolean};capture?:any}
async function publicResponse(def:any,signal:AbortSignal,{dns,allowance,appOrigin,userAgent=USER_AGENT,statusOnly,capture={}}:ProbeContext){
 let url=publicTarget(def.url),method=def.method;const redirects:string[]=[];
 for(let hop=0;hop<=5;hop++){
  // Existing revisions and redirects must not mistake Workers' self-fetch 404 for target evidence.
  if(ownOrigin(url.href,appOrigin))throw new ProbeError('runner');
  capture.url=url.href;capture.method=method;capture.redirects=redirects;capture.status=null;capture.responseHeaders={};capture.body='';
  const resolving=Date.now();try{await dns(url,signal,allowance)}finally{capture.phases.dnsMs=Date.now()-resolving}
  allowance.spend();
  const sending=Date.now();
  capture.requestHeaders={'user-agent':userAgent,accept:'application/json,text/plain,*/*;q=0.1','accept-encoding':'identity'};
  const response=await fetchDemoRead(url.href,{method,redirect:'manual',signal,headers:capture.requestHeaders,cache:'no-store'});
  capture.phases.ttfbMs=Date.now()-sending;capture.status=response.status;capture.responseHeaders=Object.fromEntries(response.headers);
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();
   if(!statusOnly&&isDependencyStatus(def))throw new ProbeError('redirect');
   if(hop===5||!location)throw new ProbeError('redirect');
   let next;try{next=publicTarget(new URL(location,url).href)}catch{throw new ProbeError('network')}
   if(url.protocol==='https:'&&next.protocol!=='https:')throw new ProbeError('redirect');
   if(next.origin!==url.origin)method=method==='HEAD'?'HEAD':'GET';
   else if(response.status===303||(method==='POST'&&[301,302].includes(response.status)))method='GET';
   if(!redirects.length)redirects.push(url.href);redirects.push(next.href);url=next;continue;
  }
  const headers=capture.responseHeaders;
  if(statusOnly){await response.body?.cancel();return {status:response.status,headers,body:'',bytes:0}}
  if(headers['content-encoding']&&headers['content-encoding']!=='identity'){await response.body?.cancel();throw new ProbeError('encoding')}
  const payload=await boundedBody(response,MAX_BODY,body=>capture.body=body);capture.body=payload.body;
  return {status:response.status,headers,...payload};
 }
 throw new ProbeError('redirect');
}
const runnerErrors=['dns','network','runner','budget','vantage']
export async function workerProbe(def:any,probe:string,context:ProbeContext){
 const startedAt=Date.now(),signal=AbortSignal.timeout(def.timeoutMs),capture:any={phases:{dnsMs:null,connectMs:null,tlsMs:null,ttfbMs:null,totalMs:0}};
 const evidence=(data:any,completedAt=Date.now())=>{capture.phases.totalMs=completedAt-startedAt;return ({id:crypto.randomUUID(),probe,startedAt,completedAt,durationMs:completedAt-startedAt,runnerVersion:EVIDENCE_VERSION,...data,...(data.failureSnapshot&&!data.failureSnapshot.unavailable?{failureSnapshot:{...data.failureSnapshot,phases:capture.phases}}:{})})};
 try{
  if(def.tlsTrust)throw new ProbeError('vantage','This certificate trust setting requires a private runner; the Cloudflare Worker cannot apply it.');
  if(def.catalog&&!context.statusOnly){
   const [{probeFollowed},{workerReport}]=await Promise.all([
    // @ts-ignore Shared with the Node runner.
    import('./service-catalog/followed.mjs'),
    import('./worker-discovery.server.ts'),
   ]);
   return await probeFollowed(def,probe,{transport:workerReport(context.appOrigin,{dns:context.dns,allowance:context.allowance}),runnerVersion:EVIDENCE_VERSION});
  }
  const response=await publicResponse(def,signal,{...context,capture}),completedAt=Date.now();
  // @ts-ignore Only provider monitors need to interpret JSON claim paths.
  const missing=!context.statusOnly&&isDependencyStatus(def)&&(await import('./dependency-status.mjs')).missingDependencyEvidence(def,response);
  if(missing)return evidence({outcome:'runner_error',checks:[missing]},completedAt);
  const checks=Object.keys(def.assertions).every(key=>key==='status')?
   [statusAssertion(response.status,def.assertions.status)]:
   // @ts-ignore The full ordered assertion bundle is shared with the Node runner.
   (await import('./http-assertions.mjs')).httpAssertions(def,response,completedAt-startedAt);
  const pass=checks.every((check:any)=>check.pass),policy=context.snapshotPolicy;
  const failureSnapshot=!pass&&policy&&!context.statusOnly?tryCaptureFailureSnapshot({
   ...capture,durationMs:completedAt-startedAt,masks:policy.masks,safeValues:policy.safeValues,
   policyVersion:policy.version,...(policy.screenshot?{screenshot:{unavailable:'browser_unavailable'}}:{}),
  }):undefined;
  // A short numeric error label remains safe after the redacted snapshot expires.
  const errorCode=failureSnapshot&&'body' in failureSnapshot
   ? /\berror(?:\s+code)?\s*:?\s*(1\d{3})\b/i.exec(failureSnapshot.body.replace(/<[^>]*>/g,' '))?.[1]
   : undefined;
  for(const check of checks)if(check.assertion==='status'&&!check.pass)check.reason=`HTTP ${response.status} is outside the expected status or range${errorCode?`; error code ${errorCode}`:''}`;
  return evidence({outcome:pass?'pass':'target_failure',status:response.status,bytes:response.bytes,checks,...(failureSnapshot?{failureSnapshot}:{})},completedAt);
 }catch(error){
  const category=error instanceof BudgetExhausted?'budget':signal.aborted||(error as Error)?.name==='TimeoutError'?'timeout':error instanceof ProbeError?error.category:'connection';
  const reason=category==='runner'?SELF_CHECK_REFUSAL:category==='budget'?BUDGET_REASON:error instanceof ProbeError&&error.reason?error.reason:`Probe ${category} check failed`;
  const completedAt=Date.now();
  if(!context.statusOnly&&!runnerErrors.includes(category)&&isDependencyStatus(def))return evidence({outcome:'runner_error',checks:[dependencyMissingCheck(def)]},completedAt);
  return evidence({...(context.snapshotPolicy&&!context.statusOnly&&!['network','runner','budget','vantage'].includes(category)?{failureSnapshot:tryCaptureFailureSnapshot({...capture,method:capture.method??def.method,url:capture.url??def.url,durationMs:completedAt-startedAt,masks:context.snapshotPolicy.masks,safeValues:context.snapshotPolicy.safeValues,policyVersion:context.snapshotPolicy.version,...(context.snapshotPolicy.screenshot?{screenshot:{unavailable:'browser_unavailable'}}:{}),...(['timeout','connection','transport','unresolved','dns','tls'].includes(category)?{diagnostics:normalizeNetworkDiagnostics({version:1,category,phases:{...capture.phases,totalMs:completedAt-startedAt},route:{tool:'unavailable',reason:'hosted-transport',hops:[]}})}:{})})}:{}),outcome:runnerErrors.includes(category)?'runner_error':'target_failure',checks:[{assertion:category,pass:false,reason}]},completedAt);
 }
}
