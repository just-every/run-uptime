import {connect} from 'cloudflare:sockets'
type Socket=ReturnType<typeof connect>
import {fetchDemoRead} from '@runeditrun/rer/modules/demo'
import {BudgetExhausted,type Allowance} from './worker-budget.ts'
import {boundedBody} from './worker-http.server.ts'
// @ts-ignore Shared public-address policy.
import {publicAddress,publicTarget} from './public-target.mjs'
// @ts-ignore Shared protocol evaluation (also run by the runner and by evidence validation).
import {protocolChecks} from './protocol/evaluate.mjs'
// @ts-ignore
import {dnsFacts} from './protocol/dns.mjs'
// @ts-ignore
import {domainFacts} from './protocol/rdap.mjs'
// @ts-ignore
import {ProtocolError} from './protocol/protocol-error.mjs'
// @ts-ignore
import {cloudflareAddress} from './protocol/cloudflare-ranges.mjs'
// @ts-ignore
import {certificateCovers} from './protocol/hostname.mjs'
// @ts-ignore
import {clientHello,readCertificates,HandshakeError} from './protocol/tls12-certificates.mjs'
// @ts-ignore
import {certificateFacts} from './protocol/x509.mjs'
// The Cloudflare Worker's TCP, TLS, DNS and domain checks. What a Worker can do, measured on the RunEditRun account on
// 17 October 2026 (work/sd-uptime-r19/evidence/worker-sockets.md): connect() reaches public addresses and verifies TLS
// certificates, but it cannot reach Cloudflare's own addresses, exposes no certificate, and reports a refused port with
// the same "proxy request failed" error as an address it may not reach. So the Worker resolves the target itself, refuses
// addresses it cannot reach before connecting (Unknown here, never a target failure), connects to the validated address,
// and reads a certificate from a TLS 1.2 handshake it does not complete.
const EVIDENCE_VERSION='uptime-worker/0.1.0',USER_AGENT='uptime-worker'
const VANTAGE_CLOUDFLARE='Cloudflare Workers cannot open sockets to Cloudflare addresses, and this host resolves to one. A private runner can check it; this vantage reports Unknown.'
const targetCategories=['refused','timeout','connection','unresolved','tls']
interface Context{allowance:Allowance;signal:AbortSignal}
const timeout=(signal:AbortSignal)=>new Promise<never>((_,reject)=>{if(signal.aborted)reject(new ProtocolError('timeout','No answer within the timeout'));signal.addEventListener('abort',()=>reject(new ProtocolError('timeout','No answer within the timeout')),{once:true})})
// A host's public addresses through Cloudflare DNS over HTTPS: every answer must be public, and none may be Cloudflare's.
async function addresses(host:string,{allowance,signal}:Context){
 if(host.includes(':')||/^[0-9.]+$/.test(host)){if(!publicAddress(host))throw new ProtocolError('network','The host is an address this check never contacts');if(cloudflareAddress(host))throw new ProtocolError('vantage',VANTAGE_CLOUDFLARE);return [host]}
 const found:string[]=[];let nxdomain=false
 for(const type of ['A','AAAA']){
  allowance.spend()
  const response=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{accept:'application/dns-json'},redirect:'manual',signal})
  if(!response.ok){await response.body?.cancel();throw new ProtocolError('dns','The DNS resolver could not be read; this is not evidence about the target')}
  const data:any=JSON.parse((await boundedBody(response,16384)).body)
  if(![0,3].includes(data.Status)||data.TC)throw new ProtocolError('dns','The DNS resolver could not answer; this is not evidence about the target')
  nxdomain||=data.Status===3
  for(const row of data.Answer??[])if(row.type===(type==='A'?1:28))found.push(row.data)
 }
 if(!found.length)throw new ProtocolError('unresolved',nxdomain?'DNS: the host name does not exist (NXDOMAIN)':'DNS: the host name has no A or AAAA records')
 if(found.some(a=>!publicAddress(a)))throw new ProtocolError('network','The host resolves to an address this check never contacts')
 if(found.some(cloudflareAddress))throw new ProtocolError('vantage',VANTAGE_CLOUDFLARE)
 return found.sort((a,b)=>Number(a.includes(':'))-Number(b.includes(':')))
}
// After the address checks, a proxy failure is the target refusing (or not accepting) the connection.
const refused=(address:string,port:number)=>new ProtocolError('refused',`Connection refused: the Worker's socket could not connect to ${address}:${port}`)
async function open(socket:Socket,address:string,port:number,signal:AbortSignal){
 try{await Promise.race([socket.opened,timeout(signal)])}catch(error){if(error instanceof ProtocolError)throw error;throw refused(address,port)}
}
const printable=(text:string)=>text.replace(/[\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim()
async function tcpFacts(s:any,context:Context,deadline:number){
 const [address]=await addresses(s.host,context),started=Date.now()
 context.allowance.spend()
 const socket=connect({hostname:address,port:s.port})
 try{
  await open(socket,address,s.port,context.signal)
  const facts:any={address,connectMs:Date.now()-started}
  if(!s.readBanner)return facts
  const wait=Math.max(0,Math.min(2000,deadline-Date.now()-25)),reader=socket.readable.getReader()
  const first=await Promise.race([reader.read().then(r=>r.done?{note:'the server closed the connection without a banner'}:{text:printable(new TextDecoder().decode(r.value.subarray(0,512))).slice(0,256)},()=>({note:'the server closed the connection without a banner'})),new Promise<{note:string}>(resolve=>setTimeout(()=>resolve({note:`no banner within ${wait} ms`}),wait))])
  return 'text' in first&&first.text?{...facts,banner:first.text}:{...facts,bannerNote:'note' in first?first.note:'no banner'}
 }finally{socket.close().catch(()=>{})}
}
async function tlsFacts(s:any,context:Context){
 const [address]=await addresses(s.host,context),literal=s.host.includes(':')||/^[0-9.]+$/.test(s.host),started=Date.now()
 context.allowance.spend()
 const plain=connect({hostname:address,port:s.port})
 let der:Uint8Array[]
 try{
  await open(plain,address,s.port,context.signal)
  const writer=plain.writable.getWriter();await writer.write(clientHello(literal?'':s.host));writer.releaseLock()
  der=await Promise.race([readCertificates(plain.readable.getReader()),timeout(context.signal)])
 }catch(error:any){
  if(error instanceof HandshakeError&&/protocol version/.test(error.message))throw new ProtocolError('vantage','This server accepts only TLS 1.3, which encrypts its certificate, so the Cloudflare Worker cannot read it. A private runner can check it; this vantage reports Unknown.')
  if(error instanceof HandshakeError)throw new ProtocolError('tls',`TLS handshake failed: ${error.message}`)
  throw error
 }finally{plain.close().catch(()=>{})}
 const handshakeMs=Date.now()-started,certificate=await certificateFacts(der[0]),now=Date.now()
 const hostnameMatch=certificateCovers(certificate.dnsNames.length?certificate.dnsNames:[certificate.subject.cn??''],s.host)
 // The Worker's own verified connection (chain, name and dates): it either completes or fails without saying why.
 context.allowance.spend()
 const secure=connect({hostname:s.host,port:s.port},{secureTransport:'on',allowHalfOpen:false})
 let verified=true
 try{await Promise.race([secure.opened,timeout(context.signal)])}catch(error){if(error instanceof ProtocolError)throw error;verified=false}finally{secure.close().catch(()=>{})}
 if(verified&&!hostnameMatch)throw new ProtocolError('vantage','This server shows a TLS 1.2 client a different certificate from the one it verifies, so the Cloudflare Worker cannot read the certificate in use. A private runner can check it; this vantage reports Unknown.')
 const explained=!hostnameMatch||now<certificate.notBefore||now>certificate.notAfter
 return {address,handshakeMs,certificate,chainLength:Math.min(der.length,10),trusted:verified?true:explained?null:false,hostnameMatch,
  ...(!verified&&!explained?{verifyError:'the Worker’s certificate verification failed: an untrusted or incomplete chain'}:{})}
}
// Bounded reads for the shared DNS over HTTPS and RDAP code. Every hop's address is checked like a probe target's.
function reader(context:Context){
 return async(url:string,{accept,maxBytes}:{accept:string;maxBytes:number})=>{
  let target=publicTarget(url)
  for(let hop=0;hop<=3;hop++){
   if(target.protocol!=='https:')throw new ProtocolError('registry','A registry link left HTTPS')
   if(!['cloudflare-dns.com','dns.google'].includes(target.hostname))await addresses(target.hostname,context).catch(error=>{if(error instanceof ProtocolError&&error.category==='vantage')return;throw error})
   context.allowance.spend()
   const response=await fetchDemoRead(target.href,{headers:{accept,'user-agent':USER_AGENT},redirect:'manual',signal:context.signal,cache:'no-store'})
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)break;target=publicTarget(new URL(location,target).href);continue}
   return {status:response.status,text:(await boundedBody(response,maxBytes)).body}
  }
  throw new ProtocolError('registry','The registry redirected too often')
 }
}
export async function workerProtocolProbe(def:any,probe:string,allowance:Allowance){
 const startedAt=Date.now(),signal=AbortSignal.timeout(def.timeoutMs),context={allowance,signal}
 const evidence=(data:any,completedAt=Date.now())=>({id:crypto.randomUUID(),probe,startedAt,completedAt,durationMs:completedAt-startedAt,runnerVersion:EVIDENCE_VERSION,...data})
 try{
  const s=def[def.type]
  const facts=def.type==='tcp'?await tcpFacts(s,context,startedAt+def.timeoutMs):def.type==='tls'?await tlsFacts(s,context):def.type==='dns'?await dnsFacts(reader(context),s):await domainFacts(reader(context),s.name)
  const completedAt=Date.now()
  return evidence({...protocolChecks(def,facts,completedAt),protocol:facts},completedAt)
 }catch(error:any){
  const category=error instanceof BudgetExhausted?'budget':error instanceof ProtocolError?error.category:signal.aborted?'timeout':'runner'
  const reason=category==='budget'?'Not checked: this scheduled run reached its outbound request budget. This is not a target failure.':error?.reason??(category==='timeout'?'No answer within the timeout':'The Cloudflare Worker could not perform this check')
  return evidence({outcome:targetCategories.includes(category)?'target_failure':'runner_error',checks:[{assertion:category,pass:false,reason}]})
 }
}
/** Outbound requests one attempt can use, for the scheduled run's budget. */
export function protocolRequests(def:any){
 return def.type==='tcp'?3:def.type==='tls'?4:def.type==='dns'?def.dns.resolvers.length:9
}
