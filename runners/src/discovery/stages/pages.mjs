import {bareHost} from '../domain.mjs';
import {AUX_BODY_CAP} from '../constants.mjs';
import {named,pageNoun} from '../naming.mjs';
import {chooseMethod,makeProposal,ms,RANK} from '../proposal.mjs';
const WANTED=['pricing','docs','login','signin','sign-in','contact','about','blog'];
const MAX_PAGES=2;
const topLevel=url=>{const parts=url.pathname.split('/').filter(Boolean);return parts.length===1&&!url.search?parts[0].toLowerCase():null};
// A couple of representative pages of the same site (pricing, docs, login ...), from the page's own links and, if those are
// not enough, a plain sitemap. They are offered but never ticked by default.
export async function pagesStage({fetcher,context,known}){
  const found=new Map(),add=(url,source)=>{const name=topLevel(url);if(name&&WANTED.includes(name)&&!found.has(name)&&!known.has(url.href))found.set(name,{url:url.href,source})};
  for(const link of context.facts.links){const url=new URL(link);if(bareHost(url.hostname)===context.host)add(url,'Linked from the home page')}
  if(found.size<MAX_PAGES){
    const sitemap=await fetcher.get(`${context.url.origin}/sitemap.xml`,{maxBody:AUX_BODY_CAP});
    if(sitemap.ok&&sitemap.status===200&&/xml/.test(sitemap.mime)&&!/<sitemapindex/i.test(sitemap.body)){
      for(const loc of sitemap.body.matchAll(/<loc>\s*([^<\s]{1,2048})\s*<\/loc>/gi)){try{const url=new URL(loc[1]);if(bareHost(url.hostname)===context.host)add(url,'Listed in the sitemap')}catch{}}
    }
  }
  const picked=[...found.entries()].sort((a,b)=>WANTED.indexOf(a[0])-WANTED.indexOf(b[0])).slice(0,MAX_PAGES);
  const responses=await Promise.all(picked.map(([,page])=>fetcher.get(page.url,{})));
  const proposals=[];
  for(const [index,response] of responses.entries()){
    if(!response.ok||response.status<200||response.status>=300)continue;
    const choice=await chooseMethod(fetcher,response);
    if(!choice)continue;
    const [name,page]=picked[index];
    proposals.push(makeProposal({kind:'page',rank:RANK.more,name:named(context.brand,pageNoun(name)),url:response.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,oversize:choice.oversize,
      reason:`${page.source} · ${choice.status} in ${ms(choice.observedMs)}`}));
  }
  return proposals;
}
