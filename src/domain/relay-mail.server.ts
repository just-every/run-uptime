// Base deliberately returns bounded provider results. Retain only the relay's
// Retry-After scheduling metadata at the transport edge, never its error body.
// `create` builds the Base relay sender over the observed fetch it is given.
export function relayMailSender(create:(dependencies:any)=>{send(message:any):Promise<any>},dependencies:any={}){
 return {async send(message:any){
  let retryAt:number|undefined;
  const sender=create({...dependencies,fetch:async(url:RequestInfo|URL,init:RequestInit)=>{
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
