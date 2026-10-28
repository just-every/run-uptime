import {createAgentDoor,ToolRefusal,type ResourceDefinition,type Principal,type ClassAndFacts} from '../../base/modules/agent-door/index.ts'
import type {Bindings} from '../control.server.ts'
import {people,installationTrust,businessSettings} from './people.server.ts'
import {localCredentials,localAuthority,readScopes} from './authority.server.ts'
import {nativeTools} from './tools.server.ts'
import {projection} from './projections.server.ts'
export const resourceTemplates=['uptime://monitors/{id}','uptime://monitors/{id}/history','uptime://monitors/{id}/revisions','uptime://monitors/{id}/uptime','uptime://monitors/{id}/response-times','uptime://monitors/{id}/failure-snapshots','uptime://incidents/{id}','uptime://routes/{id}','uptime://destinations/{id}']
export const notTools=[{clauses:['ARCHIVE-001','IMPORT-001'],reason:'import-door' as const},{clauses:['AUTHORITY-001','NETWORK-001'],reason:'device' as const},{clauses:['AUTHORITY-001'],reason:'installation' as const}]
export function uptimeAgentDoor(env:Bindings){
 const resources:ResourceDefinition[]=resourceTemplates.map(uriTemplate=>({uriTemplate,name:uriTemplate,scope:'uptime:read',classes:uriTemplate.endsWith('failure-snapshots')?['standard','sensitive']:['standard'],
  async read(uri,c){try{const url=new URL(uri);if(url.protocol!=='uptime:')return null;const [id,suffix='']=url.pathname.slice(1).split('/').map(decodeURIComponent);const json=await projection(env,c,url.hostname,id,suffix);return {json,untrusted:true}}catch(e){if(e instanceof ToolRefusal)return null;throw e}},
  classify(record):ClassAndFacts[]{const n=uriTemplate.endsWith('failure-snapshots')?(record.json as any)?.items?.length:0;return n?[{class:'sensitive',facts:{measure:n,kind:'failure-evidence'}}]:[{class:'standard',facts:{measure:1}}]}}))
 return createAgentDoor({seed:'uptime',name:'Uptime',specialist:'monitoring operator',db:env.DB,origin:env.UPTIME_ORIGIN!,trust:installationTrust(env),people:people(env),tools:nativeTools(env),resources,notTools,
  localCredentials:request=>localCredentials(env,request),async currentScopes(p){if(!p.clientId?.startsWith('native-key:'))return p.scopes;try{await localAuthority(env,p.clientId.slice(11));return readScopes}catch{return []}},
  prompts:[{name:'monitoring-shift',title:'Operate a monitoring shift',description:'Read immutable scoped evidence, retain competing target/network/check hypotheses, coordinate the incident and propose the smallest native monitor or route change. Company policy and current native authority govern effects. Scheduled observations alone establish recovery.',clauses:['AGENT-002','STATE-001'],messages:()=>[{role:'user',content:{type:'text',text:'Read the authorized monitor and immutable scheduled history. Keep target outage, network failure and broken-check hypotheses separate. Use the incident coordination tools without changing scheduled evidence. Preview the smallest route or monitor repair, respect current scope, policy and Pause, then read independently observed scheduled evidence. Manual acknowledgment never proves recovery. No remediation, provider receipt or spending guarantee is implied.'}}]}]})
}
export async function agentDoorRequest(env:Bindings,request:Request){
 const path=new URL(request.url).pathname
 if(['/api/rer/business-settings','/rer-business-logo','/rer-business.css'].includes(path))return businessSettings(env).handle(request)
 if(path==='/mcp'||path.startsWith('/agents')||path.startsWith('/.well-known/oauth-protected-resource')||path==='/api/rer/agent-policy')return uptimeAgentDoor(env).handle(request)
 return null
}
