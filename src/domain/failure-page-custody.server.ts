// Installation-bound encryption protects generated bitmap artifacts at rest.
// @ts-expect-error Maintained Base AES-GCM primitive.
import {keyedHash,seal,unseal} from '../base/modules/operator-auth/identity/oidc/crypto.mjs'
import {normalizeFailureSnapshot} from './failure-snapshot.mjs'
import type {Bindings} from './control.server.ts'
const aad=(row:any,index:number,count:number)=>JSON.stringify(['uptime-failure-page-v1',row.observation_id,row.monitor_id,row.captured_at,index,count])
async function key(env:Bindings){if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('Failure page custody unavailable');return keyedHash(env.SESSION_SECRET,'uptime-failure-page','aes-gcm-v1')}
export async function storeSnapshot(env:Bindings,row:any,value:any,strict=false){
 const snapshot=normalizeFailureSnapshot(value)
 if(!('unavailable' in snapshot)&&snapshot.screenshot&&'data' in snapshot.screenshot){
  try{
   const data=snapshot.screenshot.data,parts=Array.from({length:Math.ceil(data.length/16384)},(_,i)=>data.slice(i*16384,(i+1)*16384)),secret=await key(env)
   const ciphertext=await Promise.all(parts.map((part,index)=>seal(secret,aad(row,index,parts.length),{part})))
   return JSON.stringify({...snapshot,screenshot:{ciphertext}})
  }catch{if(strict)throw Error('Failure screenshot custody unavailable');return JSON.stringify({...snapshot,screenshot:{unavailable:'custody_unavailable'}})}
 }
 return JSON.stringify(snapshot)
}
export async function openSnapshot(env:Bindings,row:any,strict=false){
 const value=JSON.parse(row.snapshot)
 if(value.screenshot?.ciphertext){
  try{
   const parts=value.screenshot.ciphertext;if(!Array.isArray(parts)||parts.length<1||parts.length>6||parts.some((part:any)=>typeof part!=='string'||part.length>23000))throw Error('Invalid encrypted page')
   const secret=await key(env),opened=await Promise.all(parts.map((part:string,index:number)=>unseal(secret,aad(row,index,parts.length),part)))
   if(opened.some((part:any)=>Object.keys(part).join(',')!=='part'||typeof part.part!=='string'||part.part.length>16384))throw Error('Invalid encrypted part')
   value.screenshot={format:'png',width:1000,height:700,data:opened.map((part:any)=>part.part).join('')}
  }catch{if(strict)throw Error('Archive failure screenshot unavailable: restore installation custody before export');value.screenshot={unavailable:'custody_unavailable'}}
 }
 return normalizeFailureSnapshot(value)
}
