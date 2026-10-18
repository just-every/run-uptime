// Retained diagnostics contain measured numbers and fixed codes only. Native
// output, hostnames and transport error text never cross this boundary.
export const NETWORK_DIAGNOSTIC_LIMITS = Object.freeze({version:1,maxHops:5,maxPhaseMs:3600000,maxRttMs:60000});
export const NETWORK_DIAGNOSTIC_REASONS = Object.freeze([
 'missing-pin','private-network','invalid-pin','tool-missing','blocked','timeout',
 'aborted','unsupported-platform','unsupported-family','output-limit','invalid-output','tool-failed','hosted-transport',
]);
const categories = new Set(['timeout','connection','transport','unresolved','dns','tls']);
const fail = () => { throw Error('Invalid network diagnostics'); };
function fields(value,keys){
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)))fail();
 return value;
}
function number(value,max){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)fail();
 return value===0?0:value;
}
function address(value){
 if(typeof value!=='string'||value.length>45)fail();
 if(/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)&&value.split('.').every(part=>Number(part)<=255))return value;
 if(!value.includes(':')||!/^[0-9a-f:.]+$/i.test(value))fail();
 try{return new URL(`http://[${value}]/`).hostname.slice(1,-1)}catch{fail()}
}

export function normalizeDiagnosticPhases(value){
 fields(value,['dnsMs','connectMs','tlsMs','ttfbMs','totalMs']);
 const result={};
 for(const key of ['dnsMs','connectMs','tlsMs','ttfbMs'])result[key]=value[key]===null?null:number(value[key],NETWORK_DIAGNOSTIC_LIMITS.maxPhaseMs);
 result.totalMs=number(value.totalMs,NETWORK_DIAGNOSTIC_LIMITS.maxPhaseMs);
 return result;
}

export function normalizeNetworkDiagnostics(value){
 fields(value,['version','category','phases','route']);
 if(value.version!==1||!categories.has(value.category))fail();
 const route=fields(value.route,['tool','reason','hops']);
 if(!['traceroute','mtr','unavailable'].includes(route.tool))fail();
 if(route.tool==='unavailable'?!NETWORK_DIAGNOSTIC_REASONS.includes(route.reason):route.reason!==null)fail();
 if(!Array.isArray(route.hops)||route.hops.length>NETWORK_DIAGNOSTIC_LIMITS.maxHops)fail();
 let previous=0;
 const hops=route.hops.map(value=>{
  fields(value,['hop','address','lossPercent','rttMs']);
  if(!Number.isInteger(value.hop)||value.hop<=previous||value.hop>NETWORK_DIAGNOSTIC_LIMITS.maxHops)fail();
  previous=value.hop;
  const lossPercent=number(value.lossPercent,100),numeric=value.address===null?null:address(value.address),rttMs=value.rttMs===null?null:number(value.rttMs,NETWORK_DIAGNOSTIC_LIMITS.maxRttMs);
  if(lossPercent===100?rttMs!==null:numeric===null||rttMs===null)fail();
  return {hop:value.hop,address:numeric,lossPercent,rttMs};
 });
 return {version:1,category:value.category,phases:normalizeDiagnosticPhases(value.phases),route:{tool:route.tool,reason:route.reason,hops}};
}
