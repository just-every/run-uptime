import {fetchDemoRead} from '@runeditrun/rer/modules/demo'
import {HOSTED_RUNNER_ID,hostedInstallation,ownOrigin} from './hosted-runner.ts'
import {dnsCache,ProbeError as WorkerProbeError} from './worker-dns.server.ts'
import {SubrequestBudget} from './worker-budget.ts'
import type {Runner} from './runner-registration.server.ts'
import type {Bindings} from './control.server.ts'
// @ts-ignore Edition URL validation is JavaScript.
import {publicTarget} from './public-target.mjs'
// @ts-ignore Shared with the runner; edition JavaScript.
import {validateDiscoveryResult} from './discovery-result.mjs'
// @ts-ignore The runner's discovery crawl; it fetches only through the transport it is given.
import {discover} from '../../runners/src/discovery/index.mjs'
// @ts-ignore The runner's failure wording, so a Worker answer reads like a runner's.
import {failureText} from '../../runners/src/discovery-loop.mjs'
// @ts-ignore Shared with the runner transport, so discovery reads the Worker's failures as its own.
import {PROBE_ACCEPT,ProbeError} from '../../runners/src/probe-error.mjs'
// A hosted demo has no private runner beside it, so the Worker answers the visitor's "check this website" itself, with the
// runner's own crawl and limits, the way it already runs the demo's scheduled public checks. Production keeps runners.
export const workerDiscovery=(env:Bindings)=>env.RER_DEMO==='1'&&hostedInstallation(env)
// Discovery's 25 requests plus a DNS-over-HTTPS pair for each of its 10 hosts.
const SUBREQUESTS=50,RUN_LIMIT_MS=100_000
type ReportOptions={signal?:AbortSignal;accept?:string;userAgent:string;maxBody:number;method?:string;maxHops?:number;hopTimeoutMs?:number;
 beforeRequest?:(url:URL,hop:number)=>Promise<void>|void;followRedirect?:(next:URL,from:URL,status:number)=>boolean}
async function truncatedBody(response:Response,max:number){
 const reader=response.body?.getReader();if(!reader)return {body:'',bytes:0,truncated:false};
 const chunks:Uint8Array[]=[];let bytes=0,truncated=false;
 try{for(;;){const {value,done}=await reader.read();if(done)break;if(bytes+value.byteLength>max){chunks.push(value.subarray(0,max-bytes));bytes=max;truncated=true;break}bytes+=value.byteLength;chunks.push(value)}}finally{await reader.cancel()}
 const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength}
 return {body:new TextDecoder().decode(all),bytes,truncated}
}
// The Worker's twin of the runner's publicReport: GET or HEAD only, no credentials, cookies or body; every hop's name is
// validated as public before it is fetched, an HTTPS to HTTP downgrade is refused, and a body past maxBody is cut there.
export function workerReport(appOrigin?:string){
 const dns=dnsCache(),allowance=new SubrequestBudget(SUBREQUESTS).reserve(SUBREQUESTS)!
 return async(rawUrl:string,{signal,accept=PROBE_ACCEPT,userAgent,maxBody,method='GET',maxHops=4,hopTimeoutMs=8000,beforeRequest,followRedirect}:ReportOptions)=>{
  if(!['GET','HEAD'].includes(method))throw new ProbeError('method')
  if(!Number.isInteger(maxBody)||maxBody<1||typeof userAgent!=='string'||!userAgent)throw new ProbeError('runner')
  let url:URL=publicTarget(rawUrl)
  const hops:{url:string;status:number;durationMs:number}[]=[],base=signal??new AbortController().signal
  for(let hop=0;hop<=maxHops;hop++){
   base.throwIfAborted()
   if(ownOrigin(url.href,appOrigin))throw new ProbeError('runner')
   const resolving=Date.now()
   try{await dns(url,base,allowance)}catch(error){if(error instanceof WorkerProbeError)throw new ProbeError(error.category,error.reason);if(base.aborted)throw error;throw new ProbeError('dns')}
   const lookupMs=Date.now()-resolving
   await beforeRequest?.(url,hop)
   const hopSignal=AbortSignal.any([base,AbortSignal.timeout(hopTimeoutMs)]),started=Date.now()
   let response:Response
   try{allowance.spend();response=await fetchDemoRead(url.href,{method,redirect:'manual',signal:hopSignal,headers:{'user-agent':userAgent,accept,'accept-encoding':'identity'},cache:'no-store'})}
   catch{throw new ProbeError(hopSignal.aborted?'timeout':'connection')}
   const durationMs=lookupMs+Date.now()-started,headers=Object.fromEntries(response.headers)
   hops.push({url:url.href,status:response.status,durationMs})
   if([301,302,303,307,308].includes(response.status)){
    const location=response.headers.get('location');await response.body?.cancel()
    if(!location)throw new ProbeError('redirect')
    let next:URL;try{next=new URL(location,url);next.hash='';next=publicTarget(next.href)}catch{throw new ProbeError('network')}
    if(url.protocol==='https:'&&next.protocol!=='https:')throw new ProbeError('redirect')
    if(hop===maxHops||(followRedirect&&!followRedirect(next,url,response.status)))return {status:response.status,headers,body:'',bytes:0,truncated:false,redirect:next.href,url:url.href,hops,durationMs}
    url=next;continue
   }
   if(headers['content-encoding']&&headers['content-encoding']!=='identity'){await response.body?.cancel();throw new ProbeError('encoding')}
   return {status:response.status,headers,...await truncatedBody(response,maxBody),url:url.href,hops,durationMs}
  }
  throw new ProbeError('redirect')
 }
}
// Claims the job as the hosted Worker, crawls, and stores the answer exactly as a runner's signed answer is stored.
export async function answerInWorker(env:Bindings,id:string,url:string,complete:(answer:{result:unknown}|{error:string},runner:Runner)=>Promise<unknown>){
 const worker=await env.DB.prepare('SELECT * FROM runners WHERE runner_id=?').bind(HOSTED_RUNNER_ID).first<Runner>()
 if(!worker)throw Error('The hosted Worker runner is missing')
 await env.DB.prepare("UPDATE discovery_jobs SET status='running',claimed_at=?,runner_id=?,network_label=? WHERE id=? AND status='queued'").bind(Date.now(),worker.runner_id,worker.network_label,id).run()
 let answer:{result:unknown}|{error:string}
 try{answer={result:validateDiscoveryResult(await discover(url,{signal:AbortSignal.timeout(RUN_LIMIT_MS),transport:workerReport(env.UPTIME_ORIGIN)}))}}
 catch(error){answer={error:failureText(error,'Uptime could not check this website')}}
 await complete(answer,worker)
}
