import {PROBE_ACCEPT} from '../../public-http.mjs';
import {bareHost,isStatusHost} from '../domain.mjs';
import {isJson} from '../fetcher.mjs';
import {parseJson} from '../json-health.mjs';
import {named} from '../naming.mjs';
import {chooseMethod,makeProposal,ms} from '../proposal.mjs';
const MAX_STATUS_HOSTS=2;
const STATUSPAGE={path:'status.indicator',equals:'none'};
const looksLikeStatusPage=({host,facts})=>host.includes('status')||/\bstatus\b/i.test(facts.title);
// Atlassian Statuspage publishes /api/v2/status.json, a free upstream-health signal with a stable "none" indicator.
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
        const siteName=typeof value.page.name==='string'&&value.page.name.trim()?value.page.name.trim():context.brand;
        found.push(makeProposal({kind:'status-page',name:named(siteName,'status page'),url:response.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,json:STATUSPAGE,oversize:choice.oversize,
          reason:`Official status page${typeof value.status.description==='string'?` · reports ${value.status.description.slice(0,60)}`:''} · ${choice.status} in ${ms(choice.observedMs)}`}));
        continue;
      }
    }
    // A linked status.* host that is not Statuspage: watch its page.
    if(host!==context.host){
      const page=await fetcher.get(`${origin}/`,{accept:PROBE_ACCEPT});
      if(page.ok&&page.status>=200&&page.status<300){
        const choice=await chooseMethod(fetcher,page);
        if(choice)found.push(makeProposal({kind:'status-page',name:named(context.brand,'status page'),url:page.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,oversize:choice.oversize,
          reason:`Status page linked from ${context.host} · ${choice.status} in ${ms(choice.observedMs)}`}));
      }
    }
  }
  return found;
}
