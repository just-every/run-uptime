import { createHash } from 'node:crypto';
import { SETUP_VALUE_LIMIT } from './input-limits.mjs';
export const credentialFingerprint=value=>createHash('sha256').update(value).digest('hex');
// Credentials remain in memory and are invalidated when their declared identity scope changes.
export function createSecretVault({fields,secretScopes={}},onSecrets=()=>{}){
 let values={},scopes={};const invalidated=new Map();
 const readiness=draft=>Object.fromEntries(Object.keys(secretScopes).map(key=>[key,Boolean(values[key]&&secretScopes[key].every(field=>scopes[key]?.[field]===draft[field]))]));
 return {
  invalidated(){return [...invalidated.values()];},
  readiness(draft){return {...readiness(draft),scopes:structuredClone(scopes)};},
  set(input,draft){
   if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Provide a JSON object through secure stdin.');
   for(const [key,value] of Object.entries(input))if(!Object.hasOwn(secretScopes,key)||typeof value!=='string'||value.length>SETUP_VALUE_LIMIT||!fields[key]?.valid(value))throw Error('Secure input contains an unsupported or invalid credential.');
   onSecrets(input);
   for(const [key,value] of Object.entries(input)){values[key]=value;scopes[key]=Object.fromEntries(secretScopes[key].map(field=>[field,draft[field]]));}
  },
  invalidate(draft){for(const key of Object.keys(values))if(!secretScopes[key].every(field=>scopes[key]?.[field]===draft[field])){const fingerprint=credentialFingerprint(values[key]);invalidated.set(key+':'+fingerprint,{name:key,fingerprint});delete values[key];delete scopes[key];}},
  merge(input,draft){const effective={...draft,...input};this.invalidate(effective);const ready=readiness(effective),merged={...input};for(const key of Object.keys(secretScopes))if(!merged[key]&&ready[key])merged[key]=values[key];return merged;},
  clear(){values={};scopes={};}
 };
}
