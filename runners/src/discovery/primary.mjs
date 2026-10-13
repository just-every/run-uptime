import {publicTarget} from '../../../src/domain/public-target.mjs';
import {PROBE_ACCEPT} from '../public-http.mjs';
import {HTML_ACCEPT,JSON_ASSERT_LIMIT,PARSE_BODY_CAP} from './constants.mjs';
import {bareHost,isApiHost,isStatusHost,registrableDomain} from './domain.mjs';
import {isHtml,isJson} from './fetcher.mjs';
import {brandFromTitle,parseHtml} from './html.mjs';
import {healthAssertion,parseJson} from './json-health.mjs';
import {chooseMethod,makeProposal,ms,RANK} from './proposal.mjs';
import {brandOf,pasteName} from './naming.mjs';
const tidy=href=>{const url=new URL(href);return url.pathname==='/'&&!url.search?`${url.protocol}//${url.host}`:url.href};
const hostOf=value=>bareHost(new URL(value).hostname);
// The owner's text becomes a public http(s) URL, or a plain-language reason it cannot.
export function normalizeInput(input){
  const text=String(input??'').trim();
  if(!text)return {note:'Paste the address of a site or API to check.'};
  let url;
  try{url=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text)?text:'https://'+text)}catch{return {note:'That is not a web address Uptime can read.'}}
  if(!['http:','https:'].includes(url.protocol))return {note:'Only http and https addresses can be monitored.'};
  if(url.username||url.password)return {note:'Addresses with a username or password are not checked; credentials stay in the runner installation.'};
  url.hash='';
  try{return {url:publicTarget(url.href)}}catch(error){
    return {note:/forbidden/.test(error.message)?`${bareHost(url.hostname)} is a private, loopback or link-local address, so it was not contacted. Uptime only monitors public addresses.`:'That is not a valid public web address.'};
  }
}
export function explainFailure(failure,host){
  switch(failure.reason){
    case 'refused':return `${host} could not be found, or points to a private address, so it was not contacted.`;
    case 'dns':return `Could not look up ${host}.`;
    case 'timeout':case 'time':return `${host} did not answer in time.`;
    case 'connection':return `Could not connect to ${host}.`;
    case 'redirect':return `${host} sent a redirect that cannot be followed here (a loop, a missing address or a move from HTTPS to HTTP).`;
    case 'encoding':return `${host} compressed its answer anyway, which a monitor cannot read.`;
    case 'transport':return `The connection to ${host} broke while it was answering.`;
    default:return `${host} was not checked (${failure.reason}).`;
  }
}
function pickKeyword(facts,label,bodies){
  for(const candidate of [facts.siteName,brandFromTitle(facts.title,label),facts.h1.length<=60?facts.h1:'']){
    const text=candidate?.trim();
    if(!text||text.length<3||text.length>100||/\d/.test(text))continue;
    if(bodies.every(body=>body.includes(text)))return text;
  }
}
// The pasted URL: fetch it with a browser-like Accept to follow redirects and read the page, then once more with the exact
// headers a scheduled probe sends, so what we pre-fill is what the monitor will see. Returns null when nothing can be pre-filled.
export async function runPrimary({target,fetcher,notes,scope}){
  const inputHost=bareHost(target.hostname);
  const first=await fetcher.get(target.href,{owner:true,accept:HTML_ACCEPT,follow:'any',maxBody:PARSE_BODY_CAP});
  if(!first.ok){notes.add(explainFailure(first,inputHost));return {finalUrl:target.href,context:null}}
  const finalUrl=new URL(first.url),host=bareHost(finalUrl.hostname);
  if(first.redirect){notes.add(`${tidy(first.url)} redirects to ${tidy(first.redirect)}, which was not followed (another port or too many hops), so nothing is pre-filled.`);return {finalUrl:first.url,context:null}}
  const redirected=first.hops.length>1;
  if(redirected){
    const moved=registrableDomain(host)!==registrableDomain(inputHost);
    notes.add(`${tidy(target.href)} redirects to ${tidy(first.url)}${moved?', a different domain':''}, so the final address is the one monitored.`);
  }
  const apiHost=isApiHost(host);
  const sees=first.status;
  const authenticated=(sees===401||sees===403)&&(apiHost||isJson(first.mime));
  if(!(sees>=200&&sees<300)&&!authenticated){
    notes.add(`The URL answered ${sees}${sees===401||sees===403?' (sign-in required or automated requests blocked)':sees>=500?' (it looks down right now)':sees===429?' (it is rate limiting requests)':''}, so nothing is pre-filled.`);
    return {finalUrl:first.url,context:null};
  }
  scope.addDomain(host);
  const facts=isHtml(first.mime)?parseHtml(first.body,first.url):{title:'',siteName:'',canonical:'',h1:'',links:[],anchors:[]};
  for(const link of facts.links){const linked=new URL(link);if(isStatusHost(linked.hostname))scope.addStatusHost(linked.hostname)}
  // The monitor's own view of the final address.
  const second=await fetcher.get(first.url,{owner:true,accept:PROBE_ACCEPT,follow:'none'});
  if(!second.ok){notes.add(`${explainFailure(second,host)} It did not answer a repeat request with the monitor's headers, so nothing is pre-filled.`);return {finalUrl:first.url,context:null}}
  if(second.status!==sees&&!(second.status>=200&&second.status<300&&sees>=200&&sees<300)){
    notes.add(second.status===406
      ?`${host} answers 406 to a monitor's request headers (a browser gets ${sees}), so a monitor would fail there and nothing is pre-filled.`
      :`${host} answers ${second.status} to a monitor's request headers (${sees} to a browser's), so nothing is pre-filled.`);
    return {finalUrl:first.url,context:null};
  }
  const choice=await chooseMethod(fetcher,second,{owner:true});
  if(!choice){notes.add(`${tidy(first.url)} is too large for the 64 KiB body limit and does not answer HEAD requests, so nothing is pre-filled.`);return {finalUrl:first.url,context:null}}
  const observedMs=Math.max(first.durationMs,choice.observedMs);
  const label=registrableDomain(host).split('.')[0],isJsonBody=isJson(second.mime),isApi=apiHost||isJson(first.mime);
  let keyword,json;
  if(choice.method==='GET'){
    if(isHtml(first.mime)&&isHtml(second.mime))keyword=pickKeyword(facts,label,[first.body,second.body]);
    if(isJsonBody&&second.bytes<=JSON_ASSERT_LIMIT){const value=parseJson(second.body);if(value!==undefined)json=healthAssertion(value)??undefined}
  }
  const kind=json?'health':isApi?'api':isStatusHost(host)||label.includes('status')||/\bstatus( page)?$/i.test(facts.title)?'status-page':'page';
  const evidence=authenticated?`answers ${choice.status} without a key, so it is alive · ${ms(observedMs)}`:`${choice.status} in ${ms(observedMs)}`;
  const brand=brandOf({facts,label}),name=pasteName({brand,url:finalUrl,isApi});
  const proposal=makeProposal({kind,rank:RANK.page,name,url:first.url,method:choice.method,status:choice.status,observedMs,keyword,json,oversize:choice.oversize,
    reason:redirected?`${tidy(target.href)} redirects here · ${evidence}`:evidence});
  return {finalUrl:first.url,context:{url:finalUrl,host,facts,isApi,brand,proposal}};
}
