import net from 'node:net';
import tls from 'node:tls';
import {randomUUID} from 'node:crypto';
import {RUNNER_VERSION,validateDefinition} from '../../src/domain/policy.mjs';
import {protocolChecks} from '../../src/domain/protocol/evaluate.mjs';
import {dnsFacts} from '../../src/domain/protocol/dns.mjs';
import {domainFacts} from '../../src/domain/protocol/rdap.mjs';
import {ProtocolError} from '../../src/domain/protocol/protocol-error.mjs';
import {readFramed} from '../../src/domain/protocol/dns-wire.mjs';
import {resolvePublic,publicReport,ProbeError} from './public-http.mjs';
// The runner's TCP, TLS, DNS and domain checks. Sockets connect only to the address the public resolver validated
// (resolvePublic pins it, as an HTTP probe's socket is pinned); DNS over HTTPS and RDAP reads go through publicReport's
// pinned, read-only, bounded GET. Refused, timed out and unresolved targets are target failures; a check this runner could
// not perform is a runner error and stays Unknown.
const targetCategories=['refused','timeout','connection','unresolved','tls'];
const pinned=host=>new URL(`https://${host.includes(':')?`[${host}]`:host}/`);
const printable=text=>text.replace(/[\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim();
function socketError(error,port){
 if(error instanceof ProtocolError)return error;
 if(error?.code==='ECONNREFUSED')return new ProtocolError('refused',`Connection refused on port ${port}: nothing accepted the connection`);
 if(['EHOSTUNREACH','ENETUNREACH'].includes(error?.code))return new ProtocolError('connection','No route to the host');
 if(error?.code==='ECONNRESET')return new ProtocolError('connection','The connection was reset during the check');
 if(error?.code==='EPROTO'||/^ERR_SSL|^ERR_TLS/.test(String(error?.code))||error?.library==='SSL routines')return new ProtocolError('tls',`TLS handshake failed: ${String(error.reason??error.code).slice(0,120)}`);
 return new ProtocolError('connection',`The connection failed (${String(error?.code??'error').slice(0,40)})`);
}
// Resolves once the socket reaches `event`, rejecting on error, close or abort.
function opened(socket,event,signal,port){
 return new Promise((resolve,reject)=>{
  const done=fn=>value=>{socket.off(event,ok);socket.off('error',bad);socket.off('close',closed);signal.removeEventListener('abort',aborted);fn(value)};
  const ok=done(resolve),bad=done(error=>reject(socketError(error,port))),closed=done(()=>reject(event==='secureConnect'?new ProtocolError('tls','The server closed the connection during the TLS handshake'):new ProtocolError('connection','The server closed the connection'))),aborted=done(()=>reject(new ProtocolError('timeout','No answer within the timeout')));
  socket.once(event,ok);socket.once('error',bad);socket.once('close',closed);signal.addEventListener('abort',aborted,{once:true});
 });
}
async function tcpFacts(s,signal,deadline){
 const pin=await resolvePublic(pinned(s.host),signal),started=Date.now();
 const socket=net.connect({host:pin.address,port:s.port,family:pin.family});
 try{
  await opened(socket,'connect',signal,s.port);
  const facts={address:pin.address,connectMs:Date.now()-started};
  if(!s.readBanner)return facts;
  // A bounded banner: the first bytes the service sends on its own (SSH, SMTP, FTP), at most 256 characters.
  const wait=Math.max(0,Math.min(2000,deadline-Date.now()-25));
  const first=await new Promise(resolve=>{
   const timer=setTimeout(()=>finish({note:`no banner within ${wait} ms`}),wait);
   function finish(value){clearTimeout(timer);socket.off('data',data);socket.off('end',end);socket.off('error',end);resolve(value)}
   const data=chunk=>finish({text:printable(chunk.subarray(0,512).toString('utf8')).slice(0,256)});
   const end=()=>finish({note:'the server closed the connection without a banner'});
   socket.on('data',data);socket.once('end',end);socket.once('error',end);
  });
  return first.text?{...facts,banner:first.text}:{...facts,bannerNote:first.note};
 }finally{socket.destroy()}
}
const VERIFY={UNABLE_TO_GET_ISSUER_CERT_LOCALLY:'issuer not trusted or chain incomplete',UNABLE_TO_VERIFY_LEAF_SIGNATURE:'chain incomplete',DEPTH_ZERO_SELF_SIGNED_CERT:'self-signed certificate',SELF_SIGNED_CERT_IN_CHAIN:'self-signed certificate in the chain',CERT_UNTRUSTED:'certificate not trusted',CERT_REVOKED:'certificate revoked',CERT_SIGNATURE_FAILURE:'certificate signature invalid'};
function certificateFacts(peer){
 const names=String(peer.subjectaltname??'').split(/,\s*/).filter(n=>n.startsWith('DNS:')).map(n=>n.slice(4).toLowerCase()).slice(0,20);
 const name=o=>Object.fromEntries([['cn',o?.CN],['o',o?.O]].filter(([,v])=>typeof v==='string').map(([k,v])=>[k,v.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,200)]));
 return {subject:name(peer.subject),issuer:name(peer.issuer),notBefore:Date.parse(peer.valid_from),notAfter:Date.parse(peer.valid_to),dnsNames:names,fingerprint256:peer.fingerprint256};
}
async function tlsFacts(s,signal){
 const pin=await resolvePublic(pinned(s.host),signal),started=Date.now(),literal=net.isIP(s.host);
 // Verification is reported, not enforced here: the check records what failed instead of refusing to look.
 const socket=tls.connect({host:pin.address,port:s.port,family:pin.family,...(literal?{}:{servername:s.host}),rejectUnauthorized:false});
 try{
  await opened(socket,'secureConnect',signal,s.port);
  const handshakeMs=Date.now()-started,peer=socket.getPeerCertificate(true);
  if(!peer?.fingerprint256)throw new ProtocolError('tls','TLS handshake failed: the server sent no certificate');
  let chainLength=1;for(let c=peer;c.issuerCertificate&&c.issuerCertificate!==c&&chainLength<10;c=c.issuerCertificate)chainLength++;
  // Node reports a name mismatch as its authorization error once the chain verified; the hostname check reports it.
  const error=socket.authorized||String(socket.authorizationError)==='ERR_TLS_CERT_ALTNAME_INVALID'?null:String(socket.authorizationError??'CERT_UNTRUSTED');
  const dated=['CERT_HAS_EXPIRED','CERT_NOT_YET_VALID'].includes(error);
  return {address:pin.address,handshakeMs,certificate:certificateFacts(peer),chainLength,trusted:error===null?true:dated?null:false,hostnameMatch:tls.checkServerIdentity(s.host,peer)===undefined,...(error&&!dated?{verifyError:(VERIFY[error]??error.toLowerCase().replace(/_/g,' ')).slice(0,120)}:{})};
 }finally{socket.destroy()}
}
// One DNS query over TCP to a name server address the shared code validated as public.
const asker=signal=>async(address,bytes)=>{
 const socket=net.connect({host:address,port:53});
 try{
  await opened(socket,'connect',signal,53);socket.write(bytes);
  const queue=[];let wake;socket.on('data',chunk=>{queue.push(new Uint8Array(chunk));wake?.()});socket.on('end',()=>{queue.push(null);wake?.()});
  const read=async()=>{while(!queue.length){if(signal.aborted)throw new ProtocolError('timeout','No answer within the timeout');await new Promise(r=>{wake=r;signal.addEventListener('abort',r,{once:true})})}const value=queue.shift();return value?{value,done:false}:{done:true}};
  return await readFramed(read);
 }finally{socket.destroy()}
};
// Reads for the shared DNS over HTTPS and RDAP code: pinned, credential-free, read-only and bounded.
const reader=signal=>async(url,{accept,maxBytes})=>{
 const response=await publicReport(url,{signal,accept,userAgent:RUNNER_VERSION,maxBody:maxBytes,maxHops:3});
 if(response.truncated||response.redirect)throw new ProtocolError('registry','The answer was larger than the check reads or redirected too often');
 return {status:response.status,text:response.body};
};
export async function probeProtocol(input,probe,{signal}={}){
 const def=validateDefinition(input,[]),startedAt=Date.now(),deadline=startedAt+def.timeoutMs;
 const execution=AbortSignal.any([AbortSignal.timeout(def.timeoutMs),...(signal?[signal]:[])]);
 const evidence=(data,completedAt=Date.now())=>({id:randomUUID(),probe,startedAt,completedAt,durationMs:completedAt-startedAt,runnerVersion:RUNNER_VERSION,...data});
 try{
  const s=def[def.type];
  const facts=def.type==='tcp'?await tcpFacts(s,execution,deadline):def.type==='tls'?await tlsFacts(s,execution):def.type==='dns'?await dnsFacts(reader(execution),s,asker(execution)):await domainFacts(reader(execution),s.name);
  const completedAt=Date.now();
  return evidence({...protocolChecks(def,facts,completedAt),protocol:facts},completedAt);
 }catch(error){
  const category=error instanceof ProtocolError||error instanceof ProbeError?error.category:execution.aborted?'timeout':'runner';
  const reason=error?.reason??(category==='timeout'?'No answer within the timeout':category==='unresolved'?'DNS: the host name does not resolve':category==='network'?'The host resolves to an address this check never contacts':category==='dns'?'The runner’s DNS resolver failed; this is not evidence about the target':'The runner could not perform this check');
  return evidence({outcome:targetCategories.includes(category)?'target_failure':'runner_error',checks:[{assertion:category,pass:false,reason}]});
 }
}
