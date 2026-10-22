import {createNotes} from '../notes.mjs';
import {MAX_NOTES} from '../constants.mjs';
import {SOURCE_KINDS,SOURCE_LIMITS,PRIVATE_ADDRESS_MESSAGE,isDeploy,validateRunSpec} from '../../../../src/domain/discovery-sources.mjs';
import {budgetFor} from './budget.mjs';
import {createCandidates} from './candidates.mjs';
import {domainHosts,sitemapRoutes,specRoutes} from './public-sources.mjs';
import {readProviderCredential} from './credentials.mjs';
import {providerCall} from './provider-http.mjs';
import {createFetcher} from '../fetcher.mjs';
import {createScope} from '../scope.mjs';
import {listCloudflare} from './providers/cloudflare.mjs';
import {listRoute53} from './providers/route53.mjs';
import {listGitHub} from './providers/github.mjs';
import {listVercel} from './providers/vercel.mjs';
import {listNetlify} from './providers/netlify.mjs';
import {listCodeDeploy} from './providers/codedeploy.mjs';
// DISCOVERY-001: one owner-started run of one authorized source, read-only throughout: provider accounts through their allowlisted
// calls, public names through GET and DNS. It proposes; it adopts nothing, changes nothing and schedules nothing. A deploy source
// reads only events since the previous run, so the sites earlier runs found are read again: still answering, they stay candidates;
// not answering, they are gone.
const ADAPTERS={cloudflare:listCloudflare,route53:listRoute53,'github-actions':listGitHub,vercel:listVercel,netlify:listNetlify,codedeploy:listCodeDeploy};
const PROTOCOL_HOSTS=3;
export async function runSource(rawSpec,{transport,signal,directory,call=providerCall,now=Date.now}){
 const spec=validateRunSpec(rawSpec),started=now(),notes=createNotes(MAX_NOTES),budget=budgetFor(signal),candidates=createCandidates({budget,notes,transport,now}),found=new Map();
 const add=candidate=>{if(candidate&&!found.has(candidate.key)&&found.size<SOURCE_LIMITS.candidates)found.set(candidate.key,candidate)};
 let hosts=[],sites=[],providerRequests=0;
 if(spec.kind==='domain')hosts=await domainHosts({identifiers:spec.identifiers,signal,now});
 else if(spec.kind==='website-files')for(const item of await sitemapRoutes({identifiers:spec.identifiers,transport,signal,budget,notes}))add(await candidates.route(item.url,{kind:'page',identifier:item.identifier}));
 else if(spec.kind==='openapi'){
  add(await candidates.route(spec.identifiers.url,{kind:'spec',owner:true,identifier:'The specification address',name:'API specification'}));
  const fetcher=createFetcher({budget,notes,scope:createScope(new URL(spec.identifiers.url).hostname),transport});
  for(const item of await specRoutes({identifiers:spec.identifiers,fetcher,notes}))add(await candidates.route(item.url,{kind:'api',identifier:item.identifier}));
 }else{
  const provider=SOURCE_KINDS[spec.kind].provider,credential=await readProviderCredential(provider,spec.identifiers,directory);
  const listed=await ADAPTERS[spec.kind]({identifiers:spec.identifiers,credential,call:options=>{providerRequests++;return call({...options,signal})},since:spec.since,now});
  hosts=listed.hosts;sites=listed.sites;for(const note of listed.notes)notes.add(note);
 }
 let protocols=0,browsers=0;
 const look=async(url,identifier,record)=>{
  const root=await candidates.route(url,{kind:'host',identifier,owner:true});add(root);
  if(!root.proposal)return;
  const host=new URL(root.url).hostname;
  if(protocols<PROTOCOL_HOSTS){protocols++;for(const candidate of candidates.protocol(host,identifier,record))add(candidate)}
  if(!browsers){const check=candidates.browser(root,identifier);if(check){browsers++;add(check)}}
 };
 for(const item of hosts.slice(0,SOURCE_LIMITS.hosts)){
  if(item.private){add(candidates.refused(`https://${item.host}/`,item.identifier,'host',PRIVATE_ADDRESS_MESSAGE));continue}
  await look(`https://${item.host}/`,item.identifier,item.record);
 }
 const named=new Set();
 for(const item of sites.slice(0,SOURCE_LIMITS.hosts)){named.add(item.url);await look(item.url,item.identifier)}
 const gone=[];
 if(isDeploy(spec.kind))for(const url of spec.known){
  if(named.has(url)||[...found.values()].some(candidate=>candidate.url===url))continue;
  const before=found.size;await look(url,'Found by an earlier run');
  const again=[...found.values()].slice(before).find(candidate=>candidate.kind==='host'&&candidate.url===url);
  if(!again?.proposal){gone.push(url);if(again)found.delete(again.key)}
 }
 const result=[...found.values()].map(({title:_,...candidate})=>candidate);
 if(found.size>=SOURCE_LIMITS.candidates)notes.add(`Stopped at ${SOURCE_LIMITS.candidates} candidates, so some were not proposed.`);
 return {source:spec.source,startedAt:started,requests:budget.used+providerRequests,durationMs:now()-started,notes:notes.list(),candidates:result,gone};
}
