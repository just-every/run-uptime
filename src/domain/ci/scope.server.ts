import type {Bindings} from '../control.server.ts'
import {inScope} from '../access.server.ts'
import {CredentialError,credentialFence,type CredentialAuthority} from '../credentials/model.server.ts'
import {nativeImporter} from '../definitions/importers/native.ts'
export const ciNamespace=(a:CredentialAuthority)=>'uptime.monitors:'+a.id
export function ciDefinition(a:CredentialAuthority,value:any){
 return value&&value.environment===a.environment&&a.resources.tags.some(tag=>value.tags?.includes(tag))&&inScope(value,a.scopes)
  &&(!value.network||value.network==='public')&&!value.privateGrantRef&&!value.request?.credentialRef&&!['flow','api','mail'].includes(value.type)&&!value.dependencies?.length
}
export function ciMonitorPredicate(a:CredentialAuthority,alias='m'){
 return {sql:`json_extract(${alias}.definition,'$.environment')=? AND EXISTS(SELECT 1 FROM json_each(json_extract(${alias}.definition,'$.tags')) tags WHERE tags.value IN(SELECT value FROM json_each(?))) AND NOT EXISTS(SELECT 1 FROM uptime_member_scopes s WHERE s.operator_id=? GROUP BY s.kind HAVING MAX(CASE WHEN s.kind='service' AND s.value=json_extract(${alias}.definition,'$.service') OR s.kind='team' AND s.value=json_extract(${alias}.definition,'$.group') THEN 1 ELSE 0 END)=0)`,params:[a.environment,JSON.stringify(a.resources.tags),a.issuerId]}
}
export async function assertCiFile(env:Bindings,a:CredentialAuthority,text:string){
 const entries=nativeImporter.entries(text)
 for(const entry of entries){const mapped=nativeImporter.map(entry);if(!('definition' in mapped)||!ciDefinition(a,mapped.definition))throw new CredentialError(403,'Definition is outside the credential environment, tags or public-check capability')
  const input=mapped.definition as any,rows=(await env.DB.prepare("SELECT definition FROM monitors WHERE json_extract(definition,'$.name')=?").bind(input.name).all<{definition:string}>()).results
  if(rows.some(row=>!ciDefinition(a,JSON.parse(row.definition))))throw new CredentialError(403,'Existing monitor is outside the credential selection')
 }
}
export function ciFence(a:CredentialAuthority){return credentialFence(a)}
