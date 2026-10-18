import {publicTarget} from '../public-target.mjs';
import {RESOLVERS,RECORD_TYPES,DEFAULT_RESOLVERS} from './dns.mjs';
// Settings of the protocol monitors (TCP-001, DNS-001, TLS-001, DOMAIN-001), validated by the same function on the
// control plane, the Worker and the runner. Each type keeps its settings in one object named after it; `url` is derived
// from them for display and identity (tcp://host:port, tls://host:port, dns://name/TYPE, domain://name).
export const PROTOCOL_TYPES=['tcp','udp','dns','tls','domain'];
export const isProtocol=type=>PROTOCOL_TYPES.includes(type);
const fields=(value,allowed,label)=>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`${label} settings required`);
 const unknown=Object.keys(value).filter(k=>!allowed.includes(k));
 if(unknown.length)throw Error(`Invalid ${label} settings: unknown field${unknown.length>1?'s':''} ${unknown.map(k=>`“${k.slice(0,60)}”`).join(', ')}; it takes ${allowed.join(', ')}`);
 return value;
};
// A public host name or address, as a probe URL's host would be: never private, loopback, link-local or metadata.
export function publicHost(value,label='Host'){
 if(typeof value!=='string'||!value.trim()||value.length>253)throw Error(`${label} required`);
 const host=value.trim().toLowerCase().replace(/\.$/,'');
 try{return publicTarget(`https://${host.includes(':')&&!host.startsWith('[')?`[${host}]`:host}/`).hostname.replace(/^\[|\]$/g,'')}catch(error){throw Error(`${label}: ${/forbidden/.test(error.message)?'a private, loopback or link-local address cannot be monitored':'not a valid public host name or address'}`)}
}
// A registrable or record name: letters, digits, hyphens and underscores in dot-separated labels (punycode for others).
export function dnsName(value,label='Name'){
 if(typeof value!=='string')throw Error(`${label} required`);
 const name=value.trim().toLowerCase().replace(/\.$/,'');
 if(!name||name.length>253||!name.split('.').every(part=>/^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(part)))throw Error(`${label} must be a DNS name such as example.com`);
 return name;
};
const port=(value,fallback,label)=>{const n=value??fallback;if(!Number.isInteger(n)||n<1||n>65535)throw Error(`${label} must be a port from 1 to 65535`);return n};
const text=(value,max,label)=>{if(value===undefined)return undefined;if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw Error(`${label} must be text of at most ${max} characters`);return value.trim()};
// Staged expiry warnings: one to five whole-day thresholds, largest first.
function warnDays(value,fallback,label){
 const days=value??fallback;
 if(!Array.isArray(days)||!days.length||days.length>5||days.some(d=>!Number.isInteger(d)||d<1||d>365)||new Set(days).size!==days.length)throw Error(`${label} warnings take one to five different whole numbers of days from 1 to 365`);
 return [...days].sort((a,b)=>b-a);
}
function values(value,label){
 if(!Array.isArray(value)||!value.length||value.length>10||value.some(v=>typeof v!=='string'||!v.trim()||v.length>255||/[\x00-\x1f\x7f]/.test(v)))throw Error(`${label} take one to ten values of at most 255 characters`);
 return value.map(v=>v.trim());
}
/** {settings, url} for a protocol monitor, or an error naming the field. */
export function protocolSettings(type,input){
 if(type==='tcp'){
  const s=fields(input.tcp,['host','port','readBanner','bannerIncludes'],'TCP');
  const host=publicHost(s.host),p=port(s.port,undefined,'TCP port'),bannerIncludes=text(s.bannerIncludes,100,'Expected banner text');
  if(s.readBanner!==undefined&&typeof s.readBanner!=='boolean')throw Error('readBanner must be true or false');
  const readBanner=Boolean(s.readBanner||bannerIncludes);
  return {settings:{host,port:p,...(readBanner?{readBanner}:{}),...(bannerIncludes?{bannerIncludes}:{})},url:`tcp://${host.includes(':')?`[${host}]`:host}:${p}`};
 }
 if(type==='udp'){
  const s=fields(input.udp,['host','port','payloadHex','expectedHex','match'],'UDP');
  const host=publicHost(s.host),p=port(s.port,undefined,'UDP port');
  const hex=(v,max,label)=>{if(typeof v!=='string'||!v.length||v.length>max*2||v.length%2||!/^[0-9a-f]+$/i.test(v))throw Error(`${label} must be hexadecimal bytes (1–${max} bytes)`);return v.toLowerCase()};
  const payloadHex=hex(s.payloadHex,256,'UDP request'),expectedHex=hex(s.expectedHex,1024,'Expected UDP response'),match=s.match??'exact';
  if(!['exact','includes'].includes(match))throw Error('UDP response match must be exact or includes');
  return {settings:{host,port:p,payloadHex,expectedHex,match},url:`udp://${host.includes(':')?`[${host}]`:host}:${p}`};
 }
 if(type==='tls'){
  const s=fields(input.tls,['host','port','warnDays','owner'],'TLS');
  const host=publicHost(s.host),p=port(s.port,443,'TLS port'),owner=text(s.owner,100,'Accountable owner');
  return {settings:{host,port:p,warnDays:warnDays(s.warnDays,[30,14,7],'Certificate expiry'),...(owner?{owner}:{})},url:`tls://${host.includes(':')?`[${host}]`:host}:${p}`};
 }
 if(type==='dns'){
  const s=fields(input.dns,['name','recordType','resolvers','expect','approved'],'DNS');
  const name=dnsName(s.name),recordType=s.recordType??'A';
  if(!RECORD_TYPES.includes(recordType))throw Error(`Record type must be one of ${RECORD_TYPES.join(', ')}`);
  const resolvers=s.resolvers??DEFAULT_RESOLVERS;
  if(!Array.isArray(resolvers)||!resolvers.length||resolvers.length>3||new Set(resolvers).size!==resolvers.length||resolvers.some(r=>!Object.hasOwn(RESOLVERS,r)))throw Error(`Resolvers must be one or more of ${Object.keys(RESOLVERS).join(', ')}`);
  let expect;
  if(s.expect!==undefined){
   const e=fields(s.expect,['values','match','absent'],'Expected answer');
   if(e.absent!==undefined){if(e.absent!==true||e.values!==undefined||e.match!==undefined)throw Error('An absent record takes only {"absent":true}');expect={absent:true}}
   else{const match=e.match??'exact';if(!['exact','includes'].includes(match))throw Error('Expected values match exactly or as included values');expect={values:values(e.values,'Expected values'),match}}
  }
  let approved;
  if(s.approved!==undefined){
   const a=fields(s.approved,['values'],'Approved change');
   if(!expect?.values)throw Error('An approved change needs expected values to change from');
   approved={values:values(a.values,'Approved change values')};
  }
  return {settings:{name,recordType,resolvers,...(expect?{expect}:{}),...(approved?{approved}:{})},url:`dns://${name}/${recordType}`};
 }
 if(type==='domain'){
  const s=fields(input.domain,['name','warnDays','owner'],'Domain');
  const name=dnsName(s.name,'Domain');
  if(!name.includes('.'))throw Error('Domain must be a registered name such as example.com');
  const owner=text(s.owner,100,'Accountable owner');
  return {settings:{name,warnDays:warnDays(s.warnDays,[60,30,14,7],'Registration expiry'),...(owner?{owner}:{})},url:`domain://${name}`};
 }
 throw Error('Unsupported monitor type');
}
// Cadence bounds by type. TLS and domain expiry checks run at least hourly (SCHEDULE-002).
export const PROTOCOL_TIMING={
 udp:{interval:[30000,86400000,60000],timeout:[50,10000,3000]},
 tcp:{interval:[5000,86400000,60000],timeout:[50,10000,3000]},
 dns:{interval:[5000,86400000,60000],timeout:[50,10000,3000]},
 tls:{interval:[5000,3600000,3600000],timeout:[50,10000,5000]},
 domain:{interval:[5000,3600000,3600000],timeout:[1000,10000,10000]},
};
