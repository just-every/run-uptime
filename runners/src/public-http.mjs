import http from 'node:http';
import https from 'node:https';
import {Resolver} from 'node:dns/promises';
import {isIP} from 'node:net';
import {publicTarget,publicAddress} from '../../src/domain/public-target.mjs';
import {MAX_BODY,RUNNER_VERSION} from '../../src/domain/policy.mjs';
import {readCredentials} from './credentials.mjs';
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
function requestOnce(url,pin,method,settings,signal,onRequest) {
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
      headers:{'user-agent':RUNNER_VERSION,accept:'application/json,text/plain','accept-encoding':'identity',...settings.headers,host:url.host}},res=>{
      if([301,302,303,307,308].includes(res.statusCode)){
        settled=true;resolve({redirect:res.headers.location,status:res.statusCode});res.destroy();return;
      }
      if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){fail('encoding');res.destroy();return}
      res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){fail('body-limit');res.destroy()}else chunks.push(chunk)});
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
export async function publicHttp(def,signal,onRequest) {
  let url=publicTarget(def.url),method=def.method;
  let settings=def.request?await readCredentials(def.request.credentialRef,url.href,method):{headers:{}};
  signal.throwIfAborted();
  for(let hop=0;hop<=5;hop++){
    const pin=await resolvePublic(url,signal),response=await requestOnce(url,pin,method,settings,signal,onRequest);
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
