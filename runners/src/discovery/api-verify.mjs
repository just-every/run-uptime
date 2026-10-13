import {isJson} from './fetcher.mjs';
import {chooseMethod} from './proposal.mjs';
// One real GET decides whether an endpoint is worth watching: a JSON answer that is 2xx, or 401/403 meaning "alive, asks for a key".
// Anything else (404, 405, 5xx, a page, an error JSON on a bad path) is not a proposal.
export async function verifyEndpoint(fetcher,url,options={}){
  const response=await fetcher.get(url,{quiet:options.quiet,memo:true});
  if(!response.ok||!isJson(response.mime))return {response};
  const authenticated=response.status===401||response.status===403;
  if(!authenticated&&!(response.status>=200&&response.status<300))return {response};
  const choice=await chooseMethod(fetcher,response);
  return choice?{response,choice,authenticated}:{response};
}
export const answered=({choice,authenticated})=>authenticated?`answers ${choice.status} without a key, so it is alive`:`answers ${choice.status}`;
