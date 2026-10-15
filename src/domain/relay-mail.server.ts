// @ts-expect-error Maintained Base mail performs serialization and provider classification.
import {createMailSender} from '../base/modules/mail/index.mjs'

// Base deliberately returns bounded provider results. Retain only the relay's
// Retry-After scheduling metadata at the transport edge, never its error body.
export function relayMailSender(config:any,dependencies:any={}){
 return {async send(message:any){
  let retryAt:number|undefined;
  const sender=createMailSender(config,{...dependencies,fetch:async(url:RequestInfo|URL,init:RequestInit)=>{
   const response=await (dependencies.fetch??fetch)(url,init);
   if(response.status===429){
    const value=response.headers.get('retry-after');
    if(value!==null&&/^\d+$/.test(value)){
     const at=Date.now()+Number(value)*1000;
     if(Number.isSafeInteger(at))retryAt=at;
    }
   }
   return response;
  }});
  const result=await sender.send(message);
  return {...result,...(result.status==='rate_limited'&&retryAt!==undefined?{retryAt}:{})};
 }};
}
