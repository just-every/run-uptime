import {HTML_ACCEPT,PARSE_BODY_CAP} from '../constants.mjs';
import {docsPages} from '../api-docs-links.mjs';
import {extractEndpoints} from '../api-endpoints.mjs';
import {answered,verifyEndpoint} from '../api-verify.mjs';
import {isHtml} from '../fetcher.mjs';
import {parseHtml} from '../html.mjs';
import {named} from '../naming.mjs';
import {makeProposal,ms} from '../proposal.mjs';
import {clip} from '../text.mjs';
const MAX_DOC_PAGES=3;
const MAX_VERIFIED=3;
// A page that names no live endpoint may still link on to the reference proper ("Stats API", "API reference"); only links that
// say api are followed from there, so the search stays two steps deep at most.
const FOLLOW_SCORE=3;
// An API documented in an HTML reference rather than a spec: follow the site's own links that lead to API documentation, read
// the page in memory, take the endpoint addresses it names and prove one with a real GET. Only a live JSON answer (2xx, or
// 401/403 meaning it wants a key) becomes a proposal; the page itself is never kept.
export async function apiDocsStage({fetcher,scope,context}){
  const queue=docsPages({anchors:context.facts.anchors,pageUrl:context.url,scope,max:2}),read=new Set(),tried=new Set();
  let verified=0;
  while(queue.length&&read.size<MAX_DOC_PAGES){
    const pageUrl=queue.shift();
    if(read.has(pageUrl))continue;
    read.add(pageUrl);
    const page=await fetcher.get(pageUrl,{accept:HTML_ACCEPT,maxBody:PARSE_BODY_CAP,memo:true});
    if(!page.ok||page.status<200||page.status>=300||!isHtml(page.mime))continue;
    for(const endpoint of extractEndpoints(page.body,{scope})){
      if(tried.has(endpoint.url)||verified>=MAX_VERIFIED)continue;
      tried.add(endpoint.url);verified++;
      const result=await verifyEndpoint(fetcher,endpoint.url);
      if(!result.choice)continue;
      const {response,choice}=result,at=clip(new URL(page.url).pathname,60);
      return [makeProposal({kind:'api',name:named(context.brand,'API'),url:response.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,oversize:choice.oversize,
        reason:`Found in the API docs at ${at} · ${answered(result)} · ${ms(choice.observedMs)}`})];
    }
    if(verified>=MAX_VERIFIED)break;
    const onward=docsPages({anchors:parseHtml(page.body,page.url).anchors,pageUrl:new URL(page.url),scope,max:2,minScore:FOLLOW_SCORE});
    queue.unshift(...onward.filter(url=>!read.has(url)&&!queue.includes(url)));
  }
  return [];
}
