import {PROBE_ACCEPT} from '../../probe-error.mjs';
import {bareHost,isStatusHost} from '../domain.mjs';
import {isJson} from '../fetcher.mjs';
import {parseJson} from '../json-health.mjs';
import {named} from '../naming.mjs';
import {chooseMethod,makeProposal,ms} from '../proposal.mjs';
import {clip} from '../text.mjs';
import {componentProposals,statusAttribution} from './status-components.mjs';
const MAX_STATUS_HOSTS=2;
const STATUSPAGE={path:'status.indicator',equals:'none'};
const looksLikeStatusPage=({host,facts})=>host.includes('status')||/\bstatus\b/i.test(facts.title);
const providerName=(value,fallback)=>typeof value==='string'&&value.trim()?clip(value.replace(/[\x00-\x1f\x7f]/g,' '),100)||fallback:fallback;
// Atlassian Statuspage publishes /api/v2/status.json with a stable "none" indicator for the provider's own claim.
// status.* hosts the page links to are checked; a page that is itself a status page is checked on its own host.
export async function statusStage({fetcher,context}){
  const origins=new Map();
  for(const link of context.facts.links){const url=new URL(link);if(isStatusHost(url.hostname)&&origins.size<MAX_STATUS_HOSTS)origins.set(bareHost(url.hostname),`https://${bareHost(url.hostname)}`)}
  if(looksLikeStatusPage(context)&&origins.size<MAX_STATUS_HOSTS)origins.set(context.host,context.url.origin);
  const found=[];
  for(const [host,origin] of origins){
    const response=await fetcher.get(`${origin}/api/v2/status.json`,{});
    if(response.ok&&response.status===200&&isJson(response.mime)){
      const value=parseJson(response.body);
      if(value&&typeof value.status?.indicator==='string'&&value.page&&typeof value.page==='object'){
        const choice=await chooseMethod(fetcher,response);
        if(!choice)continue;
        const siteName=providerName(value.page.name,host===context.host?context.brand:host),metadata=statusAttribution(siteName,response.url);
        found.push(makeProposal({kind:'status-page',name:named(siteName,'status page'),url:response.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,json:STATUSPAGE,metadata,oversize:choice.oversize,
          reason:`Provider status page · provider's own claim${typeof value.status.description==='string'?` · reports ${clip(value.status.description.replace(/[\x00-\x1f\x7f]/g,' '),60)}`:''} · ${choice.status} in ${ms(choice.observedMs)}`}));
        found.push(...await componentProposals({fetcher,origin:new URL(response.url).origin,provider:siteName}));
        continue;
      }
    }
    // A linked status.* host that is not Statuspage: watch its page.
    if(host!==context.host){
      const page=await fetcher.get(`${origin}/`,{accept:PROBE_ACCEPT});
      if(page.ok&&page.status>=200&&page.status<300){
        const choice=await chooseMethod(fetcher,page);
        if(choice)found.push(makeProposal({kind:'status-page',name:named(host,'status page'),url:page.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,metadata:statusAttribution(host,page.url),oversize:choice.oversize,
          reason:`Status page linked from ${context.host} · ${choice.status} in ${ms(choice.observedMs)}`}));
      }
    }
  }
  return found;
}
