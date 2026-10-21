// @ts-ignore Edition URL validation is JavaScript.
import {publicTarget} from './public-target.mjs'
import {ownOrigin} from './hosted-runner.ts'
import type {Bindings} from './control.server.ts'
// The installation-wide External check URL (migration 0029), set in Settings. Monitors follow it live: a revision whose external
// check is the installation's says externalCheck "settings", keeps a copy of the URL in force when it was saved, and each check
// is handed the URL Settings holds when it runs (liveExternalCheck). A monitor's own URL says externalCheck "own". Revisions saved
// before monitors followed Settings carry no externalCheck; their copies of legacy_url (migration 0062) follow Settings too.
export const EXTERNAL_CHECK_ABSENT='The External check URL is not set. Set it in Settings, or give this monitor its own external check URL.'
export type ExternalCheck={url:string|null;legacyUrl:string|null}
export async function externalCheck(env:Bindings):Promise<ExternalCheck>{
 const row=await env.DB.prepare('SELECT url,legacy_url FROM external_check WHERE id=1').first<{url:string;legacy_url:string|null}>()
 return {url:row?.url??null,legacyUrl:row?.legacy_url??null}
}
export async function readExternalCheck(env:Bindings){
 const row=await env.DB.prepare('SELECT url,updated_at FROM external_check WHERE id=1').first<{url:string;updated_at:number}>()
 return {url:row?.url??null,updatedAt:row?.updated_at??null}
}
// Two addresses are the same site when their hostnames match exactly, ignoring case, a leading `www.` and a trailing dot:
// example.com and www.example.com are one site, while status.example.com and example.com are not. Ports and paths do not
// matter: an outage on the host takes every page and port on it down for the owner's purposes.
const site=(value:string)=>new URL(value).hostname.toLowerCase().replace(/\.$/,'').replace(/^www\./,'')
export const sameSite=(a:string,b:string)=>site(a)===site(b)
const canaries=(definition:any)=>Object.values(definition?.assignments??{}).map((a:any)=>a.canaryUrl as string|undefined)
export function followsSettings(definition:any,legacyUrl:string|null){
 if(definition?.externalCheck!==undefined)return definition.externalCheck==='settings'
 const urls=canaries(definition);return Boolean(legacyUrl)&&urls.length>0&&urls.every(url=>url===legacyUrl)
}
// The mode a revision has, so a change built from another definition (a definitions file, an undo) keeps it.
export function externalCheckMode(definition:any,legacyUrl:string|null){
 return followsSettings(definition,legacyUrl)?'settings':canaries(definition).some(Boolean)?'own':undefined
}
// The definition a check of this revision runs: a follower's external checks use the URL in Settings now. Evidence and coverage
// read only whether a check has an external check, which the stored copy already says.
export function liveExternalCheck(definition:any,settings:ExternalCheck){
 if(!settings.url||!followsSettings(definition,settings.legacyUrl))return definition
 return {...definition,assignments:Object.fromEntries(Object.entries(definition.assignments).map(([probe,a]:[string,any])=>[probe,a.canaryUrl?{...a,canaryUrl:settings.url}:a]))}
}
// A monitor's external check as the owner sees it: `url` is what its checks use (null when it needs none) and `own` its own URL.
export function externalCheckOf(definition:any,settings:ExternalCheck){
 const follows=followsSettings(definition,settings.legacyUrl),own=follows?null:canaries(definition).find(Boolean)??null
 return {url:follows?settings.url:own,own}
}
// The owner reads this message beside the field, so a refused address says why in plain words, not the policy's own.
function checkedUrl(value:unknown){
 if(typeof value!=='string'||!value.trim())throw Error('Enter a URL you do not run, such as https://example.com/.')
 try{return publicTarget(value.trim()).href}catch(error){
  const reason=(error as Error).message
  if(/forbidden/.test(reason))throw Error('That is a private, loopback or link-local address. The External check URL must be a public website.')
  if(/requires HTTP/.test(reason))throw Error('The External check URL must start with http:// or https:// and cannot contain a user name, password or # fragment.')
  throw Error('That is not a web address Uptime can check. Use a full address such as https://example.com/.')
 }
}
// A new URL reaches every monitor that follows Settings on its next check, so it is refused where a saved monitor would refuse
// it: the site a follower monitors could never confirm its own outage, and this app's own address is a site the owner runs.
export async function saveExternalCheck(env:Bindings,text:string){
 let input:any;try{input=JSON.parse(text)}catch{throw Error('Invalid External check request')}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='url'))throw Error('Invalid External check request')
 const url=checkedUrl(input.url),now=Date.now()
 if(ownOrigin(url,env.UPTIME_ORIGIN))throw Error('That is this Uptime’s own address. Choose a site you do not run.')
 const {legacyUrl}=await externalCheck(env)
 const monitors=(await env.DB.prepare('SELECT definition FROM monitors ORDER BY rowid').all<{definition:string}>()).results.map(row=>JSON.parse(row.definition))
 const following=monitors.filter(definition=>followsSettings(definition,legacyUrl))
 const clash=following.find(definition=>definition.enabled&&definition.url&&sameSite(url,definition.url))
 if(clash)throw Error(`${url} is the same site as “${clash.name}”, so an outage there could never be confirmed. Choose a site you do not run.`)
 await env.DB.prepare('INSERT INTO external_check(id,url,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,updated_at=excluded.updated_at').bind(url,now).run()
 return {url,updatedAt:now,own:monitors.filter(definition=>!followsSettings(definition,legacyUrl)&&canaries(definition).some(Boolean)).length}
}
