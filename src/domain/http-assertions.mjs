import {HTTP_ASSERTIONS} from './http-assertions/config.mjs';
import {statusMatches} from './http-assertions/status.mjs';
import {compileBodyRegex} from './http-assertions/regex.mjs';
import {jsonAssertion} from './http-assertions/json.mjs';
const result=(pass,yes,no)=>({pass,reason:pass?yes:no});
// Worker, runner and control-plane evidence use one ordered saved bundle.
export function httpAssertions(def,response,durationMs){
 const a=def.assertions,{body,headers,status}=response;
 const evaluate={
  status:()=>result(statusMatches(status,a.status),'HTTP status matches expected status or range','HTTP status is outside the expected status or range'),
  bodyIncludes:()=>result(body.includes(a.bodyIncludes),'Body contains required text','Body is missing required text'),
  bodyExcludes:()=>result(!body.includes(a.bodyExcludes),'Body excludes forbidden text','Body contains forbidden text'),
  bodyRegex:()=>result(compileBodyRegex(a.bodyRegex).matcher(body).find(),'Body matches required regular expression','Body does not match the required regular expression'),
  header:()=>result(headers[a.header.name.toLowerCase()]===a.header.equals,'Header equals required value','Header does not equal the required value'),
  json:()=>jsonAssertion(a.json,body,Boolean(def.request)),
  latencyMs:()=>result(durationMs<=a.latencyMs,'Response within required time','Response exceeded the required time'),
 };
 return Object.entries(HTTP_ASSERTIONS).filter(([key])=>key==='status'||a[key]!==undefined)
  .map(([key,assertion])=>({assertion,...evaluate[key]()}));
}
