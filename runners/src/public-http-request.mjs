// One bounded HTTP exchange at an already validated numeric address. Auth protocol exchanges and redirects live above it.
import http from 'node:http';
import https from 'node:https';
import {isIP} from 'node:net';
import {checkServerIdentity} from 'node:tls';
import {MAX_BODY,RUNNER_VERSION} from '../../src/domain/policy.mjs';
import {TLS_ERROR_CODES} from '../../src/domain/tls-trust.mjs';
import {connectTrustedTls} from './tls-connection.mjs';
import {ProbeError,PROBE_ACCEPT} from './probe-error.mjs';
const tlsCodes=new Set(TLS_ERROR_CODES);
export async function requestOnce(url,pin,method,settings,signal,onRequest,report,statusOnly=false,trust){
 let socket,facts=[];
 if(url.protocol==='https:'&&(trust||settings.tls||settings.trackTlsFacts)){
  try{const connected=await connectTrustedTls({url,pin,signal,trust,credentialsPresent:settings.credentialsPresent,allowUnverifiedTls:settings.allowUnverifiedTls,clientTls:settings.tls});socket=connected.socket;facts=connected.facts}
  catch(error){throw Object.assign(new ProbeError(signal.aborted?'timeout':error.category??'tls',error.reason),{facts:error.facts??[]})}
 }
 return new Promise((resolve,reject)=>{
  let size=0,chunks=[],settled=false;
  const transport=url.protocol==='https:'?https:http;
  const agent=new transport.Agent({keepAlive:false,proxyEnv:{},...(url.protocol==='https:'?{maxCachedSessions:0}:{})});
  if(socket)agent.createConnection=()=>socket;
  const finish=value=>{if(settled)return;settled=true;resolve({...value,...(facts.length?{tlsTrust:facts}:{})})};
  const fail=(category,reason)=>{if(!settled){settled=true;socket?.destroy();reject(Object.assign(new ProbeError(category,reason),{facts}))}};
  let req;
  try{req=transport.request({protocol:url.protocol,hostname:pin.address,port:url.port||undefined,path:url.pathname+url.search,method,
   agent,signal,maxHeaderSize:16384,servername:isIP(url.hostname.replace(/^\[|\]$/g,''))?'':url.hostname,
   ...(url.protocol==='https:'?{rejectUnauthorized:true,checkServerIdentity:(_host,cert)=>checkServerIdentity(url.hostname.replace(/^\[|\]$/g,''),cert)}:{}),
   headers:{'user-agent':report?.userAgent??RUNNER_VERSION,accept:report?.accept??PROBE_ACCEPT,'accept-encoding':'identity',...settings.headers,host:url.host}},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){finish({redirect:res.headers.location,status:res.statusCode,...(report?{headers:res.headers}:{})});res.destroy();return}
    if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){fail('encoding');res.destroy();return}
    if(statusOnly){finish({status:res.statusCode,headers:res.headers,body:'',bytes:0});res.destroy();return}
    if(report)res.on('data',chunk=>{
     if(settled)return;
     if(size+chunk.length>report.maxBody){chunks.push(chunk.subarray(0,report.maxBody-size));size=report.maxBody;finish({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),bytes:size,truncated:true});res.destroy()}
     else{size+=chunk.length;chunks.push(chunk)}
    });
    else res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){fail('body-limit');res.destroy()}else chunks.push(chunk)});
    res.on('end',()=>finish({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),bytes:size}));
    res.on('error',()=>fail('transport'));res.on('close',()=>{if(!res.complete)fail('transport')});
   });
   req.on('error',error=>fail(signal.aborted?'timeout':tlsCodes.has(error.code)?'tls':'connection',tlsCodes.has(error.code)?`TLS certificate verification failed (${error.code}).`:undefined));
   req.on('close',()=>agent.destroy());onRequest(req);req.end(settings.body);
  }catch{agent.destroy();fail(signal.aborted?'timeout':'connection')}
 });
}
