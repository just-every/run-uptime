import {bareHost,isApiHost,isStatusHost} from './domain.mjs';
// Which same-site links lead to API documentation. The signal is the shape of the address and the words on the link,
// never a hostname: an "api" word in a path segment ("api-docs", "docs/api"), a developer or reference section, a
// developers.* host, or a short link text such as "API" or "Developers". Marketing and news paths are never docs.
const API_WORDS=new Set(['api','apis']);
const DOC_WORDS=new Set(['docs','doc','documentation','developers','developer','devs','reference','openapi','swagger']);
const NOT_DOCS=new Set(['blog','news','press','changelog','careers','jobs','pricing','customers','case-studies','legal','terms','privacy','status','integrations','partners','marketplace','login','signin','sign-in','signup','sign-up','contact','about','support','help','features','feature','products','product','solutions','use-cases','platform','compare','alternatives']);
const ASSET=/\.(?:png|jpe?g|gif|svg|webp|ico|css|js|mjs|json|xml|ya?ml|pdf|zip|gz|mp4|woff2?|ttf)$/i;
const tokens=segment=>segment.toLowerCase().split(/[-_.]+/).filter(Boolean);
// How much a link looks like API documentation: an api word in the path counts most, then a docs section in the path or host,
// then the words on the link itself ("API documentation" counts as much as an api path; a bare "Documentation" a little).
function linkScore({url,text}){
  const segments=url.pathname.split('/').filter(Boolean).map(s=>s.toLowerCase());
  if(segments.some(s=>NOT_DOCS.has(s)))return 0;
  let score=0;
  if(segments.some(s=>tokens(s).some(t=>API_WORDS.has(t))))score+=3;
  else if(segments.some(s=>DOC_WORDS.has(s)))score+=2;
  if(tokens(url.hostname.split('.')[0]).some(t=>DOC_WORDS.has(t)))score+=2;
  const words=text.toLowerCase().replace(/[^a-z0-9 ]+/g,' ').trim().split(/\s+/).filter(Boolean);
  if(words.length&&words.length<=4){
    const api=words.some(w=>API_WORDS.has(w)),docs=words.some(w=>DOC_WORDS.has(w));
    score+=api&&docs?3:api||docs?1:0;
  }
  return score;
}
// The pages worth reading, best first: same registrable domain (scope), not the page itself, no query, no asset, not an API host's root.
export function docsPages({anchors,pageUrl,scope,max,minScore=1}){
  const best=new Map();
  for(const {href,text} of anchors){
    let url;
    try{url=new URL(href)}catch{continue}
    const host=bareHost(url.hostname);
    if(url.search||url.port||ASSET.test(url.pathname)||!scope.allows(host)||isStatusHost(host)||isApiHost(host)||url.href===pageUrl.href||(url.origin+url.pathname).replace(/\/$/,'')===(pageUrl.origin+pageUrl.pathname).replace(/\/$/,''))continue;
    const score=linkScore({url,text});
    if(score>=minScore&&score>(best.get(url.href)?.score??0))best.set(url.href,{url:url.href,score,sameHost:host===bareHost(pageUrl.hostname),depth:url.pathname.split('/').filter(Boolean).length});
  }
  return [...best.values()].sort((a,b)=>b.score-a.score||Number(b.sameHost)-Number(a.sameHost)||a.depth-b.depth).slice(0,max).map(page=>page.url);
}
