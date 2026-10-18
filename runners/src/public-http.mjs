import {tryCaptureFailureSnapshot} from '../../src/domain/failure-snapshot.mjs';
import {privateTarget} from '../../src/domain/private-target.mjs';
import {requestOnce} from './public-http-request.mjs';
import {prepareAuthentication,digestChallengeAuthorization} from './auth/index.mjs';
import {Resolver} from 'node:dns/promises';
import {isIP} from 'node:net';
import {publicTarget,publicAddress} from '../../src/domain/public-target.mjs';
import {MAX_BODY,RUNNER_VERSION} from '../../src/domain/policy.mjs';
import {readCredentials} from './credentials.mjs';
import {PROBE_ACCEPT,ProbeError} from './probe-error.mjs';
export {PROBE_ACCEPT,ProbeError};
export async function resolvePublic(url,signal,{family}={}) {
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(family!==undefined&&![4,6].includes(family))throw new ProbeError('runner');
  if(isIP(host)){if(!publicAddress(host))throw new ProbeError('network');if(family!==undefined&&isIP(host)!==family)throw new ProbeError('unresolved','DNS: the target has no address in the selected IP family');return {address:host,family:isIP(host)}}
  const resolver=new Resolver({timeout:1000,tries:1}),cancel=()=>resolver.cancel();
  signal.throwIfAborted();signal.addEventListener('abort',cancel,{once:true});
  try{
    const results=await Promise.allSettled([resolver.resolve4(host),resolver.resolve6(host)]);
    signal.throwIfAborted();
    if(results.some(r=>r.status==='rejected'&&!['ENODATA','ENOTFOUND'].includes(r.reason.code)))throw new ProbeError('dns');
    const addresses=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    // The resolver answered for the name: it does not exist, or has no address. That is the target's outage, not the runner's.
    if(!addresses.length)throw new ProbeError('unresolved',results.some(r=>r.status==='rejected'&&r.reason.code==='ENOTFOUND')?'DNS: the hostname does not exist (NXDOMAIN)':'DNS: the hostname has no A or AAAA records');
    if(addresses.some(a=>!isIP(a)||!publicAddress(a)))throw new ProbeError('network');
    const address=family===undefined?addresses[0]:addresses.find(a=>isIP(a)===family);
    if(!address)throw new ProbeError('unresolved','DNS: the target has no address in the selected IP family');
    return {address,family:isIP(address)};
  }finally{signal.removeEventListener('abort',cancel)}
}
// statusOnly: see requestOnce. Resolution, pinning, redirect validation and the downgrade refusal are the same as a probe's.
export async function publicHttp(def,signal,onRequest,{statusOnly=false,monitorId,onPhase,privateAccess,snapshotPolicy}={}) {
 if(def.network==='private'&&typeof privateAccess!=='function')throw new ProbeError('grant','Private network grant unavailable');
 let url=def.network==='private'?privateTarget(def.url):publicTarget(def.url),method=def.method,trust=def.tlsTrust,credential;
 if(def.request)onPhase?.('authentication');
 if(def.request)try{credential=await readCredentials(def.request.credentialRef,url.href,method,undefined,monitorId)}catch(error){if(!error.category)error.category='credential';throw error}
 let body=credential?.body;
 const facts=[],redirects=[];let sentHeaders={},sentSecrets=[];
 const secretStrings=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(secretStrings):[];
 const tokenRequest=async({url:tokenUrl,headers,body:tokenBody,signal:tokenSignal})=>{
  const target=publicTarget(tokenUrl);if(target.protocol!=='https:')throw new ProbeError('credential','OAuth token endpoints require verified public HTTPS.');
  const pin=await resolvePublic(target,tokenSignal),response=await requestOnce(target,pin,'POST',{headers,body:tokenBody},tokenSignal,onRequest,{maxBody:16384,accept:'application/json',userAgent:RUNNER_VERSION});
  if(Object.hasOwn(response,'redirect')||response.truncated)throw new ProbeError('credential','The OAuth token endpoint redirected or exceeded its response bound.');
  return response;
 };
 const send=async(extraHeaders={},forceRefresh=false)=>{
  try{
  let prepared={headers:{}};
  onPhase?.(credential?'authentication':'target');
  if(credential)try{prepared=await prepareAuthentication(credential,{url:url.href,method,body,signal,tokenRequest,forceRefresh})}catch{throw new ProbeError('credential','The local authentication could not be prepared.')}
  onPhase?.('target');
  const pin=await (def.network==='private'?privateAccess(url,signal):resolvePublic(url,signal));
  const settings={...prepared,headers:{...prepared.headers,...extraHeaders},body,credentialsPresent:Boolean(credential),allowUnverifiedTls:credential?.allowUnverifiedTls===true,trackTlsFacts:Boolean(def.tlsTrust)};
  sentHeaders={'user-agent':RUNNER_VERSION,accept:PROBE_ACCEPT,...settings.headers};sentSecrets.push(...secretStrings(settings.headers),...secretStrings(credential));if(body){try{sentSecrets.push(...secretStrings(JSON.parse(body)))}catch{sentSecrets.push(String(body))}}sentSecrets=[...new Set(sentSecrets.filter(x=>x&&x.length<=16384))].slice(0,128);
  const response=await requestOnce(url,pin,method,settings,signal,req=>{sentHeaders=req.getHeaders();onRequest(req)},undefined,statusOnly,trust);facts.push(...(response.tlsTrust??[]));return response;
  }catch(error){error.facts=[...facts,...(error.facts??[])];throw error}
 };
 signal.throwIfAborted();
 try{for(let hop=0;hop<=5;hop++){
  let response=await send();
  if(credential?.auth?.type==='digest'&&response.status===401){
   const authorization=digestChallengeAuthorization(credential,{url:url.href,method,body,responseHeaders:response.headers,nonceCount:1});
   response=await send({authorization});
   if(response.status===401&&/\bstale\s*=\s*"?true\b/i.test(String(response.headers['www-authenticate']??''))){
    const next=digestChallengeAuthorization(credential,{url:url.href,method,body,responseHeaders:response.headers,nonceCount:2});response=await send({authorization:next});
   }
  }else if(credential?.auth?.type==='oauth2'&&response.status===401&&/\berror\s*=\s*"?invalid_token\b/i.test(String(response.headers['www-authenticate']??'')))response=await send({},true);
  if(!Object.hasOwn(response,'redirect'))return {...response,...(snapshotPolicy&&!statusOnly?{failureSnapshot:tryCaptureFailureSnapshot({method,url:url.href,redirects,requestHeaders:sentHeaders,responseHeaders:response.headers,status:response.status,body:response.body,durationMs:0,requestSecrets:sentSecrets,masks:snapshotPolicy.masks})}:{}),...(facts.length?{tlsTrust:facts}:{}),...(credential&&[401,403].includes(response.status)?{authenticationRejected:true}:{})};
  if(hop===5||!response.redirect)throw Object.assign(new ProbeError('redirect'),{facts});
  let next;try{next=(def.network==='private'?privateTarget:publicTarget)(new URL(response.redirect,url).href)}catch{throw Object.assign(new ProbeError('network'),{facts})}
  if(url.protocol==='https:'&&next.protocol!=='https:')throw Object.assign(new ProbeError('redirect'),{facts});
  if(next.origin!==url.origin){
   // A first origin change permanently drops every request secret and trust exception, even on a return redirect.
   credential=undefined;body=undefined;trust=undefined;
  }else if(response.status===303||(method==='POST'&&[301,302].includes(response.status))){body=undefined;method='GET'}
  if(next.origin!==url.origin)method=method==='HEAD'?'HEAD':'GET';
  if(!redirects.length)redirects.push(url.href);redirects.push(next.href);url=next;
 }}catch(error){error.facts??=facts;if(snapshotPolicy&&!statusOnly)error.failureSnapshot=tryCaptureFailureSnapshot({method,url:url.href,redirects,requestHeaders:sentHeaders,status:null,body:'',durationMs:0,requestSecrets:sentSecrets,masks:snapshotPolicy.masks});throw error}
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
