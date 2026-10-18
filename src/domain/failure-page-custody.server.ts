// Installation-bound authenticated encryption for every opaque browser artifact.
// @ts-expect-error Maintained Base AES-GCM primitive.
import {keyedHash,seal,unseal} from '../base/modules/operator-auth/identity/oidc/crypto.mjs'
import {normalizeFailureSnapshot} from './failure-snapshot.mjs'
import type {Bindings} from './control.server.ts'
const aad=(row:any,label:string,index:number,count:number,legacy=false)=>JSON.stringify(legacy?['uptime-failure-page-v1',row.observation_id,row.monitor_id,row.captured_at,index,count]:['uptime-failure-artifact-v2',row.observation_id,row.monitor_id,row.captured_at,label,index,count])
async function key(env:Bindings){if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('Failure artifact custody unavailable');return keyedHash(env.SESSION_SECRET,'uptime-failure-page','aes-gcm-v1')}
const targets=(snapshot:any)=>[['screenshot',snapshot,'screenshot',6],['video',snapshot.artifacts,'video',11],['trace',snapshot.artifacts,'trace',6]] as const
export async function storeSnapshot(env:Bindings,row:any,value:any,strict=false){
 const snapshot=normalizeFailureSnapshot(value)
 if('unavailable' in snapshot)return JSON.stringify(snapshot)
 for(const [label,host,name] of targets(snapshot)){
  const artifact=host?.[name];if(!artifact?.data)continue
  try{
   const data=artifact.data,parts=Array.from({length:Math.ceil(data.length/16384)},(_,i)=>data.slice(i*16384,(i+1)*16384)),secret=await key(env)
   const ciphertext=await Promise.all(parts.map((part,index)=>seal(secret,aad(row,label,index,parts.length),{part})))
   host[name]={ciphertext,custodyVersion:2}
  }catch{if(strict)throw Error('Failure artifact custody unavailable');host[name]={unavailable:'custody_unavailable'}}
 }
 return JSON.stringify(snapshot)
}
export async function openSnapshot(env:Bindings,row:any,strict=false){
 const value=JSON.parse(row.snapshot)
 for(const [label,host,name,max] of targets(value)){
  const artifact=host?.[name];if(!artifact?.ciphertext)continue
  try{
   const parts=artifact.ciphertext,legacy=artifact.custodyVersion===undefined&&label==='screenshot';
   if(!legacy&&artifact.custodyVersion!==2||Object.keys(artifact).sort().join(',')!==(legacy?'ciphertext':'ciphertext,custodyVersion')||!Array.isArray(parts)||parts.length<1||parts.length>max||parts.some((part:any)=>typeof part!=='string'||part.length>23000))throw Error('Invalid encrypted artifact')
   const secret=await key(env),opened=await Promise.all(parts.map((part:string,index:number)=>unseal(secret,aad(row,label,index,parts.length,legacy),part)))
   if(opened.some((part:any)=>Object.keys(part).join(',')!=='part'||typeof part.part!=='string'||part.part.length>16384))throw Error('Invalid encrypted part')
   host[name]={format:label==='screenshot'?'png':label==='video'?'webm':'zip',...(label==='screenshot'?{width:1000,height:700}:{}),data:opened.map((part:any)=>part.part).join('')}
  }catch{if(strict)throw Error('Archive failure artifact unavailable: restore installation custody before export');host[name]={unavailable:'custody_unavailable'}}
 }
 return normalizeFailureSnapshot(value)
}
