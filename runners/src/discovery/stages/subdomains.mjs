import {bareHost} from '../domain.mjs';
import {hostNoun,named} from '../naming.mjs';
import {chooseMethod,makeProposal,ms} from '../proposal.mjs';
const LABELS=['api','docs','app','dashboard','console','developers','developer','help','support','portal'];
const MAX_HOSTS=3;
// Same-site hosts the page links to under a conventional name. Their root is fetched (staying inside the site's domain)
// and watched only if it answers; a sign-in wall (401/403), 404 or 5xx hides it. An api.* host that answers 401 is alive.
export async function subdomainStage({fetcher,scope,context,known}){
  const wanted=new Map();
  for(const link of context.facts.links){
    const host=bareHost(new URL(link).hostname),label=host.split('.')[0];
    if(host===context.host||known.has(host)||!LABELS.includes(label)||!scope.allows(host)||host.split('.').length<3)continue;
    wanted.set(host,LABELS.indexOf(label));
  }
  const hosts=[...wanted.entries()].sort((a,b)=>a[1]-b[1]).slice(0,MAX_HOSTS).map(([host])=>host);
  const responses=await Promise.all(hosts.map(host=>fetcher.get(`https://${host}/`,{memo:true})));
  const found=[];
  for(const [index,response] of responses.entries()){
    const host=hosts[index];
    if(!response.ok)continue;
    const isApi=host.startsWith('api.'),authenticated=isApi&&(response.status===401||response.status===403);
    if(!authenticated&&!(response.status>=200&&response.status<300))continue;
    const choice=await chooseMethod(fetcher,response);
    if(!choice)continue;
    const landed=new URL(response.url),via=response.hops.length>1?`redirects to ${landed.pathname}${landed.host===host?'':` on ${bareHost(landed.hostname)}`}`:'';
    const answer=authenticated?`${choice.status} without a key, so the API is alive in ${ms(choice.observedMs)}`:`${choice.status} in ${ms(choice.observedMs)}`;
    found.push(makeProposal({kind:isApi?'api':'subdomain',name:isApi?named(context.brand,'API'):named(context.brand,hostNoun(host.split('.')[0])),url:response.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,oversize:choice.oversize,
      reason:[`Linked from ${context.host}`,via,answer].filter(Boolean).join(' · ')}));
  }
  return found;
}
