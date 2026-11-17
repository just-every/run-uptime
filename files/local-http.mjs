// Cloud-only real HTTP client. Node fetch can reject a completed early 413 when
// workerd closes a socket whose oversized body is still being written. Preserve
// actual response/status/body and all test assertions; never retry or synthesize a response.
import http from 'node:http';
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const url=new URL(input instanceof Request?input.url:input);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))return nativeFetch(input,options);
 return new Promise((resolve,reject)=>{
  let responseStarted=false;
  const headers=Object.fromEntries(new Headers(options.headers));
  const request=http.request(url,{method:options.method??'GET',headers,agent:false},response=>{
   responseStarted=true;const chunks=[];
   response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);
   response.on('end',()=>{const status=response.statusCode;const result=new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,statusText:response.statusMessage,headers:response.headers});Object.defineProperty(result,'url',{value:url.href});resolve(result)});
  });
  request.on('error',error=>{if(!responseStarted)reject(error)});
  request.setTimeout(120000,()=>request.destroy(new Error('loopback request timeout')));
  if(options.body===undefined){request.end();return}
  // Bounded writes model normal network backpressure, so an early rejection is
  // read before more body bytes are sent to workerd's closed request stream.
  const body=Buffer.from(options.body);let offset=0;
  const send=()=>{
   if(responseStarted||request.destroyed)return;
   if(offset>=body.length){request.end();return}
   const chunk=body.subarray(offset,offset+16384);offset+=chunk.length;
   request.write(chunk,()=>setTimeout(send,5));
  };
  send();
 });
};
