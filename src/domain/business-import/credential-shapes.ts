import {assertNoCredentials,decodedCredentialText,removeCredentials} from '../../base/modules/import-kit/src/provenance/credentials.ts'
import {credentialName} from '../../base/modules/import-kit/src/provenance/credential-names.ts'
import type {Json} from '../../base/modules/import-kit/src/types.ts'

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
