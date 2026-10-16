import {PROBE_ACCEPT,ProbeError} from '../probe-error.mjs';
import {DiscoveryStop} from './budget.mjs';
import {AUX_BODY_CAP,HOP_LIMIT,HOP_TIMEOUT_MS,MEMO_LIMIT,PARSE_BODY_CAP,PEEK_BODY_CAP,USER_AGENT} from './constants.mjs';
import {bareHost,registrableDomain} from './domain.mjs';
import {parseRobots,robotsAllows} from './robots.mjs';
const mimeOf=headers=>String(headers?.['content-type']??'').split(';')[0].trim().toLowerCase();
export const isHtml=mime=>mime==='text/html'||mime==='application/xhtml+xml';
export const isJson=mime=>mime==='application/json'||mime.endsWith('+json');
export const isText=mime=>mime==='text/plain';
const FAILURES={network:'refused',dns:'dns',timeout:'timeout',connection:'connection',redirect:'redirect',encoding:'encoding',transport:'transport',method:'method',runner:'runner'};
// Every discovery request goes through here: one budget, robots.txt, back-off, and the caller's report transport
// (the runner's pinned socket, or the Worker's fetch in a hosted demo).
// Results carry derived facts and, in memory only, the body for the caller to parse; nothing is stored or logged.
export function createFetcher({budget,notes,scope,transport}){
  const robots=new Map(),stops=new Set(),memo=new Map();
  const failure=(reason,url,extra={})=>({ok:false,reason,url,...extra});
  async function robotsFor(url,quiet){
    const key=url.origin;
    if(!robots.has(key))robots.set(key,loadRobots(url,quiet));
    return robots.get(key);
  }
  // quiet: a host that was only guessed at (the conventional api. name) says nothing when it does not exist.
  async function loadRobots(url,quiet){
    const robotsUrl=new URL('/robots.txt',url.origin);
    let response;
    try{
      response=await transport(robotsUrl.href,{signal:budget.signal,accept:'text/plain,*/*;q=0.5',userAgent:USER_AGENT,maxBody:AUX_BODY_CAP,maxHops:HOP_LIMIT,hopTimeoutMs:HOP_TIMEOUT_MS,
        beforeRequest:next=>budget.admit(next),followRedirect:next=>registrableDomain(next.hostname)===registrableDomain(url.hostname)&&(!next.port||next.origin===url.origin)});
    }catch(error){
      if(error instanceof DiscoveryStop)throw error;
      if(budget.signal.aborted)throw budget.signal.reason;
      if(!quiet)notes.add(`${bareHost(url.hostname)} did not return robots.txt, so nothing else was fetched from it.`);
      return {blocked:true};
    }
    if(response.status>=500||response.status===429||response.redirect){if(!quiet)notes.add(`${bareHost(url.hostname)} could not serve robots.txt (${response.status}), so nothing else was fetched from it.`);return {blocked:true}}
    return {rules:response.status>=200&&response.status<300?parseRobots(response.body):[]};
  }
  // owner: the owner's own pasted URL and its redirect chain are fetched whatever robots.txt says.
  // memo: a page read once is kept in memory for the run (small, few) so a later stage that wants the same URL spends no request.
  async function get(rawUrl,{accept=PROBE_ACCEPT,method='GET',maxBody=PEEK_BODY_CAP,owner=false,follow='scope',memo:remember=false,quiet=false}={}){
    let start;
    try{start=new URL(rawUrl)}catch{return failure('refused',rawUrl)}
    if(remember&&method==='GET'&&memo.has(start.href))return memo.get(start.href);
    const gate=async url=>{
      if(!owner){
        const host=bareHost(url.hostname),state=await robotsFor(url,quiet);
        if(state.blocked||!robotsAllows(state.rules,url.pathname+url.search)){
          if(!state.blocked)notes.addOnce(`robots:${host}`,`${host}'s robots.txt asks crawlers to skip some paths (such as ${url.pathname.slice(0,60)}); those were not fetched.`);
          throw new DiscoveryStop('robots',host);
        }
      }
      await budget.admit(url);
    };
    const followRedirect=next=>{
      if(follow==='none')return false;
      if(next.port&&next.origin!==start.origin)return false;
      return follow==='any'||scope.allows(next.hostname);
    };
    try{
      const response=await budget.run(()=>transport(start.href,{signal:budget.signal,accept,userAgent:USER_AGENT,maxBody,method,maxHops:HOP_LIMIT,hopTimeoutMs:HOP_TIMEOUT_MS,beforeRequest:gate,followRedirect}));
      const host=bareHost(new URL(response.url).hostname);
      const backoff=response.status===429||response.status===503||response.headers?.['retry-after'];
      if(backoff){budget.halt(host,response.status);notes.add(`${host} answered ${response.status===429||response.status===503?response.status:'with Retry-After'}, so no more requests went to it.`)}
      const answer={ok:true,startUrl:start.href,url:response.url,status:response.status,mime:mimeOf(response.headers),headers:response.headers??{},body:response.body,bytes:response.bytes,truncated:Boolean(response.truncated),
        redirect:response.redirect??null,hops:response.hops,durationMs:response.durationMs,totalMs:response.hops.reduce((sum,hop)=>sum+hop.durationMs,0)};
      if(remember&&method==='GET'&&memo.size<MEMO_LIMIT&&answer.status!==404&&answer.bytes<=PARSE_BODY_CAP&&!answer.truncated)memo.set(start.href,answer);
      return answer;
    }catch(error){
      if(error instanceof DiscoveryStop){stops.add(error.reason);return failure(error.reason,rawUrl,{detail:error.detail})}
      if(budget.cancelled)throw budget.signal.reason;
      if(budget.timedOut){stops.add('time');return failure('time',rawUrl)}
      if(error instanceof ProbeError)return failure(FAILURES[error.category]??'connection',rawUrl,{category:error.category});
      if(error?.name==='AbortError'||error?.name==='TimeoutError')return failure('timeout',rawUrl);
      // publicTarget's own refusals (private literal, bad host, credentials); anything else is a bug and must surface.
      if(error instanceof Error&&/^(Invalid public|Public target)/.test(error.message))return failure('refused',rawUrl);
      throw error;
    }
  }
  // Counts the hosts whose robots.txt was actually read; a host that could not be reached or served none is not among them.
  const readRobots=()=>Promise.allSettled([...robots.values()]).then(states=>states.filter(state=>state.status==='fulfilled'&&!state.value.blocked).length);
  return {get,stops,readRobots};
}
