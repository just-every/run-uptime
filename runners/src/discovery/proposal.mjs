import {GET_BODY_MARGIN} from './constants.mjs';
import {buildDefinition,describeChecks} from './definition.mjs';
import {clip,proposalKey} from './text.mjs';
// Lower ranks come first. Pre-ticking and the 12-proposal cap both follow this order.
export const RANK={page:0,'status-page':10,health:20,api:30,spec:40,subdomain:50,more:60};
// A page near the 64 KiB GET body limit would start failing as a probe, so it is watched with HEAD (status and speed only).
// One HEAD request confirms the server answers it the same way.
export async function chooseMethod(fetcher,observation,{owner=false}={}){
  if(!observation.truncated&&observation.bytes<=GET_BODY_MARGIN)return {method:'GET',status:observation.status,observedMs:observation.durationMs,oversize:false};
  const head=await fetcher.get(observation.url,{method:'HEAD',owner,follow:'none'});
  if(!head.ok||head.status!==observation.status)return null;
  return {method:'HEAD',status:head.status,observedMs:Math.max(observation.durationMs,head.durationMs),oversize:true};
}
// How the HEAD choice is explained to the owner: in the reason line, never among the checks, which only say what is asserted.
const OVERSIZE_NOTE='Large page, so only the response is checked, not its text';
export function makeProposal({kind,rank=RANK[kind],name,reason,url,method='GET',status,observedMs,keyword,json,oversize=false}){
  // A HEAD response has no body to assert on.
  const body=method==='GET',definition=buildDefinition({name:clip(name,100),url,kind,method,status,observedMs,keyword:body?keyword:undefined,json:body?json:undefined});
  return {key:proposalKey(url),kind,selected:false,name:definition.name,reason:oversize?`${clip(reason,200-OVERSIZE_NOTE.length-3)} · ${OVERSIZE_NOTE}`:clip(reason,200),checks:describeChecks(definition),definition,rank};
}
export const ms=value=>`${Math.round(value)} ms`;
