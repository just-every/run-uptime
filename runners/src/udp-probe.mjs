import {resolveDiagnosticPin} from './protocol-diagnostics.mjs';
import dgram from 'node:dgram';
import {performance} from 'node:perf_hooks';
import {ProtocolError} from '../../src/domain/protocol/protocol-error.mjs';

const WINDOW_MS=60_000,MAX_ENDPOINTS=1000,MAX_SENDS=6;
const sentByEndpoint=new Map();
const pinned=host=>new URL(`https://${host.includes(':')?`[${host}]`:host}/`);
const timeout=()=>new ProtocolError('timeout','No UDP answer within the timeout');

// A sliding minute, shared by all monitors and hostname aliases in this process.
// Reserve synchronously immediately before the single send; failed sends also
// consume their slot because an uncertain network outcome must never be retried.
function reserve(address,port){
 const now=performance.now(),cutoff=now-WINDOW_MS;
 for(const [key,times] of sentByEndpoint){
  while(times.length&&times[0]<=cutoff)times.shift();
  if(!times.length)sentByEndpoint.delete(key);
 }
 const key=`${address}:${port}`,times=sentByEndpoint.get(key);
 if(times?.length>=MAX_SENDS)throw new ProtocolError('capacity','The UDP endpoint has reached its six-packet minute limit');
 if(!times&&sentByEndpoint.size>=MAX_ENDPOINTS)throw new ProtocolError('capacity','The runner has reached its UDP endpoint capacity');
 if(times)times.push(now);else sentByEndpoint.set(key,[now]);
}

function transportError(error,port){
 if(error instanceof ProtocolError)return error;
 if(error?.code==='ECONNREFUSED')return new ProtocolError('refused',`UDP connection refused on port ${port}`);
 if(error?.code==='ETIMEDOUT')return timeout();
 return new ProtocolError('runner','The runner could not perform this UDP check');
}

function settingsOf(settings){
 const {host,port,payloadHex,expectedHex,match}=settings??{};
 // The definition validator owns user-facing validation. Keep the transport's
 // limits independent so malformed direct calls cannot widen the network door.
 if(typeof host!=='string'||!host||host.length>253||!(/^[a-z0-9.-]+$/i.test(host)||/^[a-f0-9:]+$/i.test(host)))throw new ProtocolError('runner','Invalid UDP host');
 if(!Number.isInteger(port)||port<1||port>65535)throw new ProtocolError('runner','Invalid UDP port');
 if(typeof payloadHex==='string'&&payloadHex.length>512)throw new ProtocolError('response_limit','The UDP payload exceeded 256 bytes');
 if(typeof payloadHex!=='string'||!/^(?:[a-f0-9]{2})*$/i.test(payloadHex))throw new ProtocolError('runner','UDP payload must contain hexadecimal byte pairs');
 if(typeof expectedHex!=='string'||expectedHex.length>2048||!/^(?:[a-f0-9]{2})*$/i.test(expectedHex)||!['exact','includes'].includes(match))throw new ProtocolError('runner','Invalid UDP response expectation');
 return {host,port,payload:Buffer.from(payloadHex,'hex')};
}

// One pinned, connected socket and exactly one outbound datagram. The shared
// evaluator compares responseHex with the configured expectation; a mismatching
// first response is evidence, never a reason to send or wait for another packet.
export async function udpFacts(settings,signal,capture){
 if(!signal||typeof signal.addEventListener!=='function')throw new ProtocolError('runner','A UDP check requires an abort signal');
 try{
  if(signal.aborted)throw timeout();
  const {host,port,payload}=settingsOf(settings);
  const pin=await resolveDiagnosticPin(capture,pinned(host),signal);
  if(signal.aborted)throw timeout();
  // Canonical spelling gives IPv6 aliases the same numeric-endpoint budget.
  const address=pinned(pin.address).hostname.replace(/^\[|\]$/g,'');
  if(![4,6].includes(pin.family))throw new ProtocolError('runner','The runner could not resolve a UDP address family');
  return await new Promise((resolve,reject)=>{
   let socket,settled=false,sent=false,started;
   const finish=(error,facts)=>{
    if(settled)return;
    settled=true;
    signal.removeEventListener('abort',aborted);
    if(socket){
     socket.off('connect',connected);socket.off('message',message);
     // Keep the error handler until the socket is collected: a queued error
     // after an abort or close must not become an unhandled EventEmitter error.
     try{socket.close()}catch{}
    }
    if(error)reject(error);else resolve(facts);
   };
   const aborted=()=>finish(timeout());
   const failed=error=>finish(transportError(error,port));
   const message=bytes=>{
    if(bytes.length>1024){finish(new ProtocolError('response_limit','The UDP response exceeded 1024 bytes'));return}
    if(!sent){finish(new ProtocolError('runner','The runner received a UDP answer before sending its packet'));return}
    finish(undefined,{address,roundTripMs:Math.max(0,Math.round(performance.now()-started)),sentBytes:payload.length,receivedBytes:bytes.length,responseHex:bytes.toString('hex')});
   };
   const connected=()=>{
    if(settled)return;
    if(signal.aborted){aborted();return}
    try{
     reserve(address,port);
     started=performance.now();sent=true;
     socket.send(payload,error=>{if(error)failed(error)});
    }catch(error){failed(error)}
   };
   try{
    socket=dgram.createSocket(pin.family===6?'udp6':'udp4');
    socket.on('error',failed);
    socket.once('close',()=>{if(!settled)finish(new ProtocolError('runner','The UDP socket closed before an answer arrived'))});
    socket.once('connect',connected);socket.on('message',message);
    signal.addEventListener('abort',aborted,{once:true});
    if(signal.aborted){aborted();return}
    socket.connect(port,address);
   }catch(error){failed(error)}
  });
 }catch(error){
  if(signal.aborted)throw timeout();
  // Preserve the shared resolver's network, DNS and unresolved categories.
  if(error?.category)throw error;
  throw transportError(error,settings?.port);
 }
}
