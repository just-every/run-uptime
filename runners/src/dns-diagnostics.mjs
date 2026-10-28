import net from 'node:net';
import {publicReport} from './public-http.mjs';
import {RUNNER_VERSION} from '../../src/domain/policy.mjs';
import {ProtocolError} from '../../src/domain/protocol/protocol-error.mjs';
import {readFramed} from '../../src/domain/protocol/dns-wire.mjs';
import {diagnosticCapture,measurePhase} from './network-phase-capture.mjs';

// Each concurrent resolver gets its own original exchange. A later healthy
// resolver must not replace the pin and phases belonging to the failed one.
export function dnsDiagnosticTransports(signal,opened){
 const exchanges=[];
 const get=async(url,{accept,maxBytes,diagnosticResolver})=>{
  const capture=diagnosticCapture(),exchange={resolver:diagnosticResolver,url,capture,failed:false};exchanges.push(exchange);
  try{
   const response=await publicReport(url,{signal,accept,userAgent:RUNNER_VERSION,maxBody:maxBytes,maxHops:3,capture});
   if(response.truncated||response.redirect)throw new ProtocolError('registry','The answer was larger than the check reads or redirected too often');
   return {status:response.status,text:response.body};
  }catch(error){exchange.failed=true;throw error}
 };
 const ask=async(address,bytes)=>{
  const capture=diagnosticCapture();capture.pin={address,family:net.isIP(address)};
  const exchange={resolver:'authoritative',capture,failed:false};exchanges.push(exchange);
  const socket=net.connect({host:address,port:53});
  try{
   await measurePhase(capture,'connectMs',()=>opened(socket,'connect',signal,53));socket.write(bytes);
   const queue=[];let wake,failure,first=true,started=Date.now();
   const notify=()=>wake?.();
   socket.on('data',chunk=>{if(first){first=false;capture.phases.ttfbMs=Date.now()-started}queue.push(new Uint8Array(chunk));notify()});
   socket.on('end',()=>{queue.push(null);notify()});
   socket.on('error',()=>{failure=new ProtocolError('connection','The DNS connection failed');notify()});
   const read=async()=>{
    while(!queue.length){
     if(signal.aborted)throw new ProtocolError('timeout','No answer within the timeout');
     if(failure)throw failure;
     await new Promise(resolve=>{const done=()=>{signal.removeEventListener('abort',done);wake=null;resolve()};wake=done;signal.addEventListener('abort',done,{once:true});if(signal.aborted)done()});
    }
    const value=queue.shift();return value?{value,done:false}:{done:true};
   };
   return await readFramed(read);
  }catch(error){exchange.failed=true;throw error}finally{socket.destroy()}
 };
 const select=(facts,settings)=>{
  const failed=facts.resolvers.find(r=>r.status!=='answer'||!r.answers.length);
  const matching=failed?exchanges.filter(x=>x.resolver===failed.id):[];
  // Direct authoritative transport is preferred over its discovery requests.
  const selected=matching.find(x=>x.failed)??matching.find(x=>x.url&&new URL(x.url).searchParams.get('name')===settings.name&&new URL(x.url).searchParams.get('type')===settings.recordType)??matching.at(-1)??exchanges.find(x=>x.failed)??exchanges.at(-1);
  return selected?.capture??diagnosticCapture();
 };
 return {get,ask,select};
}
