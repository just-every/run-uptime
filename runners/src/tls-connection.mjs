import tls from 'node:tls';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {normalizeTlsTrust,TLS_ERROR_CODES} from '../../src/domain/tls-trust.mjs';

// Node primary API references: node:tls connect(), TLSSocket.authorized/authorizationError,
// getPeerCertificate(true), checkServerIdentity(), and the secureConnect event. In particular,
// Node only calls checkServerIdentity after the chain passes, so permissive handshakes must check names separately.
// https://nodejs.org/docs/latest-v22.x/api/tls.html
const knownErrors=new Set(TLS_ERROR_CODES);
const failureMessages={
 TLS_CERTIFICATE_MISSING:'The TLS peer did not supply a certificate.',
 TLS_FINGERPRINT_MISMATCH:'The TLS leaf certificate does not match the saved fingerprint.',
 TLS_CERTIFICATE_CHANGED:'The TLS certificate changed between trust verification and the application connection.',
 TLS_HANDSHAKE_FAILED:'The TLS connection could not be authenticated.',
 CREDENTIAL_TLS_GRANT_REQUIRED:'This monitor needs a separate local grant before credentials can use a TLS trust exception.',
};
function failure(code,facts=[],category='tls'){
 const error=new Error(failureMessages[code]??'The TLS certificate failed verification.');
 error.category=category;error.code=code;error.reason=error.message;error.facts=facts;return error;
}
const safeCode=error=>knownErrors.has(typeof error==='string'?error:error?.code)?(typeof error==='string'?error:error.code):'TLS_HANDSHAKE_FAILED';
function peerFacts(socket,hostname){
 const peer=socket.getPeerCertificate(true);
 if(!peer?.raw?.length)throw failure('TLS_CERTIFICATE_MISSING');
 const sha256=createHash('sha256').update(peer.raw).digest('hex'),errors=[];
 if(!socket.authorized){const code=safeCode(socket.authorizationError);errors.push(code==='TLS_HANDSHAKE_FAILED'?'CERT_UNTRUSTED':code)}
 // The native chain error can hide a simultaneous hostname error.
 const nameError=tls.checkServerIdentity(hostname,peer);
 if(nameError&&!errors.includes('ERR_TLS_CERT_ALTNAME_INVALID'))errors.push('ERR_TLS_CERT_ALTNAME_INVALID');
 return {sha256,errors};
}
function connect({url,pin,signal,ca,clientTls,rejectUnauthorized,phases}){
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(failure('TLS_HANDSHAKE_FAILED'));return}
  const hostname=url.hostname.replace(/^\[|\]$/g,'');let socket,settled=false,connectedAt;const started=Date.now();if(phases){phases.connectMs=null;phases.tlsMs=null}
  const cleanup=()=>{signal.removeEventListener('abort',aborted);socket?.off('secureConnect',ready);socket?.off('error',failed);socket?.off('close',closed)};
  const finish=(error)=>{
   if(settled)return;settled=true;if(phases&&connectedAt!==undefined)phases.tlsMs=Date.now()-connectedAt;cleanup();
   if(error){socket?.destroy();reject(error)}else{
    // Keep the signal authoritative after handoff; the caller owns the socket and HTTP lifetime.
    const stop=()=>socket.destroy();signal.addEventListener('abort',stop,{once:true});
    socket.once('close',()=>signal.removeEventListener('abort',stop));
    // An alert can arrive between secureConnect and the caller attaching its HTTP error listener.
    // HTTP still receives the same error; this listener only prevents an unhandled transition-window event.
    socket.on('error',()=>{});
    resolve(socket);
   }
  };
  const ready=()=>finish();
  const failed=error=>finish(failure(safeCode(error)));
  const closed=()=>finish(failure('TLS_HANDSHAKE_FAILED'));
  const aborted=()=>finish(failure('TLS_HANDSHAKE_FAILED'));
  try{
   // Every call is a new TLS connection/context, without a session, shared agent, proxy or client identity on diagnostics.
   socket=tls.connect({host:pin.address,port:Number(url.port)||443,family:pin.family,
    servername:isIP(hostname)?'':hostname,rejectUnauthorized,
    checkServerIdentity:(_host,peer)=>tls.checkServerIdentity(hostname,peer),ALPNProtocols:['http/1.1'],
    ...(ca?{ca}:{}),...(clientTls?{cert:clientTls.cert,key:clientTls.key,...(clientTls.passphrase===undefined?{}:{passphrase:clientTls.passphrase})}:{})});
   socket.once('connect',()=>{connectedAt=Date.now();if(phases)phases.connectMs=connectedAt-started});socket.once('secureConnect',ready);socket.once('error',failed);socket.once('close',closed);
   signal.addEventListener('abort',aborted,{once:true});if(signal.aborted)aborted();
  }catch{finish(failure('TLS_HANDSHAKE_FAILED'))}
 });
}
/** Return an authenticated/gated actual application socket. No HTTP bytes are written by this helper. */
export async function connectTrustedTls({url:inputUrl,pin,signal,trust,credentialsPresent=false,allowUnverifiedTls=false,clientTls,phases}){
 let url;try{url=new URL(inputUrl)}catch{throw failure('TLS_HANDSHAKE_FAILED')}
 if(url.protocol!=='https:'||url.username||url.password||!signal||!isIP(pin?.address)||isIP(pin.address)!==pin.family)throw failure('TLS_HANDSHAKE_FAILED');
 try{trust=normalizeTlsTrust(trust,{type:'http',network:'public',url:url.href})}catch{throw failure('TLS_HANDSHAKE_FAILED')}
 // A client certificate is sent during TLS itself. No preflight can grant authority on a later socket whose peer can rotate.
 if(trust&&(credentialsPresent||clientTls)&&allowUnverifiedTls!==true)throw failure('CREDENTIAL_TLS_GRANT_REQUIRED',[],'credential');
 const hostname=url.hostname.replace(/^\[|\]$/g,''),mode=trust?.mode??'default';
 const fact=observed=>({origin:url.origin,mode,sha256:observed.sha256,errors:observed.errors,
  bypassed:mode!=='default'&&observed.errors.length>0,credentialsAllowed:!trust||allowUnverifiedTls===true});
 let socket,facts=[];
 try{
  if(mode==='ca'){
   // Retain default trust truth from a credential-free handshake; the real application socket must then verify with the CA.
   const diagnostic=await connect({url,pin,signal,rejectUnauthorized:false});let observed;
   try{observed=peerFacts(diagnostic,hostname)}finally{diagnostic.destroy()}
   facts=[fact(observed)];
   try{socket=await connect({url,pin,signal,ca:trust.certificate,clientTls,rejectUnauthorized:true,phases})}
   catch(error){facts[0].bypassed=false;facts[0].errors=[...new Set([...facts[0].errors,safeCode(error)])].slice(0,8);throw failure(safeCode(error),facts)}
   const actual=peerFacts(socket,hostname);
   if(actual.sha256!==observed.sha256){facts=[{...fact(actual),bypassed:false,errors:[...actual.errors,'TLS_CERTIFICATE_CHANGED']}];throw failure('TLS_CERTIFICATE_CHANGED',facts)}
   if(actual.errors.length)throw failure(actual.errors[0],[{...fact(actual),bypassed:false}]);
   signal.throwIfAborted();if(socket.destroyed)throw failure('TLS_HANDSHAKE_FAILED',facts);return {socket,facts};
  }
  socket=await connect({url,pin,signal,clientTls,rejectUnauthorized:mode==='default',phases});
  const observed=peerFacts(socket,hostname);facts=[fact(observed)];
  if(mode==='fingerprint'&&observed.sha256!==trust.sha256){facts[0].errors.push('TLS_FINGERPRINT_MISMATCH');facts[0].bypassed=false;throw failure('TLS_FINGERPRINT_MISMATCH',facts)}
  if(mode==='default'&&observed.errors.length)throw failure(observed.errors[0],facts);
  signal.throwIfAborted();if(socket.destroyed)throw failure('TLS_HANDSHAKE_FAILED',facts);return {socket,facts};
 }catch(error){socket?.destroy();if(error?.category)throw error;throw failure('TLS_HANDSHAKE_FAILED',facts)}
}
