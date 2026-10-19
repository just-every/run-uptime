import {assertNoCredentials,decodedCredentialText,liveCredentialRemoved,removeCredentials} from '../../base/modules/import-kit/src/provenance/credentials.ts'
import {credentialName} from '../../base/modules/import-kit/src/provenance/credential-names.ts'
import type {Json} from '../../base/modules/import-kit/src/types.ts'
import {withholdValue} from '../definitions/withhold.ts'

/** Whether the import kit reads a value as holding a credential. */
export const credential=(value:unknown)=>{try{assertNoCredentials(value);return false}catch{return true}}
/** Whether a field's name names a credential by its whole parts, as the import door's removal does (`authorization`,
 * `token`, `apiKey`, `webhook_url`; never `keyword` or `author`), whatever the field holds. */
export const credentialNamed=(key:string)=>credentialName(decodedCredentialText(key),'remove')!==undefined
const masked=(value:Json):Json=>Array.isArray(value)?value.map(masked):value&&typeof value==='object'
 ?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,masked(child)])):typeof value==='string'&&credential(value)?'[withheld]':value
/** A value holding nothing the import door would remove: credential-shaped text (a URL with a user name or a credential
 * query parameter) withheld, then every field the door's removal drops (a credential-named field holding a value, a
 * credential header pair's value) dropped the same way. The door then keeps the upload a preview reads. */
export const withheldCredentials=(value:Json):Json=>removeCredentials(masked(value)).value
/** The value at a JSON pointer, and whether the walk reached it: a pointer under a value withholding replaced is not reached. */
function at(value:unknown,pointer:string):{reached:boolean;value?:unknown}{
 let current=value
 for(const part of pointer.split('/').slice(1).map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~'))){
  if(!current||typeof current!=='object'||!Object.hasOwn(current,part))return {reached:false}
  current=(current as Record<string,unknown>)[part]
 }
 return {reached:true,value:current}
}
/** Whether a source value still holds a live request secret: a value the import door's credential removal takes out as
 * live (not an exporter's `[removed]`, `removed@` or `=removed` marker) in a place Uptime's own withholding covers (a
 * request field such as `httpPassword` or `customHttpHeaders`, a credential-named field, a URL's user name and password).
 * rer's vendor exports remove and mark every such value, so their bundles hold none; a user name, a plain header or a
 * request body is no credential by the door's rule, and Uptime withholds those from everything it derives. A URL
 * credential parameter is left to the door, which removes it, and to Uptime's per-entry refusal. */
export function liveRequestSecret(value:Json){
 let removed
 try{removed=removeCredentials(value).removed}catch{return true}
 const withheld=withholdValue(value)
 return removed.filter(liveCredentialRemoved).some(item=>{
  const source=at(value,item.path),kept=at(withheld,item.path)
  return source.reached&&(!kept.reached||JSON.stringify(kept.value)!==JSON.stringify(source.value))
 })
}
