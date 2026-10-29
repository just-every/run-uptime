import {dnsDiagnosticTransports} from './dns-diagnostics.mjs';
import {diagnosticCapture,resolveDiagnosticPin,socketPhases,attachProtocolDiagnostics} from './protocol-diagnostics.mjs';
import net from 'node:net';
import {icmpFacts} from './icmp-probe.mjs';
import {udpFacts} from './udp-probe.mjs';
import tls from 'node:tls';
import {randomUUID} from 'node:crypto';
import {RUNNER_VERSION,validateDefinition} from '../../src/domain/policy.mjs';
import {protocolChecks} from '../../src/domain/protocol/evaluate.mjs';
import {dnsFacts} from '../../src/domain/protocol/dns.mjs';
import {domainFacts} from '../../src/domain/protocol/rdap.mjs';
import {ProtocolError} from '../../src/domain/protocol/protocol-error.mjs';
import {publicReport,ProbeError} from './public-http.mjs';
// The runner's TCP, TLS, DNS and domain checks. Sockets connect only to the address the public resolver validated
// (resolvePublic pins it, as an HTTP probe's socket is pinned); DNS over HTTPS and RDAP reads go through publicReport's
// pinned, read-only, bounded GET. Refused, timed out and unresolved targets are target failures; a check this runner could
// not perform is a runner error and stays Unknown.
const targetCategories=['refused','timeout','connection','unresolved','tls','response_limit'];
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
async function tcpFacts(s,signal,deadline,privateAccess,capture){
 const pin=await resolveDiagnosticPin(capture,new URL(`http://${s.host.includes(':')?`[${s.host}]`:s.host}:${s.port}/`),signal,undefined,privateAccess),started=Date.now();
 const socket=net.connect({host:pin.address,port:s.port,family:pin.family}),finishPhases=socketPhases(capture,socket);
 try{
  try{await opened(socket,'connect',signal,s.port)}finally{finishPhases()}
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
async function tlsFacts(s,signal,capture){
 const pin=await resolveDiagnosticPin(capture,pinned(s.host),signal),started=Date.now(),literal=net.isIP(s.host);
 // Verification is reported, not enforced here: the check records what failed instead of refusing to look.
 const socket=tls.connect({host:pin.address,port:s.port,family:pin.family,...(literal?{}:{servername:s.host}),rejectUnauthorized:false}),finishPhases=socketPhases(capture,socket,true);
 try{
  try{await opened(socket,'secureConnect',signal,s.port)}finally{finishPhases()}
  const handshakeMs=Date.now()-started,peer=socket.getPeerCertificate(true);
  if(!peer?.fingerprint256)throw new ProtocolError('tls','TLS handshake failed: the server sent no certificate');
  let chainLength=1;for(let c=peer;c.issuerCertificate&&c.issuerCertificate!==c&&chainLength<10;c=c.issuerCertificate)chainLength++;
  // Node reports a name mismatch as its authorization error once the chain verified; the hostname check reports it.
  const error=socket.authorized||String(socket.authorizationError)==='ERR_TLS_CERT_ALTNAME_INVALID'?null:String(socket.authorizationError??'CERT_UNTRUSTED');
  const dated=['CERT_HAS_EXPIRED','CERT_NOT_YET_VALID'].includes(error);
  return {address:pin.address,handshakeMs,certificate:certificateFacts(peer),chainLength,trusted:error===null?true:dated?null:false,hostnameMatch:tls.checkServerIdentity(s.host,peer)===undefined,...(error&&!dated?{verifyError:(VERIFY[error]??error.toLowerCase().replace(/_/g,' ')).slice(0,120)}:{})};
 }finally{socket.destroy()}
}
// Reads for the shared DNS over HTTPS and RDAP code: pinned, credential-free, read-only and bounded.
const reader=signal=>async(url,{accept,maxBytes})=>{
 const response=await publicReport(url,{signal,accept,userAgent:RUNNER_VERSION,maxBody:maxBytes,maxHops:3});
 if(response.truncated||response.redirect)throw new ProtocolError('registry','The answer was larger than the check reads or redirected too often');
 return {status:response.status,text:response.body};
};
export async function probeProtocol(input,probe,{signal,privateAccess,snapshotPolicy}={}){
 const def=validateDefinition(input,[]),startedAt=Date.now(),deadline=startedAt+def.timeoutMs;
 let capture=diagnosticCapture();
 const execution=AbortSignal.any([AbortSignal.timeout(def.timeoutMs),...(signal?[signal]:[])]);
 const evidence=(data,completedAt=Date.now())=>({id:randomUUID(),probe,startedAt,completedAt,durationMs:completedAt-startedAt,runnerVersion:RUNNER_VERSION,...data});
 try{
  if(def.network==='private'&&!privateAccess)throw new ProtocolError('grant','Private network grant unavailable');
  const s=def[def.type],dns=def.type==='dns'?dnsDiagnosticTransports(execution,opened):null;
  const facts=def.type==='ping'?await icmpFacts(s,execution,capture):def.type==='udp'?await udpFacts(s,execution,capture):def.type==='tcp'?await tcpFacts(s,execution,deadline,privateAccess,capture):def.type==='tls'?await tlsFacts(s,execution,capture):def.type==='dns'?await dnsFacts(dns.get,s,dns.ask):await domainFacts(reader(execution),s.name);
  const completedAt=Date.now();if(dns)capture=dns.select(facts,s);
  return attachProtocolDiagnostics(def,evidence({...protocolChecks(def,facts,completedAt),protocol:facts},completedAt),capture,{signal,snapshotPolicy});
 }catch(error){
  const category=def.type==='ping'&&execution.aborted?'vantage':error instanceof ProtocolError||error instanceof ProbeError?error.category:execution.aborted?'timeout':'runner';
  const reason=def.type==='ping'&&execution.aborted?'The ICMP sample was interrupted before completion; this location reports Unknown':error?.reason??(category==='timeout'?'No answer within the timeout':category==='unresolved'?'DNS: the host name does not resolve':category==='network'?'The host resolves to an address this check never contacts':category==='dns'?'The runner’s DNS resolver failed; this is not evidence about the target':'The runner could not perform this check');
  return attachProtocolDiagnostics(def,evidence({outcome:targetCategories.includes(category)?'target_failure':'runner_error',checks:[{assertion:category,pass:false,reason}]}),capture,{signal,snapshotPolicy});
 }
}
