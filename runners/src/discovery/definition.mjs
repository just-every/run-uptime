import {INTERVAL} from './constants.mjs';
import {everyText,seconds} from './text.mjs';
const ceil500=ms=>Math.ceil(ms/500)*500;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
// Timeout and latency limit come from what was observed: generous enough not to flap, tight enough to notice a slowdown.
export const timeoutFor=observedMs=>clamp(ceil500(3*observedMs),2000,10000);
export const latencyFor=(observedMs,timeoutMs)=>Math.min(timeoutMs,ceil500(Math.max(1000,3*observedMs)));
// The definition POST /api/monitors takes for a new monitor (the editor's shape, without assignments).
export function buildDefinition({name,url,kind,method='GET',status,observedMs,keyword,json}){
  const intervalMs=INTERVAL[kind],timeoutMs=timeoutFor(observedMs);
  return {
    name,type:keyword?'keyword':'http',url,method,
    assertions:{status,...(keyword?{bodyIncludes:keyword}:{}),...(json?{json:{path:json.path,equals:json.equals}}:{}),latencyMs:latencyFor(observedMs,timeoutMs)},
    intervalMs,timeoutMs,retries:1,probes:['local-a'],failureQuorum:1,confirmSlots:2,recoverSlots:2,freshnessMs:3*intervalMs,enabled:true,maintenanceUntil:0,
  };
}
// The same assertions in plain language, for the owner to read before ticking.
export function describeChecks(definition){
  const {assertions}=definition,checks=[];
  checks.push(`Expects ${assertions.status}`);
  if(assertions.bodyIncludes!==undefined)checks.push(`Page contains ${assertions.bodyIncludes.startsWith('"')?assertions.bodyIncludes:`"${assertions.bodyIncludes}"`}`);
  if(assertions.json)checks.push(`JSON ${assertions.json.path} is ${JSON.stringify(assertions.json.equals)}`);
  if(assertions.latencyMs)checks.push(`Responds within ${seconds(assertions.latencyMs)}`);
  checks.push(everyText(definition.intervalMs));
  return checks.map(check=>check.length>120?check.slice(0,119)+'…':check);
}
