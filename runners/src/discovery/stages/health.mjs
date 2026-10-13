import {randomBytes} from 'node:crypto';
import {JSON_ASSERT_LIMIT} from '../constants.mjs';
import {isHtml,isJson,isText} from '../fetcher.mjs';
import {healthAssertion,parseJson} from '../json-health.mjs';
import {named} from '../naming.mjs';
import {chooseMethod,makeProposal,ms} from '../proposal.mjs';
const PATHS=['/health','/healthz','/api/health','/status','/ready','/livez','/ping'];
const BATCH=3;
const SAME_PREFIX=500;
// A well-known path only counts when the site answers a path that cannot exist differently. A random-path canary first:
// if the site answers every path with a page (a catch-all), nothing here can be told apart from it.
export async function healthStage({fetcher,notes,context}){
  const origin=context.url.origin;
  const canary=await fetcher.get(`${origin}/uptime-canary-${randomBytes(6).toString('hex')}`,{});
  if(!canary.ok)return [];
  const canaryServed=canary.status>=200&&canary.status<300;
  if(canaryServed&&isHtml(canary.mime)){notes.add(`${context.host} answers unknown paths with a page, so no health path can be told apart from it.`);return []}
  const sameAsCanary=response=>canaryServed&&response.mime===canary.mime&&response.body.trim().slice(0,SAME_PREFIX)===canary.body.trim().slice(0,SAME_PREFIX);
  for(let i=0;i<PATHS.length;i+=BATCH){
    const batch=PATHS.slice(i,i+BATCH),responses=await Promise.all(batch.map(path=>fetcher.get(origin+path,{})));
    for(const [index,response] of responses.entries()){
      if(!response.ok||response.status<200||response.status>=300||!(isJson(response.mime)||isText(response.mime))||sameAsCanary(response))continue;
      const choice=await chooseMethod(fetcher,response);
      if(!choice)continue;
      let json;
      if(choice.method==='GET'&&isJson(response.mime)&&response.bytes<=JSON_ASSERT_LIMIT){const value=parseJson(response.body);if(value!==undefined)json=healthAssertion(value)??undefined}
      return [makeProposal({kind:'health',name:named(context.brand,'health check'),url:response.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,json,oversize:choice.oversize,
        reason:`${batch[index]} answers ${choice.status}${json?` and reports ${json.path} ${JSON.stringify(json.equals)}`:''}; unknown paths answer ${canary.status} · ${ms(choice.observedMs)}`})];
    }
  }
  return [];
}
