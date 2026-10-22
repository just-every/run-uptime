import {Resolver} from 'node:dns/promises';
import {isIP} from 'node:net';
import {publicAddress} from '../../../../src/domain/public-target.mjs';
import {AUX_BODY_CAP,HOP_LIMIT,HOP_TIMEOUT_MS,SPEC_BODY_CAP,USER_AGENT} from '../constants.mjs';
import {bareHost,registrableDomain} from '../domain.mjs';
import {isJson} from '../fetcher.mjs';
import {parseJson} from '../json-health.mjs';
import {readSpec} from '../stages/openapi.mjs';
// DISCOVERY-001: the three sources that need no account. They read what any visitor can: DNS answers for the domain's usual host
// names, robots.txt and the sitemaps it names, and a published OpenAPI document. Only GET requests and DNS queries are sent, and
// only to the owner's own names.
const LABELS=['','www','api','app','docs','status','dashboard','portal','shop','blog'];
const MAX_ROUTES=12;
const resolveOnce=async(resolver,method,host)=>{try{return await resolver[method](host)}catch(error){if(['ENODATA','ENOTFOUND','ENOTIMP','ESERVFAIL'].includes(error.code))return [];throw error}};
// Real DNS lookups through the runner's own resolver: the addresses and alias a name has now, and whether any address is not public.
export async function lookupHost(host,signal){
 const resolver=new Resolver({timeout:1000,tries:1}),cancel=()=>resolver.cancel();
 signal.throwIfAborted();signal.addEventListener('abort',cancel,{once:true});
 try{
  const [a,aaaa,cname]=await Promise.all([resolveOnce(resolver,'resolve4',host),resolveOnce(resolver,'resolve6',host),resolveOnce(resolver,'resolveCname',host)]);
  const addresses=[...a,...aaaa];
  return {addresses,cname:cname[0]?.replace(/\.$/,'')??null,exists:addresses.length>0||cname.length>0,private:addresses.some(address=>!isIP(address)||!publicAddress(address))};
 }finally{signal.removeEventListener('abort',cancel)}
}
// The names a domain has now. A name that does not resolve is skipped; one with a private address is listed and not contacted.
export async function domainHosts({identifiers,signal,now}){
 const hosts=[];
 for(const label of LABELS){
  const host=label?`${label}.${identifiers.domain}`:identifiers.domain,found=await lookupHost(host,signal);
  if(!found.exists)continue;
  const shown=found.cname?`CNAME ${found.cname}`:found.addresses.slice(0,2).join(', ');
  const v4=found.addresses.filter(address=>isIP(address)===4),record=found.cname?{type:'CNAME',values:[found.cname]}:v4.length?{type:'A',values:v4}:{type:'AAAA',values:found.addresses};
  hosts.push({host,identifier:`DNS lookup of ${host}: ${shown}`.slice(0,200),seenAt:now(),private:found.private,record});
 }
 return hosts;
}
const read=(transport,url,{signal,budget,maxBody=AUX_BODY_CAP})=>transport(url,{signal,accept:'text/plain,application/xml,text/xml,*/*;q=0.5',userAgent:USER_AGENT,maxBody,maxHops:HOP_LIMIT,hopTimeoutMs:HOP_TIMEOUT_MS,
 beforeRequest:next=>budget.admit(next),followRedirect:next=>registrableDomain(next.hostname)===registrableDomain(new URL(url).hostname)});
const locs=body=>[...body.matchAll(/<loc>\s*([^<\s]{1,2048})\s*<\/loc>/gi)].map(match=>match[1].replace(/&amp;/g,'&'));
// The routes the site lists: the Sitemap lines of robots.txt (else /sitemap.xml) and one level of sitemap index, on the owner's domain.
export async function sitemapRoutes({identifiers,transport,signal,budget,notes}){
 const origin=new URL(identifiers.origin),domain=registrableDomain(origin.hostname),maps=[];
 const fetchText=async url=>{try{const response=await read(transport,url,{signal,budget});return response.status===200&&!response.redirect?response.body:null}catch(error){if(signal.aborted||error?.reason==='budget')throw error;return null}};
 const robots=await fetchText(new URL('/robots.txt',origin).href);
 for(const line of (robots??'').split(/\r?\n/)){const match=/^\s*sitemap:\s*(\S+)/i.exec(line);if(match)try{const url=new URL(match[1]);if(registrableDomain(url.hostname)===domain)maps.push(url.href)}catch{}}
 if(!maps.length)maps.push(new URL('/sitemap.xml',origin).href);
 const routes=[],seen=new Set(),queue=maps.slice(0,2);
 for(let index=0;index<queue.length&&routes.length<MAX_ROUTES;index++){
  const body=await fetchText(queue[index]);
  if(body===null){notes.add(`${bareHost(new URL(queue[index]).hostname)} did not return ${new URL(queue[index]).pathname}.`);continue}
  if(/<sitemapindex/i.test(body)){for(const loc of locs(body).slice(0,2))if(queue.length<4)queue.push(loc);continue}
  for(const loc of locs(body)){try{const url=new URL(loc);if(registrableDomain(url.hostname)!==domain||seen.has(url.href))continue;seen.add(url.href);routes.push({url:url.href,identifier:`Sitemap ${queue[index]}`.slice(0,200)});if(routes.length>=MAX_ROUTES)break}catch{}}
 }
 return routes;
}
// The GET operations of a published OpenAPI document that need no parameters, on the document's own domain.
export async function specRoutes({identifiers,fetcher,notes}){
 const response=await fetcher.get(identifiers.url,{owner:true,maxBody:SPEC_BODY_CAP});
 if(!response.ok||response.status!==200||!isJson(response.mime)||response.truncated){notes.add('The specification address did not return a readable JSON document.');return []}
 const spec=readSpec(parseJson(response.body),response.url);
 if(!spec){notes.add('That document is not an OpenAPI or Swagger specification.');return []}
 if(!spec.server)return [];
 if(registrableDomain(spec.server.hostname)!==registrableDomain(new URL(identifiers.url).hostname)){notes.add(`The specification points at ${bareHost(spec.server.hostname)}, outside its own domain, so that host was not contacted.`);return []}
 return spec.operations.filter(item=>!item.required).slice(0,MAX_ROUTES).map(item=>({url:new URL(spec.server.pathname.replace(/\/$/,'')+item.path,spec.server.origin).href,identifier:`GET ${item.path} in ${spec.title||'the specification'}`.slice(0,200)}));
}
