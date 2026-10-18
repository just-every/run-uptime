import {demoEffect} from './demo-policy.mjs';
import {publicTarget} from '../../src/domain/public-target.mjs';
import {NodePinnedTransport} from '../../src/base/modules/integrations/core/node-transport.ts';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {watchStore} from './watch-store.mjs';
const duration=(value,fallback)=>{const number=value===undefined?fallback:Number(value);if(!Number.isSafeInteger(number)||number<=0)throw Error('Invalid watch interval');return number};
/** The notice route and its durable progress remain usable without the Worker. */
export function createWatch({url,slack=false,afterMs=180000,repeatMs=3600000,retryMs=10000,leaseMs=60000,statePath,identity='',transport=new NodePinnedTransport(),now=Date.now}={}){
 const target=url?publicTarget(url):null;if(target&&target.protocol!=='https:')throw Error('Watch notice requires HTTPS');if(slack&&target&&(target.hostname!=='hooks.slack.com'||!/^\/services\/[^/]+\/[^/]+\/[^/]+$/.test(target.pathname)))throw Error('Invalid Slack watch address');const endpoint=target?.href??null;
 afterMs=duration(afterMs,180000);repeatMs=duration(repeatMs,3600000);retryMs=duration(retryMs,10000);leaseMs=duration(leaseMs,60000);
 const store=endpoint?watchStore(statePath??resolve('data/watch',createHash('sha256').update(`${identity}\n${endpoint}`).digest('hex')+'.sqlite')):null;
 let pending=Promise.resolve();
 async function send(kind){
  if(!store)return;
  const time=now(),attempt=store.claim(kind,time,{afterMs,repeatMs,retryMs,leaseMs});if(!attempt)return;
  const text=kind==='recovery'?`Uptime main site contact restored at ${new Date(time).toISOString()}.`:`Uptime main site unreachable since ${new Date(attempt.since).toISOString()}: checks and alerts are not running.`;
  if(!store.submitted(attempt.id,now()))return;
  let outcome='uncertain';
  try{const result=await demoEffect(()=>transport.send({url:endpoint,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(slack?{text}:{kind,text,since:attempt.since,at:time}),timeoutMs:10000,maxResponseBytes:4096,redirect:'error'}),()=>({status:200}));outcome=result.status>=200&&result.status<300?'accepted':'rejected'}catch{}
  store.finish(attempt.id,outcome,now());
 }
 const enqueue=kind=>{const next=pending.then(()=>send(kind));pending=next.catch(()=>{});return next};
 return {failed:()=>enqueue('unreachable'),contacted:()=>enqueue('recovery'),async close(){await pending;store?.close()}};
}
