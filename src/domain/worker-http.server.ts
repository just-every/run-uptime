import {fetchDemoRead} from '../base/modules/demo/index.mjs'
// Hosted public probes use Workers' public Internet fetch transport (no VPC binding).
// Node runners retain socket pinning for their separately authorized networks.
// @ts-ignore Shared public-address policy.
import {publicTarget,publicAddress} from './public-target.mjs'
// @ts-ignore Shared assertion policy.
import {httpAssertions} from './http-assertions.mjs'
// @ts-ignore Shared evidence limits.
import {MAX_BODY} from './policy.mjs'
class ProbeError extends Error {constructor(readonly category:string){super(category)}}
async function boundedBody(response:Response,max:number){
 const reader=response.body?.getReader();if(!reader)return {body:'',bytes:0};
 const chunks:Uint8Array[]= [];let bytes=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max)throw new ProbeError('body-limit');chunks.push(value)}}finally{await reader.cancel()}
 const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength}
 return {body:new TextDecoder().decode(all),bytes}
}
async function publicDNS(url:URL,signal:AbortSignal){
 const host=url.hostname.replace(/^\[|\]$/g,'');
 if(host.includes(':')||/^[0-9.]+$/.test(host)){if(!publicAddress(host))throw new ProbeError('network');return}
 const answers=await Promise.all(['A','AAAA'].map(async type=>{
  const response=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{accept:'application/dns-json'},redirect:'manual',signal});
  if(!response.ok){await response.body?.cancel();throw new ProbeError('dns')}
  const data=JSON.parse((await boundedBody(response,16384)).body);
  if(![0,3].includes(data.Status)||data.TC)throw new ProbeError('dns');
  return (data.Answer??[]).filter((row:any)=>[1,28].includes(row.type)).map((row:any)=>row.data);
 }));
 const addresses=answers.flat();if(!addresses.length)throw new ProbeError('dns');
 if(addresses.some(address=>!publicAddress(address)))throw new ProbeError('network');
}
async function publicResponse(def:any,signal:AbortSignal,statusOnly:boolean){
 let url=publicTarget(def.url),method=def.method;
 for(let hop=0;hop<=5;hop++){
  await publicDNS(url,signal);
  const response=await fetchDemoRead(url.href,{method,redirect:'manual',signal,headers:{'user-agent':'uptime-worker/0.1.0',accept:'application/json,text/plain,*/*;q=0.1','accept-encoding':'identity'},cache:'no-store'});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();
   if(hop===5||!location)throw new ProbeError('redirect');
   let next;try{next=publicTarget(new URL(location,url).href)}catch{throw new ProbeError('network')}
   if(url.protocol==='https:'&&next.protocol!=='https:')throw new ProbeError('redirect');
   if(next.origin!==url.origin)method=method==='HEAD'?'HEAD':'GET';
   else if(response.status===303||(method==='POST'&&[301,302].includes(response.status)))method='GET';
   url=next;continue;
  }
  const headers=Object.fromEntries(response.headers);
  if(statusOnly){await response.body?.cancel();return {status:response.status,headers,body:'',bytes:0}}
  if(headers['content-encoding']&&headers['content-encoding']!=='identity'){await response.body?.cancel();throw new ProbeError('encoding')}
  return {status:response.status,headers,...await boundedBody(response,MAX_BODY)};
 }
 throw new ProbeError('redirect');
}
export async function workerProbe(def:any,probe:string,{statusOnly=false}:{statusOnly?:boolean}={}){
 const startedAt=Date.now(),signal=AbortSignal.timeout(def.timeoutMs);
 const evidence=(data:any,completedAt=Date.now())=>({id:crypto.randomUUID(),probe,startedAt,completedAt,durationMs:completedAt-startedAt,runnerVersion:'uptime-worker/0.1.0',...data});
 try{
  const response=await publicResponse(def,signal,statusOnly),completedAt=Date.now(),checks=httpAssertions(def,response,completedAt-startedAt);
  return evidence({outcome:checks.every((check:any)=>check.pass)?'pass':'target_failure',status:response.status,bytes:response.bytes,checks},completedAt);
 }catch(error){const category=signal.aborted?'timeout':error instanceof ProbeError?error.category:'connection';return evidence({outcome:['dns','network'].includes(category)?'runner_error':'target_failure',checks:[{assertion:category,pass:false,reason:`Probe ${category} check failed`}]})}
}
