import {ProtocolError} from './protocol-error.mjs';
// DOMAIN-001 registration facts from RDAP: IANA's bootstrap names the registry's RDAP service, the registry answers for
// the domain, and its registrar's RDAP record (the registry's "related" link) is read as a second source. Each source and
// its own update time are kept. A missing, redacted or conflicting expiry date is never treated as registered.
export const BOOTSTRAP='https://data.iana.org/rdap/dns.json';
const DAY=86400000;
const json=(text,what)=>{try{return JSON.parse(text)}catch{throw new ProtocolError('registry',`${what} sent an unreadable answer`)}};
const date=value=>{const at=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(at)?at:null};
const event=(data,...actions)=>{for(const action of actions){const found=(Array.isArray(data?.events)?data.events:[]).find(e=>e?.eventAction===action);if(found)return date(found.eventDate)}return null};
const redactedExpiry=data=>Array.isArray(data?.redacted)&&data.redacted.some(r=>/expir/i.test(JSON.stringify(r?.name??'')));
const short=url=>url.length>300?url.slice(0,300):url;
/** The registry RDAP base for a domain: the longest matching suffix in IANA's bootstrap, HTTPS only. */
export function registryBase(bootstrap,name){
 const labels=name.split('.');
 for(let i=1;i<labels.length;i++){
  const suffix=labels.slice(i).join('.');
  const service=(Array.isArray(bootstrap?.services)?bootstrap.services:[]).find(s=>Array.isArray(s?.[0])&&s[0].some(t=>String(t).toLowerCase()===suffix));
  if(!service)continue;
  const https=(Array.isArray(service[1])?service[1]:[]).find(u=>typeof u==='string'&&u.startsWith('https://'));
  if(!https)throw new ProtocolError('registry',`The .${suffix} registry publishes RDAP only over plain HTTP, which this check does not use`);
  return https.endsWith('/')?https:https+'/';
 }
 throw new ProtocolError('registry',`No registry publishes RDAP for .${labels.at(-1)} in IANA's bootstrap`);
}
// Each read is bounded: the bootstrap is about 70 KB, a domain record a few KB.
async function source(get,url,what,maxBytes=65536){
 let response;
 try{response=await get(url,{accept:'application/rdap+json, application/json',maxBytes})}
 catch{throw new ProtocolError('registry',`${what} could not be reached`)}
 return response;
}
/** Registration facts for `name`. Throws ProtocolError('registry') when the registry itself cannot be read. */
export async function domainFacts(get,name){
 const bootstrap=await source(get,BOOTSTRAP,'IANA’s RDAP bootstrap',262144);
 if(bootstrap.status!==200)throw new ProtocolError('registry',`IANA’s RDAP bootstrap answered HTTP ${bootstrap.status}`);
 const url=`${registryBase(json(bootstrap.text,'IANA’s RDAP bootstrap'),name)}domain/${name}`;
 const registry=await source(get,url,'The registry');
 if(registry.status===404)return {name,registered:false,source:short(url)};
 if(registry.status!==200)throw new ProtocolError('registry',`The registry answered HTTP ${registry.status}`);
 const data=json(registry.text,'The registry');
 const facts={name,registered:true,source:short(url),sourceUpdatedAt:event(data,'last update of RDAP database'),expiresAt:event(data,'expiration'),redacted:redactedExpiry(data),
  statuses:(Array.isArray(data.status)?data.status:[]).filter(s=>typeof s==='string').slice(0,10).map(s=>s.slice(0,60))};
 const link=(Array.isArray(data.links)?data.links:[]).find(l=>l?.rel==='related'&&typeof l.href==='string'&&l.href.startsWith('https://')&&/\/domain\//i.test(l.href)&&l.href!==url);
 if(link){
  try{
   const response=await get(link.href,{accept:'application/rdap+json, application/json',maxBytes:65536});
   if(response.status!==200)facts.registrar={source:short(link.href),unavailable:`HTTP ${response.status}`};
   else{const record=JSON.parse(response.text);facts.registrar={source:short(link.href),expiresAt:event(record,'registrar expiration','expiration'),sourceUpdatedAt:event(record,'last update of RDAP database')}}
  }catch{facts.registrar={source:short(link.href),unavailable:'unreachable or unreadable'}}
 }
 facts.conflict=Boolean(facts.expiresAt!==null&&facts.registrar?.expiresAt!=null&&Math.abs(facts.expiresAt-facts.registrar.expiresAt)>DAY);
 return facts;
}
