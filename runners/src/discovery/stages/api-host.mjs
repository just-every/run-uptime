import {bareHost,registrableDomain} from '../domain.mjs';
import {isJson} from '../fetcher.mjs';
import {named} from '../naming.mjs';
import {makeProposal,ms} from '../proposal.mjs';
import {answered,verifyEndpoint} from '../api-verify.mjs';
// When nothing else found the API, the conventional api. host of the site's domain is tried once (its robots.txt first). A JSON
// answer there means an API lives on it. It is proposed only when that very answer proves a live endpoint (2xx, or 401/403
// asking for a key); an error JSON on a bare root is only a note, because a monitor would expect that error. A host that does
// not exist, or answers 404 or something that is not JSON, adds nothing at all.
export async function apiHostStage({fetcher,notes,context}){
  const host=`api.${registrableDomain(context.host)}`;
  if(host===context.host)return [];
  const result=await verifyEndpoint(fetcher,`https://${host}/`,{quiet:true});
  const {response}=result;
  if(!response.ok||response.status===404||!isJson(response.mime))return [];
  if(!result.choice){notes.add(`${bareHost(host)} answers, but no public endpoint was found to watch.`);return []}
  const {choice}=result;
  return [makeProposal({kind:'api',name:named(context.brand,'API'),url:response.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,oversize:choice.oversize,
    reason:`Found on the conventional ${host} host · ${answered(result)} · ${ms(choice.observedMs)}`})];
}
