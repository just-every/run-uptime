import {validateDefinition} from '../../../../src/domain/policy.mjs';
import {publicTarget,isLoopbackHostname} from '../../../../src/domain/public-target.mjs';
import {PRIVATE_ADDRESS_MESSAGE} from '../../../../src/domain/discovery-sources.mjs';
import {createFetcher,isHtml} from '../fetcher.mjs';
import {createScope} from '../scope.mjs';
import {bareHost,registrableDomain} from '../domain.mjs';
import {makeProposal,chooseMethod,ms} from '../proposal.mjs';
import {explainFailure} from '../primary.mjs';
import {clip,proposalKey} from '../text.mjs';
import {parseHtml} from '../html.mjs';
// DISCOVERY-001: an address a source named becomes a candidate with its provenance (where it was seen, and when) and, if a
// read-only GET shows it answering, a filled-in proposal. Every request goes through the discovery fetcher: one budget, robots.txt
// for crawled routes, back-off and the runner's pinned public transport, so a private, loopback or link-local target is refused
// before anything is sent.
const OUTCOME={page:path=>`Customers can open ${path} and it answers.`,api:path=>`The API route ${path} keeps answering its callers.`,spec:()=>'The API specification stays published for integrators.',host:host=>`${host} keeps serving customers.`};
const PROPOSAL_KIND={page:'page',api:'api',spec:'spec',host:'subdomain'};
export function createCandidates({budget,notes,transport,now}){
 const fetchers=new Map();
 const fetcherFor=url=>{const domain=registrableDomain(url.hostname);if(!fetchers.has(domain))fetchers.set(domain,createFetcher({budget,notes,scope:createScope(url.hostname),transport}));return fetchers.get(domain)};
 const refused=(url,identifier,kind,reason)=>({key:proposalKey(url),url,kind,identifier,seenAt:now(),reason:clip(reason,200),proposal:null});
 // One HTTP route. A GET that answers 2xx (or 401/403 for an API route, which is alive but wants a key) becomes a proposal.
 // owner: an address the owner's source named directly (a host, a deployed site, the specification) is read whatever robots.txt says.
 async function route(rawUrl,{kind,identifier,name,owner=false}){
  let url;
  try{url=publicTarget(rawUrl);if(isLoopbackHostname(url.hostname))throw Error('forbidden')}catch{return refused(rawUrl,identifier,kind,PRIVATE_ADDRESS_MESSAGE)}
  const response=await fetcherFor(url).get(url.href,{owner});
  if(!response.ok)return refused(url.href,identifier,kind,response.reason==='refused'?PRIVATE_ADDRESS_MESSAGE:response.reason==='robots'?`${bareHost(url.hostname)}'s robots.txt asks crawlers to skip this path.`:explainFailure(response,bareHost(url.hostname)));
  const alive=kind==='api'&&(response.status===401||response.status===403);
  if(!(response.status>=200&&response.status<300)&&!alive)return refused(url.href,identifier,kind,`It answered ${response.status}, so nothing is proposed.`);
  const choice=await chooseMethod(fetcherFor(url),response,{owner});
  if(!choice)return refused(url.href,identifier,kind,'It is too large to check and does not answer HEAD.');
  const proposal=makeProposal({kind:PROPOSAL_KIND[kind],name:name??(url.pathname==='/'?bareHost(url.hostname):clip(`${bareHost(url.hostname)}${url.pathname}`,100)),url:response.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,oversize:choice.oversize,
   reason:`${alive?`Answers ${choice.status} without a key, so it is alive`:`Answers ${choice.status}`} in ${ms(choice.observedMs)}`});
  const path=url.pathname==='/'?bareHost(url.hostname):url.pathname,title=isHtml(response.mime)?parseHtml(response.body,response.url).title:'';
  return {key:proposalKey(url.href),url:url.href,kind,identifier,seenAt:now(),reason:null,proposal:{name:proposal.name,reason:proposal.reason,checks:proposal.checks,definition:{...proposal.definition,outcome:clip(OUTCOME[kind](path),500)}},title};
 }
 // Protocol checks for a host the source named: its certificate, and its DNS record when the source states one.
 function protocol(host,identifier,record){
  const found=[];
  const tls=validateDefinition({name:clip(`${host} certificate`,100),type:'tls',tls:{host,port:443},outcome:`Customers never meet an expired certificate on ${host}.`,enabled:true},[]);
  found.push({key:proposalKey(`https://${host}/#tls`),url:`https://${host}/`,kind:'tls',identifier,seenAt:now(),reason:null,proposal:{name:tls.name,reason:`Certificate of ${host} on port 443`,checks:['Certificate is valid','Warns 30, 14 and 7 days before expiry'],definition:tls}});
  if(record&&['A','AAAA','CNAME'].includes(record.type)&&record.values.length){
   const values=record.values.slice(0,8),dns=validateDefinition({name:clip(`${host} ${record.type} record`,100),type:'dns',dns:{name:host,recordType:record.type,expect:{values,match:'exact'}},outcome:`${host} keeps resolving to what your zone says.`,enabled:true},[]);
   found.push({key:proposalKey(`https://${host}/#dns-${record.type.toLowerCase()}`),url:`https://${host}/`,kind:'dns',identifier,seenAt:now(),reason:null,proposal:{name:dns.name,reason:clip(`Your source lists ${record.type} ${values.slice(0,2).join(', ')}`,200),checks:[clip(`${record.type} answers ${values.slice(0,2).join(', ')}`,120)],definition:dns}});
  }
  return found;
 }
 // A browser check of a page whose title is known: open it and require that title. It costs browser-minutes.
 function browser(candidate,identifier){
  const title=candidate.title?.trim();if(!candidate.proposal||!title||title.length>100)return null;
  const definition=validateDefinition({name:clip(`${bareHost(new URL(candidate.url).hostname)} in a browser`,100),type:'flow',url:candidate.url,flow:{intent:clip(`A visitor opens ${candidate.url} and sees the page`,300),steps:[{kind:'goto',url:candidate.url}],outcomes:[{id:'title',what:'text',value:title}]},
   outcome:clip(`A visitor can load ${candidate.url} in a real browser.`,500),enabled:true},[]);
  return {key:proposalKey(`${candidate.url}#browser`),url:candidate.url,kind:'browser',identifier,seenAt:now(),reason:null,proposal:{name:definition.name,reason:'The page loads in a real browser and shows its title',checks:[clip(`Page shows “${title}”`,120),'Every 5 minutes, in a browser'],definition}};
 }
 return {route,protocol,browser,refused};
}
