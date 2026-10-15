import {startLocalWorker as startWorker} from '../scripts/local-worker.mjs';
const messages=[];
export const allDeliveredMessages=()=>messages;
export const deliveredMessages=origin=>messages.filter(message=>message.origin===origin);
export function testMailOptions(options){
 const development=options.bindings?.MAIL_PROVIDER==='development'&&options.bindings?.UPTIME_LOCAL_REVIEW!=='false'&&options.bindings?.RER_DEMO!=='1';
 const bindings=development?{...options.bindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-mail-provider-key'}:options.bindings;
 return {...options,bindings,outboundService:async request=>{
  if(new URL(request.url).hostname==='api.sendgrid.com'){
   const message=await request.clone().json();
   const response=development?new Response(null,{status:202}):await options.outboundService(request);
   if(response.status===202){
    const text=message.content.find(part=>part.type==='text/plain')?.value??'',link=text.match(/https?:\/\/[^\s]+/);
    messages.push({origin:link?new URL(link[0]).origin:bindings.UPTIME_ORIGIN,message,text});
   }
   return response;
  }
  if(options.outboundService)return options.outboundService(request);
  throw Error('Unexpected network request');
 }};
}
export const startLocalWorker=options=>startWorker(testMailOptions(options));
