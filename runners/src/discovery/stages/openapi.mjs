import {SPEC_BODY_CAP} from '../constants.mjs';
import {bareHost} from '../domain.mjs';
import {isJson} from '../fetcher.mjs';
import {parseJson} from '../json-health.mjs';
import {named} from '../naming.mjs';
import {chooseMethod,makeProposal,ms} from '../proposal.mjs';
const SPEC_PATHS=['/openapi.json','/swagger.json','/v3/api-docs','/api-docs'];
const MAX_OPERATION_TRIES=2;
// Only parsed JSON that says it is OpenAPI or Swagger counts; an HTML catch-all or an unrelated JSON file does not.
export function readSpec(value,specUrl){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const version=typeof value.openapi==='string'?value.openapi:typeof value.swagger==='string'?value.swagger:null;
  if(!version||!value.paths||typeof value.paths!=='object')return null;
  let server;
  try{
    if(typeof value.openapi==='string'&&Array.isArray(value.servers)&&typeof value.servers[0]?.url==='string'){
      if(value.servers[0].url.includes('{'))server=null;else server=new URL(value.servers[0].url,specUrl);
    }else if(typeof value.swagger==='string'&&typeof value.host==='string'){
      server=new URL(`${Array.isArray(value.schemes)&&value.schemes.includes('https')?'https':value.schemes?.[0]??'https'}://${value.host}${typeof value.basePath==='string'?value.basePath:''}`);
    }else server=new URL('/',specUrl);
  }catch{server=null}
  if(server&&!['http:','https:'].includes(server.protocol))server=null;
  const operations=Object.entries(value.paths)
    .filter(([path,item])=>!path.includes('{')&&item?.get&&typeof item.get==='object')
    .map(([path,item])=>({path,required:(item.get.parameters??[]).some(p=>p?.required===true)}))
    .sort((a,b)=>Number(a.required)-Number(b.required)||a.path.length-b.path.length);
  return {version,title:typeof value.info?.title==='string'?value.info.title.trim():'',pathCount:Object.keys(value.paths).length,server,operations};
}
const joinPath=(server,path)=>new URL(server.pathname.replace(/\/$/,'')+path,server.origin).href;
export async function openapiStage({fetcher,scope,notes,context}){
  const origin=context.url.origin;
  let spec=null,response=null;
  for(const path of SPEC_PATHS){
    const candidate=await fetcher.get(origin+path,{maxBody:SPEC_BODY_CAP,memo:true});
    if(!candidate.ok||candidate.status!==200||!isJson(candidate.mime)||candidate.truncated)continue;
    const read=readSpec(parseJson(candidate.body),candidate.url);
    if(read){spec=read;response=candidate;break}
  }
  if(!spec)return [];
  const found=[];
  const choice=await chooseMethod(fetcher,response);
  if(choice)found.push(makeProposal({kind:'spec',name:named(context.brand,`${spec.version.startsWith('2')?'Swagger':'OpenAPI'} spec`),url:response.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,
    keyword:response.body.includes('"openapi"')?'"openapi"':response.body.includes('"swagger"')?'"swagger"':undefined,oversize:choice.oversize,
    reason:`${spec.version.startsWith('2')?'Swagger':'OpenAPI'} spec lists ${spec.pathCount} path${spec.pathCount===1?'':'s'} · ${choice.status} in ${ms(choice.observedMs)}`}));
  if(!spec.server)return found;
  if(!scope.allows(spec.server.hostname)){notes.add(`The API spec points at ${bareHost(spec.server.hostname)}, outside this site's domain, so that host was not contacted.`);return found}
  const apiFound=await apiProposal({fetcher,spec,context});
  if(apiFound)found.push(apiFound);
  return found;
}
// The API root if it answers; otherwise one parameter-free GET from the spec. A 401 or 403 means the API is alive but wants a key.
async function apiProposal({fetcher,spec,context}){
  const attempts=[{url:spec.server.href},...spec.operations.slice(0,MAX_OPERATION_TRIES).map(op=>({url:joinPath(spec.server,op.path)}))];
  for(const attempt of attempts){
    const response=await fetcher.get(attempt.url,{});
    if(!response.ok)continue;
    const authenticated=response.status===401||response.status===403;
    if(!authenticated&&!(response.status>=200&&response.status<300))continue;
    const choice=await chooseMethod(fetcher,response);
    if(!choice)continue;
    const how=authenticated?`answers ${choice.status} without a key, so it is alive`:`answers ${choice.status}`;
    return makeProposal({kind:'api',name:named(context.brand,'API'),url:response.url,method:choice.method,status:choice.status,observedMs:choice.observedMs,oversize:choice.oversize,
      reason:`Found in the API spec · ${how} · ${ms(choice.observedMs)}`});
  }
  return null;
}
