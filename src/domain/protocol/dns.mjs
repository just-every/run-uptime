import {encodeQuery,decodeResponse} from './dns-wire.mjs';
import {publicAddress} from '../public-target.mjs';
// DNS-001 lookups over DNS over HTTPS against named public recursive resolvers, and optionally the zone's own
// authoritative name server asked directly over TCP. The Worker and the runner run the same
// code with their own `get` transport, so both report the same bounded evidence: each resolver's answer code, its
// normalised records and its response time.
export const RESOLVERS={
 cloudflare:{name:'Cloudflare',url:'https://cloudflare-dns.com/dns-query'},
 google:{name:'Google',url:'https://dns.google/resolve'},
 authoritative:{name:'Authoritative server'},
};
export const DEFAULT_RESOLVERS=['cloudflare','google'];
export const RECORD_TYPES=['A','AAAA','CNAME','MX','TXT','NS','SOA','SRV','CAA'];
const CODES={A:1,AAAA:28,CNAME:5,MX:15,TXT:16,NS:2,SOA:6,SRV:33,CAA:257};
export const MAX_ANSWERS=10,MAX_VALUE=255;
const host=v=>v.toLowerCase().replace(/\.$/,'');
const unquote=v=>{const parts=[...v.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m=>m[1].replace(/\\(.)/g,'$1'));return parts.length?parts.join(''):v};
/** One record (or an owner's expected value) in the form both resolvers and the owner's settings compare in. SOA compares
 * its primary name server and responsible mailbox; the serial and timers change on every zone edit. */
export function normalizeValue(type,value){
 const v=String(value).trim().replace(/\s+/g,' ');
 const fieldsOf=n=>v.split(' ').slice(0,n);
 switch(type){
  case 'A':return v;
  case 'AAAA':return v.toLowerCase();
  case 'CNAME':case 'NS':return host(v);
  case 'MX':{const [pref,target]=fieldsOf(2);return target===undefined?host(v):`${pref} ${host(target)}`}
  case 'TXT':return unquote(v);
  case 'SRV':{const [p,w,port,target]=fieldsOf(4);return target===undefined?host(v):`${p} ${w} ${port} ${host(target)}`}
  case 'CAA':{const m=/^(\d+)\s+(\S+)\s+(.*)$/.exec(v);return m?`${m[1]} ${m[2].toLowerCase()} ${unquote(m[3])}`:v}
  case 'SOA':{const [mname,rname]=fieldsOf(2);return rname===undefined?host(v):`${host(mname)} ${host(rname)}`}
 }
 return v;
}
const bound=value=>value.length>MAX_VALUE?value.slice(0,MAX_VALUE-1)+'…':value;
/** One resolver's answer: status answer, nxdomain, servfail, refused, rcode (another code) or unavailable (the resolver
 * itself could not be read: monitor infrastructure, not the target). `get(url,{accept})` returns {status,text}. */
