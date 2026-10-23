import type {AuthBindings} from '../operator-auth.server.ts'
// @ts-ignore Portable Base WebCrypto primitives; domain-separated key and AAD.
import {seal,unseal,keyedHash,encode,decode} from '../../base/modules/operator-auth/identity/oidc/crypto.mjs'
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export {encode,decode}
export function randomToken(){return encode(crypto.getRandomValues(new Uint8Array(24)))}
export async function protect(env:AuthBindings,owner:string,purpose:string,value:unknown){return seal(await keyedHash(env.SESSION_SECRET!,'uptime-mfa-encryption','v1'),`uptime-mfa-v1:${purpose}:${owner}`,value)}
export async function reveal(env:AuthBindings,owner:string,purpose:string,value:string){return unseal(await keyedHash(env.SESSION_SECRET!,'uptime-mfa-encryption','v1'),`uptime-mfa-v1:${purpose}:${owner}`,value)}
export const recoveryDigest=(env:AuthBindings,owner:string,value:string)=>keyedHash(env.SESSION_SECRET!,'uptime-mfa-recovery',`${owner}\0${value}`)
export function newTotpSecret(){let bits=0,value=0,out='';for(const byte of crypto.getRandomValues(new Uint8Array(20))){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5}}return out}
function base32(secret:string){let bits=0,value=0;const bytes=[];for(const char of secret){const digit=alphabet.indexOf(char);if(digit<0)throw Error('Invalid factor material');value=(value<<5)|digit;bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8}}return new Uint8Array(bytes)}
// RFC 6238: SHA-1, 30-second steps, six digits. Accepted counters are consumed
// transactionally by the caller, so a code cannot create a second proof.
export async function totpCounter(secret:string,code:unknown,now=Date.now()){
 if(typeof code!=='string'||!/^\d{6}$/.test(code))return null
 const key=await crypto.subtle.importKey('raw',base32(secret),{name:'HMAC',hash:'SHA-1'},false,['sign'])
 const current=Math.floor(now/30000)
 for(const counter of [current,current-1,current+1]){
  const bytes=new Uint8Array(8);new DataView(bytes.buffer).setBigUint64(0,BigInt(counter))
  const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes)),offset=digest[19]&15
  const expected=String((((digest[offset]&127)<<24)|(digest[offset+1]<<16)|(digest[offset+2]<<8)|digest[offset+3])%1000000).padStart(6,'0')
  let difference=0;for(let i=0;i<6;i++)difference|=expected.charCodeAt(i)^code.charCodeAt(i)
  if(difference===0)return counter
 }
 return null
}
