import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
// Test-owned authenticator material comes only from real enrollment endpoints.
// Production has no test clock, secret bypass, seeded factor or fake success.
const authenticators=new Map();
export function authenticatorCode(secret,now=Date.now(),digits=6){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let value=0,bits=0;const bytes=[];
 for(const char of secret){value=(value<<5)|alphabet.indexOf(char);bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8}}
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
 const hmac=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=hmac[19]&15;
 return String((hmac.readUInt32BE(offset)&0x7fffffff)%(10**digits)).padStart(digits,'0');
}
export function factorRequest(origin,cookie,fetcher=fetch){return (path,body,method=body===undefined?'GET':'POST')=>fetcher(origin+'/api/access/mfa'+path,{method,redirect:'manual',headers:{host:new URL(origin).host,origin,cookie,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})}
export async function completeSecondFactor(origin,cookie,fetcher=fetch){
 const call=factorRequest(origin,cookie,fetcher),statusResponse=await call('/status');assert.equal(statusResponse.status,200,'live Base session reaches factor status');
 const status=await statusResponse.json(),key=origin+'\0'+status.operatorId;
 if(status.fresh)return authenticators.get(key);
 let state=authenticators.get(key);
 if(!status.factors.length){
  const pendingResponse=await call('/totp/enroll',{});assert.equal(pendingResponse.status,200,'real TOTP enrollment starts');const pending=await pendingResponse.json();
  const confirmed=await call('/totp/confirm',{challengeId:pending.challengeId,code:authenticatorCode(pending.secret)});assert.equal(confirmed.status,200,'authenticator proves the enrolled seed');const enrolled=await confirmed.json();
  assert.equal(enrolled.recoveryCodes?.length,10,'initial enrollment returns ten recovery codes once');
  state={id:enrolled.id,secret:pending.secret,recoveryCodes:enrolled.recoveryCodes};authenticators.set(key,state);return state;
 }
 assert.ok(state&&status.factors.some(f=>f.id===state.id),'test retains the authenticator enrolled for this installation/operator');
 // A TOTP step is consumed. A second email sign-in in the same thirty seconds
 // uses a separately issued single-use recovery code, never weakens replay checks.
 assert.ok(state.recoveryCodes.length>0,'test authenticator retains unused recovery authority');
 const response=await call('/recovery/verify',{code:state.recoveryCodes.shift()});assert.equal(response.status,200,'fresh Base session verifies a retained recovery code');
 if(state.recoveryCodes.length<3){const rotated=await call('/recovery/rotate',{});assert.equal(rotated.status,200,'fresh second factor rotates recovery codes');state.recoveryCodes=(await rotated.json()).recoveryCodes}
 return state;
}
export async function completeBrowserSecondFactor(page,origin){const cookies=await page.context().cookies(origin);const cookie=cookies.map(c=>c.name+'='+c.value).join('; ');return completeSecondFactor(origin,cookie)}
