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
import {httpAssertions} from './http-assertions.mjs'
// @ts-ignore Shared evidence limits.
import {MAX_BODY} from './policy.mjs'
// runnerVersion names the evidence protocol the validator accepts; the User-Agent names this release.
const EVIDENCE_VERSION='uptime-worker/0.1.0',USER_AGENT=`uptime-worker/${seed.version}`
const BUDGET_REASON='Not checked: this scheduled run reached its outbound request budget. This is not a target failure.'
export async function boundedBody(response:Response,max:number){
 const reader=response.body?.getReader();if(!reader)return {body:'',bytes:0};
 const chunks:Uint8Array[]= [];let bytes=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max)throw new ProbeError('body-limit');chunks.push(value)}}finally{await reader.cancel()}
 const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength}
 return {body:new TextDecoder().decode(all),bytes}
}
interface ProbeContext {dns:PublicDNS;allowance:Allowance;appOrigin?:string;statusOnly?:boolean;snapshotPolicy?:{masks:string[]}}
async function publicResponse(def:any,signal:AbortSignal,{dns,allowance,appOrigin,statusOnly,snapshotPolicy}:ProbeContext){
 let url=publicTarget(def.url),method=def.method;const redirects:string[]=[];
 for(let hop=0;hop<=5;hop++){
  // Existing revisions and redirects must not mistake Workers' self-fetch 404 for target evidence.
  if(ownOrigin(url.href,appOrigin))throw new ProbeError('runner');
  await dns(url,signal,allowance);
  allowance.spend();
  const response=await fetchDemoRead(url.href,{method,redirect:'manual',signal,headers:{'user-agent':USER_AGENT,accept:'application/json,text/plain,*/*;q=0.1','accept-encoding':'identity'},cache:'no-store'});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();
   if(hop===5||!location)throw new ProbeError('redirect');
   let next;try{next=publicTarget(new URL(location,url).href)}catch{throw new ProbeError('network')}
   if(url.protocol==='https:'&&next.protocol!=='https:')throw new ProbeError('redirect');
   if(next.origin!==url.origin)method=method==='HEAD'?'HEAD':'GET';
   else if(response.status===303||(method==='POST'&&[301,302].includes(response.status)))method='GET';
   if(!redirects.length)redirects.push(url.href);redirects.push(next.href);url=next;continue;
  }
  const headers=Object.fromEntries(response.headers);
  if(statusOnly){await response.body?.cancel();return {status:response.status,headers,body:'',bytes:0}}
  if(headers['content-encoding']&&headers['content-encoding']!=='identity'){await response.body?.cancel();throw new ProbeError('encoding')}
  const payload=await boundedBody(response,MAX_BODY);
  return {status:response.status,headers,...payload,...(snapshotPolicy?{failureSnapshot:tryCaptureFailureSnapshot({method,url:url.href,redirects,requestHeaders:{'user-agent':USER_AGENT,accept:'application/json,text/plain,*/*;q=0.1','accept-encoding':'identity'},responseHeaders:headers,status:response.status,body:payload.body,durationMs:0,masks:snapshotPolicy.masks})}:{})};
 }
 throw new ProbeError('redirect');
}
const runnerErrors=['dns','network','runner','budget','vantage']
export async function workerProbe(def:any,probe:string,context:ProbeContext){
 const startedAt=Date.now(),signal=AbortSignal.timeout(def.timeoutMs);
 const evidence=(data:any,completedAt=Date.now())=>({id:crypto.randomUUID(),probe,startedAt,completedAt,durationMs:completedAt-startedAt,runnerVersion:EVIDENCE_VERSION,...data});
 try{
  if(def.tlsTrust)throw new ProbeError('vantage','This certificate trust setting requires a private runner; the Cloudflare Worker cannot apply it.');
  const response=await publicResponse(def,signal,context),completedAt=Date.now(),checks=httpAssertions(def,response,completedAt-startedAt);
  return evidence({...(checks.some((check:any)=>!check.pass)&&'failureSnapshot' in response?{failureSnapshot:response.failureSnapshot&&'unavailable' in response.failureSnapshot?response.failureSnapshot:{...response.failureSnapshot,durationMs:completedAt-startedAt}}:{}),outcome:checks.every((check:any)=>check.pass)?'pass':'target_failure',status:response.status,bytes:response.bytes,checks},completedAt);
 }catch(error){
  const category=error instanceof BudgetExhausted?'budget':signal.aborted||(error as Error)?.name==='TimeoutError'?'timeout':error instanceof ProbeError?error.category:'connection';
  const reason=category==='runner'?SELF_CHECK_REFUSAL:category==='budget'?BUDGET_REASON:error instanceof ProbeError&&error.reason?error.reason:`Probe ${category} check failed`;
  const completedAt=Date.now();
  return evidence({...(context.snapshotPolicy&&!context.statusOnly&&!runnerErrors.includes(category)?{failureSnapshot:tryCaptureFailureSnapshot({method:def.method,url:def.url,status:null,body:'',durationMs:completedAt-startedAt,masks:context.snapshotPolicy.masks})}:{}),outcome:runnerErrors.includes(category)?'runner_error':'target_failure',checks:[{assertion:category,pass:false,reason}]},completedAt);
 }
}
