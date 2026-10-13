import {same,sign,type Bindings} from './control.server.ts'
import {runnerKey,type Runner} from './runner-registration.server.ts'
// A signed runner body: the HMAC under the authenticated runner's key over `<x-sent-at>.<body>`, with the body bounded
// and the clock within one minute. Every signed runner route verifies through this one check.
export async function signedRunnerBody(env:Bindings,runner:Runner,text:string,sentAt:string,signature:string,maxBytes:number){
 if(new TextEncoder().encode(text).byteLength>maxBytes||!Number.isFinite(Number(sentAt))||Math.abs(Date.now()-Number(sentAt))>60000)return false
 const key=await runnerKey(env,runner);
 return Boolean(key)&&await same(signature,await sign(key!,`${sentAt}.${text}`))
}