export async function queryResolver(get,id,name,type){
 const resolver=RESOLVERS[id],started=Date.now();
 const unavailable=detail=>({id,status:'unavailable',answers:[],ms:Date.now()-started,detail});
 let response;
 try{response=await get(`${resolver.url}?name=${encodeURIComponent(name)}&type=${type}`,{accept:'application/dns-json',maxBytes:65536})}
 catch(error){return unavailable(error?.name==='TimeoutError'||error?.category==='timeout'?'the resolver did not answer in time':'the resolver could not be reached')}
 const ms=Date.now()-started;
 if(response.status!==200)return {...unavailable(`the resolver answered HTTP ${response.status}`),ms};
 let data;try{data=JSON.parse(response.text)}catch{return {...unavailable('the resolver sent an unreadable answer'),ms}}
 if(!data||!Number.isInteger(data.Status))return {...unavailable('the resolver sent an unreadable answer'),ms};
 if(data.TC)return {...unavailable('the resolver truncated its answer'),ms};
 if(data.Status===3)return {id,status:'nxdomain',rcode:3,answers:[],ms};
 if(data.Status===2)return {id,status:'servfail',rcode:2,answers:[],ms};
 if(data.Status===5)return {id,status:'refused',rcode:5,answers:[],ms};
 if(data.Status!==0)return {id,status:'rcode',rcode:data.Status,answers:[],ms};
 const answers=[...new Set((Array.isArray(data.Answer)?data.Answer:[]).filter(row=>row?.type===CODES[type]&&typeof row.data==='string').map(row=>bound(normalizeValue(type,row.data))))].sort();
 return {id,status:'answer',rcode:0,answers:answers.slice(0,MAX_ANSWERS),...(answers.length>MAX_ANSWERS?{more:answers.length-MAX_ANSWERS}:{}),ms};
}
// The zone's first name server (lowest name) and its address: the nearest enclosing name with NS records, through
// Cloudflare's resolver. Answers about where the zone is served are evidence too, so they are kept as `server`.
async function zoneServer(get,name){
 const labels=name.split('.');
 for(let i=0;i<labels.length-1&&i<6;i++){
  const zone=labels.slice(i).join('.'),ns=await queryResolver(get,'cloudflare',zone,'NS');
  if(ns.status==='unavailable')return {detail:`its name servers could not be looked up (${ns.detail})`};
  if(ns.status!=='answer'||!ns.answers.length)continue;
  const host=ns.answers[0],a=await queryResolver(get,'cloudflare',host,'A');
  if(a.status!=='answer'||!a.answers.length)return {detail:`name server ${host} has no address`};
  if(!publicAddress(a.answers[0]))return {detail:`name server ${host} has an address this check never contacts`};
  return {host,address:a.answers[0]};
 }
 return {detail:'no name server was found for the zone'};
}
/** The zone's authoritative server, asked without recursion. `ask(address,bytes)` sends one framed query over TCP port 53. */
export async function queryAuthoritative(get,ask,name,type){
 const started=Date.now(),unavailable=(detail,server)=>({id:'authoritative',status:'unavailable',answers:[],ms:Date.now()-started,detail:detail.slice(0,120),...(server?{server}:{})});
 const zone=await zoneServer(get,name);if(!zone.host)return unavailable(zone.detail);
 const server=`${zone.host} ${zone.address}`.slice(0,300),query=encodeQuery(name,type),asked=Date.now();
 let response;
 try{response=decodeResponse(await ask(zone.address,query.bytes),query.id,type)}
 catch(error){return unavailable(error?.category==='vantage'?error.reason:`the name server could not be asked (${String(error?.reason??error?.message??'error').slice(0,60)})`,server)}
 const ms=Date.now()-asked;
 if(!response.authoritative)return {...unavailable('the name server did not answer authoritatively',server),ms};
 const base={id:'authoritative',rcode:response.rcode,ms,server};
 if(response.rcode===3)return {...base,status:'nxdomain',answers:[]};
 if(response.rcode===2)return {...base,status:'servfail',answers:[]};
 if(response.rcode===5)return {...base,status:'refused',answers:[]};
 if(response.rcode!==0)return {...base,status:'rcode',answers:[]};
 const answers=[...new Set(response.answers.map(v=>bound(normalizeValue(type,v))))].sort();
 return {...base,status:'answer',answers:answers.slice(0,MAX_ANSWERS),...(answers.length>MAX_ANSWERS?{more:answers.length-MAX_ANSWERS}:{})};
}
/** DNS facts for one attempt: every selected resolver, queried together. */
export async function dnsFacts(get,settings,ask){
 return {name:settings.name,type:settings.recordType,resolvers:await Promise.all(settings.resolvers.map(id=>id==='authoritative'?queryAuthoritative(get,ask,settings.name,settings.recordType):queryResolver(get,id,settings.name,settings.recordType)))};
}
