import {demoEffect} from './demo-policy.mjs';
import {publicTarget} from '../../src/domain/public-target.mjs';
import {NodePinnedTransport} from '../../src/base/modules/integrations/core/node-transport.ts';
const duration=(value,fallback)=>{const number=value===undefined?fallback:Number(value);if(!Number.isSafeInteger(number)||number<=0)throw Error('Invalid watch interval');return number};
/** The notice route is runner-local and remains usable without the Worker. */
export function createWatch({url,slack=false,afterMs=180000,repeatMs=3600000,retryMs=10000,transport=new NodePinnedTransport(),now=Date.now}={}){
 const target=url?publicTarget(url):null;if(target&&target.protocol!=='https:')throw Error('Watch notice requires HTTPS');if(slack&&target&&(target.hostname!=='hooks.slack.com'||!/^\/services\/[^/]+\/[^/]+\/[^/]+$/.test(target.pathname)))throw Error('Invalid Slack watch address');const endpoint=target?.href??null;
 afterMs=duration(afterMs,180000);repeatMs=duration(repeatMs,3600000);retryMs=duration(retryMs,10000);
 let failedSince=null,lastNotice=null,lastAttempt=null,recoveryAttempt=null,announced=false;
 async function send(kind,time){
  if(!endpoint)return false;
  const text=kind==='recovery'?`Uptime main site contact restored at ${new Date(time).toISOString()}.`:`Uptime main site unreachable since ${new Date(failedSince).toISOString()}: checks and alerts are not running.`;
  try{const result=await demoEffect(()=>transport.send({url:endpoint,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(slack?{text}:{kind,text,since:failedSince,at:time}),timeoutMs:10000,maxResponseBytes:4096,redirect:'error'}),()=>({status:200}));return result.status>=200&&result.status<300}catch{return false}
 }
 return {async failed(){const time=now();failedSince??=time;if(time-failedSince<afterMs)return;if(lastNotice!==null&&time-lastNotice<repeatMs)return;if(lastAttempt!==null&&time-lastAttempt<retryMs)return;lastAttempt=time;if(await send('unreachable',time)){lastNotice=time;announced=true}},async contacted(){const time=now();if(announced){if(recoveryAttempt!==null&&time-recoveryAttempt<retryMs)return;recoveryAttempt=time;if(!await send('recovery',time))return}failedSince=null;lastNotice=null;lastAttempt=null;recoveryAttempt=null;announced=false}}
}
