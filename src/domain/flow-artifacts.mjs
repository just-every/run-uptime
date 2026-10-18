import {redactFailureText} from './failure-snapshot-text.mjs';
export const FLOW_ARTIFACT_LIMITS=Object.freeze({videoBytes:131072,traceBytes:65536,waterfall:60,console:20,textBytes:1024});
const reasons=new Set(['capture_limit','capture_timeout','capture_aborted','capture_invalid','browser_unavailable','capture_failed','cancelled','policy_changed','policy_disabled','custody_unavailable']);
const fail=()=>{throw Error('Invalid browser failure artifacts')};
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>{if(!plain(v)||Object.keys(v).sort().join(',')!==[...keys].sort().join(','))fail()};
const bytes=v=>new TextEncoder().encode(v).length;
const ms=v=>Number.isFinite(v)&&v>=0&&v<=3600000;
function opaque(value,format,max){
 if(plain(value)&&Object.keys(value).join(',')==='unavailable'&&reasons.has(value.unavailable))return {unavailable:value.unavailable};
 exact(value,['format','data']);
 if(value.format!==format||typeof value.data!=='string'||value.data.length>Math.ceil(max/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.data))fail();
 let raw;try{raw=atob(value.data)}catch{fail()}
 if(raw.length>max||btoa(raw)!==value.data)fail();
 const signature=format==='zip'?[80,75,3,4]:[26,69,223,163];
 if(raw.length<signature.length||signature.some((b,i)=>raw.charCodeAt(i)!==b))fail();
 return {format,data:value.data};
}
export function normalizeFlowArtifacts(value,{secrets=[],allowEmail=false}={}){
 exact(value,['video','trace','waterfall','console']);
 if(!Array.isArray(value.waterfall)||value.waterfall.length>60||!Array.isArray(value.console)||value.console.length>20)fail();
 const waterfall=value.waterfall.map(entry=>{
  exact(entry,['url','method','status','startMs','durationMs']);
  if(typeof entry.url!=='string'||bytes(entry.url)>2048||typeof entry.method!=='string'||!/^[A-Z]{1,16}$/.test(entry.method)||entry.status!==null&&(!Number.isInteger(entry.status)||entry.status<100||entry.status>599)||!ms(entry.startMs)||!ms(entry.durationMs))fail();
  let url;try{url=new URL(entry.url)}catch{fail()}
  if(!['http:','https:'].includes(url.protocol))fail();
  url.username='';url.password='';url.search='';url.hash='';
  url.pathname=url.pathname.split('/').map(part=>{let decoded;try{decoded=decodeURIComponent(part)}catch{fail()}const clean=redactFailureText(decoded,secrets,allowEmail);return clean===decoded?part:encodeURIComponent(clean)}).join('/');
  if(bytes(url.href)>2048)fail();
  return {url:url.href,method:entry.method,status:entry.status,startMs:entry.startMs,durationMs:entry.durationMs};
 });
 const console=value.console.map(entry=>{exact(entry,['type','text']);if(!['error','warning'].includes(entry.type)||typeof entry.text!=='string'||bytes(entry.text)>1024)fail();const text=redactFailureText(entry.text,secrets,allowEmail);if(bytes(text)>1024)fail();return {type:entry.type,text}});
 return {video:opaque(value.video,'webm',131072),trace:opaque(value.trace,'zip',65536),waterfall,console};
}
export function discardFlowArtifacts(value,reason='policy_changed'){
 return {...value,video:{unavailable:reason},trace:{unavailable:reason},waterfall:[],console:[]};
}
