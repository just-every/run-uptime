// Worker DNS validation through Cloudflare DNS over HTTPS. Workers fetch then resolves on its own (no pinning): this
// rejects private answers and reports a name that does not resolve; Cloudflare egress is the transport boundary.
// @ts-ignore Shared public-address policy.
import {publicAddress} from './public-target.mjs'
import type {Allowance} from './worker-budget.ts'
export class ProbeError extends Error {constructor(readonly category:string,readonly reason?:string){super(category)}}
async function dnsJson(response:Response){
 const reader=response.body?.getReader();if(!reader)return {};
 let text='',bytes=0;const decoder=new TextDecoder();
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384)throw new ProbeError('dns');text+=decoder.decode(value,{stream:true})}}finally{await reader.cancel()}
 return JSON.parse(text+decoder.decode());
}
async function lookup(host:string,signal:AbortSignal,allowance:Allowance){
 const answers=await Promise.all(['A','AAAA'].map(async type=>{
  allowance.spend();
  const response=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{accept:'application/dns-json'},redirect:'manual',signal});
  if(!response.ok){await response.body?.cancel();throw new ProbeError('dns')}
  const data=await dnsJson(response);
  // NOERROR and NXDOMAIN are answers about the name; SERVFAIL, REFUSED or truncation say nothing about the target.
  if(![0,3].includes(data.Status)||data.TC)throw new ProbeError('dns');
  return {nxdomain:data.Status===3,addresses:(data.Answer??[]).filter((row:any)=>[1,28].includes(row.type)).map((row:any)=>row.data as string)};
 }));
 const addresses=answers.flatMap(answer=>answer.addresses);
 if(!addresses.length)throw new ProbeError('unresolved',answers.some(answer=>answer.nxdomain)?'DNS: the hostname does not exist (NXDOMAIN)':'DNS: the hostname has no A or AAAA records');
 if(addresses.some(address=>!publicAddress(address)))throw new ProbeError('network');
}
/** One scheduled run validates each hostname once; retries and shared canaries reuse the answer. */
export function dnsCache(){
 const seen=new Map<string,Promise<void>>();
 return (url:URL,signal:AbortSignal,allowance:Allowance)=>{
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(host.includes(':')||/^[0-9.]+$/.test(host))return publicAddress(host)?Promise.resolve():Promise.reject(new ProbeError('network'));
  let pending=seen.get(host);
  // A budget refusal or timeout is about this run, not the name: the next caller looks it up again.
  if(!pending){pending=lookup(host,signal,allowance);seen.set(host,pending);pending.catch(error=>{if(!(error instanceof ProbeError)||error.category==='dns')seen.delete(host)})}
  return pending;
 };
}
export type PublicDNS=ReturnType<typeof dnsCache>
