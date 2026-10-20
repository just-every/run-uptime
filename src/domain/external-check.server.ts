// @ts-ignore Edition URL validation is JavaScript.
import {publicTarget} from './public-target.mjs'
import type {Bindings} from './control.server.ts'
// The installation-wide External check URL (migration 0029). A monitor on a single location with no URL of its own
// takes this value into its saved revision; revisions are immutable, so changing it affects only monitors saved afterwards.
export const EXTERNAL_CHECK_ABSENT='The External check URL is not set. Set it in Settings, or give this monitor its own external check URL.'
export async function externalCheckUrl(env:Bindings):Promise<string|null>{
 return (await env.DB.prepare('SELECT url FROM external_check WHERE id=1').first<{url:string}>())?.url??null
}
export async function readExternalCheck(env:Bindings){
 const row=await env.DB.prepare('SELECT url,updated_at FROM external_check WHERE id=1').first<{url:string;updated_at:number}>()
 return {url:row?.url??null,updatedAt:row?.updated_at??null}
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
export async function saveExternalCheck(env:Bindings,text:string){
 let input:any;try{input=JSON.parse(text)}catch{throw Error('Invalid External check request')}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='url'))throw Error('Invalid External check request')
 const url=checkedUrl(input.url),now=Date.now()
 await env.DB.prepare('INSERT INTO external_check(id,url,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,updated_at=excluded.updated_at').bind(url,now).run()
 return {url,updatedAt:now}
}
