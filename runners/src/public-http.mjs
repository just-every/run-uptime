import http from 'node:http';
import https from 'node:https';
import {Resolver} from 'node:dns/promises';
import {isIP} from 'node:net';
import {publicTarget,publicAddress} from '../../src/domain/public-target.mjs';
import {MAX_BODY,RUNNER_VERSION} from '../../src/domain/policy.mjs';
import {readCredentials} from './credentials.mjs';
// JSON and text first, then anything: servers that negotiate on Accept (406 to a narrow list) still answer a probe as they answer a browser.
export const PROBE_ACCEPT='application/json,text/plain,*/*;q=0.1';
export class ProbeError extends Error {constructor(category){super(category);this.category=category}}
export async function resolvePublic(url,signal) {
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(isIP(host)){if(!publicAddress(host))throw new ProbeError('network');return {address:host,family:isIP(host)}}
  const resolver=new Resolver({timeout:1000,tries:1}),cancel=()=>resolver.cancel();
  signal.throwIfAborted();signal.addEventListener('abort',cancel,{once:true});
  try{
    const results=await Promise.allSettled([resolver.resolve4(host),resolver.resolve6(host)]);
    signal.throwIfAborted();
    if(results.some(r=>r.status==='rejected'&&!['ENODATA','ENOTFOUND'].includes(r.reason.code)))throw new ProbeError('dns');
    const addresses=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    if(!addresses.length||addresses.some(a=>!isIP(a)||!publicAddress(a)))throw new ProbeError('network');
    return {address:addresses[0],family:isIP(addresses[0])};
  }finally{signal.removeEventListener('abort',cancel)}
}
function requestOnce(url,pin,method,settings,signal,onRequest,report,statusOnly=false) {
  return new Promise((resolve,reject)=>{
    let size=0,chunks=[],settled=false;
    const fail=category=>{if(!settled){settled=true;reject(new ProbeError(category))}};
    // A fresh agent with no proxyEnv bypasses both proxy environment and globals.
    const transport=url.protocol==='https:'?https:http;
    const agent=new transport.Agent({keepAlive:false,proxyEnv:{}});
    const req=transport.request({protocol:url.protocol,hostname:pin.address,port:url.port||undefined,path:url.pathname+url.search,method,
      agent,signal,maxHeaderSize:16384,servername:isIP(url.hostname.replace(/^\[|\]$/g,''))?'':url.hostname,
      // TLS verifies original identity, not the pinned socket's address.
      ...(url.protocol==='https:'?{rejectUnauthorized:true,checkServerIdentity:(_host,cert)=>checkIdentity(url.hostname.replace(/^\[|\]$/g,''),cert)}:{}),
      headers:{'user-agent':report?.userAgent??RUNNER_VERSION,accept:report?.accept??PROBE_ACCEPT,'accept-encoding':'identity',...settings.headers,host:url.host}},res=>{
      if([301,302,303,307,308].includes(res.statusCode)){
        settled=true;resolve({redirect:res.headers.location,status:res.statusCode,...(report?{headers:res.headers}:{})});res.destroy();return;
      }
      if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){fail('encoding');res.destroy();return}
      // Status-only mode answers at the headers and drops the socket without reading a body byte (bytes: 0): the caller asserts
      // the status alone, so the body is neither bounded nor kept. Report mode reads up to its own cap and truncates there;
      // scheduled probes still fail at MAX_BODY.
      if(statusOnly){settled=true;resolve({status:res.statusCode,headers:res.headers,body:'',bytes:0});res.destroy();return}
      if(report)res.on('data',chunk=>{
        if(settled)return;
        if(size+chunk.length>report.maxBody){chunks.push(chunk.subarray(0,report.maxBody-size));size=report.maxBody;settled=true;resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),bytes:size,truncated:true});res.destroy()}
        else{size+=chunk.length;chunks.push(chunk)}
      });
      else res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){fail('body-limit');res.destroy()}else chunks.push(chunk)});
      res.on('end',()=>{if(!settled){settled=true;resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),bytes:size})}});
      res.on('error',()=>fail('transport'));
      res.on('close',()=>{if(!res.complete)fail('transport')});
    });
    req.on('error',()=>fail(signal.aborted?'timeout':'connection'));
    req.on('close',()=>agent.destroy());
    onRequest(req);req.end(settings.body);
  });
}
import {checkServerIdentity as checkIdentity} from 'node:tls';
// statusOnly: see requestOnce. Resolution, pinning, redirect validation and the downgrade refusal are the same as a probe's.
export async function publicHttp(def,signal,onRequest,{statusOnly=false,monitorId}={}) {
  let url=publicTarget(def.url),method=def.method;
  let settings=def.request?await readCredentials(def.request.credentialRef,url.href,method,undefined,monitorId):{headers:{}};
  signal.throwIfAborted();
  for(let hop=0;hop<=5;hop++){
    const pin=await resolvePublic(url,signal),response=await requestOnce(url,pin,method,settings,signal,onRequest,undefined,statusOnly);
    if(!Object.hasOwn(response,'redirect'))return response;
    if(hop===5||!response.redirect)throw new ProbeError('redirect');
    let next;try{next=publicTarget(new URL(response.redirect,url).href)}catch{throw new ProbeError('network')}
    if(url.protocol==='https:'&&next.protocol!=='https:')throw new ProbeError('redirect');
    if(next.origin!==url.origin){
      // Never forward credentials, custom headers, request body, or a mutating method.
      settings={headers:{}};method=method==='HEAD'?'HEAD':'GET';
    }else if(response.status===303||(method==='POST'&&[301,302].includes(response.status))){settings={headers:settings.headers};method='GET'}
    url=next;
  }
}
// Report mode: one read-only fetch for discovery, never a scheduled probe. It reuses resolvePublic's validation and pinning
// and requestOnce's pinned, identity-encoded, proxy-free socket. It sends no credentials, no cookies and no request body, and
// allows only GET and HEAD. Every redirect hop is re-resolved and re-validated, an HTTPS to HTTP downgrade is refused, and a
// body past maxBody is cut there (truncated: true) instead of failing as a probe's body-limit does.
// beforeRequest(url) runs after the address is validated and before anything is sent; it may throw to stop (budget, robots).
// followRedirect(next,from,status) may return false to stop at a redirect without following it.
export async function publicReport(rawUrl,{signal,accept=PROBE_ACCEPT,userAgent,maxBody,method='GET',maxHops=4,hopTimeoutMs=8000,beforeRequest,followRedirect}={}) {
  if(!['GET','HEAD'].includes(method))throw new ProbeError('method');
  if(!Number.isInteger(maxBody)||maxBody<1||typeof userAgent!=='string'||!userAgent)throw new ProbeError('runner');
  let url=publicTarget(rawUrl);
  const hops=[],settings={headers:{}},base=signal??new AbortController().signal;
  for(let hop=0;hop<=maxHops;hop++){
    base.throwIfAborted();
    const resolving=Date.now(),pin=await resolvePublic(url,base),lookupMs=Date.now()-resolving;
    await beforeRequest?.(url,hop);
    const hopSignal=AbortSignal.any([base,AbortSignal.timeout(hopTimeoutMs)]);
    // Timing is lookup plus the request, as a probe measures it; waiting in beforeRequest (robots, spacing) is not counted.
    const started=Date.now(),response=await requestOnce(url,pin,method,settings,hopSignal,()=>{},{accept,userAgent,maxBody}),durationMs=lookupMs+Date.now()-started;
    hops.push({url:url.href,status:response.status,durationMs});
    if(!Object.hasOwn(response,'redirect'))return {...response,truncated:Boolean(response.truncated),url:url.href,hops,durationMs};
    if(!response.redirect)throw new ProbeError('redirect');
    let next;try{next=new URL(response.redirect,url);next.hash='';next=publicTarget(next.href)}catch{throw new ProbeError('network')}
    if(url.protocol==='https:'&&next.protocol!=='https:')throw new ProbeError('redirect');
    if(hop===maxHops||(followRedirect&&!followRedirect(next,url,response.status)))return {status:response.status,headers:response.headers,body:'',bytes:0,truncated:false,redirect:next.href,url:url.href,hops,durationMs};
    url=next;
  }
}
