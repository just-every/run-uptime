import {appendFile,readFile} from 'node:fs/promises';
import {startLocalWorker as startWorker} from '../scripts/local-worker.mjs';
const messages=[];
export const allDeliveredMessages=()=>messages;
export async function readDeliveredMessages(){
 const path=process.env.UPTIME_TEST_MAIL_LOG;
 return path?(await readFile(path,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line)):messages;
}
export const deliveredMessages=origin=>messages.filter(message=>message.origin===origin);
export function testMailOptions(options){
 const mailLog=options.mailLog??process.env.UPTIME_TEST_MAIL_LOG;
 const development=options.bindings?.MAIL_PROVIDER==='development'&&options.bindings?.UPTIME_LOCAL_REVIEW!=='false'&&options.bindings?.RER_DEMO!=='1';
 const bindings=development?{...options.bindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-mail-provider-key'}:options.bindings;
 return {...options,bindings,outboundService:async request=>{
  if(new URL(request.url).hostname==='api.sendgrid.com'){
   const message=await request.clone().json();
   const response=development?new Response(null,{status:202}):await options.outboundService(request);
   if(response.status===202){
    const text=message.content.find(part=>part.type==='text/plain')?.value??'',link=text.match(/https?:\/\/[^\s]+/);
    const delivery={origin:link?new URL(link[0]).origin:bindings.UPTIME_ORIGIN,message,text};
    messages.push(delivery);
    if(mailLog)await appendFile(mailLog,JSON.stringify(delivery)+'\n',{mode:0o600});
   }
   return response;
  }
  if(options.outboundService)return options.outboundService(request);
  throw Error('Unexpected network request');
 }};
}
export const startLocalWorker=options=>startWorker(testMailOptions(options));
