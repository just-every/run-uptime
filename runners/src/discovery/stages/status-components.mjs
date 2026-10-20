import {GET_BODY_MARGIN} from '../constants.mjs';
import {isJson} from '../fetcher.mjs';
import {parseJson} from '../json-health.mjs';
import {named} from '../naming.mjs';
import {makeProposal,ms,RANK} from '../proposal.mjs';
import {clip,proposalKey} from '../text.mjs';
const MAX_COMPONENTS=4;
const componentName=value=>typeof value==='string'?clip(value.replace(/[\x00-\x1f\x7f]/g,' '),100):'';
export const statusAttribution=(provider,url)=>({service:provider,tags:['dependency'],
  outcome:clip(`${provider}'s status is the provider's own claim; contextual evidence only, never proof that the application is up or down. Source: ${url}`,500)});

// Every component shares the provider's endpoint, but its stable id names a separate assertion and proposal.
// Never offer a HEAD-only component: it could pass without reading the provider's status claim.
export async function componentProposals({fetcher,origin,provider}){
  const response=await fetcher.get(`${origin}/api/v2/components.json`,{follow:'none'});
  if(!response.ok||response.status!==200||!isJson(response.mime)||response.truncated||response.bytes>GET_BODY_MARGIN||new URL(response.url).origin!==origin)return [];
  const value=parseJson(response.body);
  if(!Array.isArray(value?.components))return [];
  const counts=new Map();
  for(const component of value.components)if(typeof component?.id==='string')counts.set(component.id,(counts.get(component.id)??0)+1);
  const found=[];
  for(const component of value.components){
    const id=component?.id,name=componentName(component?.name);
    if(typeof id!=='string'||!id.length||!id.isWellFormed()||/[\x00-\x1f\x7f]/.test(id)||counts.get(id)!==1||!name||typeof component.status!=='string'||!component.status.length)continue;
    const path=`components[?(@.id==${JSON.stringify(id)})].status`;
    if(path.length>120)continue;
    found.push(makeProposal({kind:'status-page',rank:RANK['status-page']+1,autoSelect:false,
      key:proposalKey(`${response.url}#component=${encodeURIComponent(id)}`),name:named(clip(provider,45),clip(name,50)),url:response.url,status:response.status,observedMs:response.durationMs,
      json:{path,equals:'operational'},metadata:{...statusAttribution(provider,response.url),group:name},
      reason:`Provider component · ${provider}'s own claim · reports ${clip(componentName(component.status),40)} · ${response.status} in ${ms(response.durationMs)}`}));
    if(found.length===MAX_COMPONENTS)break;
  }
  return found;
}
