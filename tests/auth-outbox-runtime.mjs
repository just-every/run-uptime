// Test-only exact-request envelope and query counter around the emitted app.
// Every query still runs against real D1; production auth and mail are unchanged.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join,relative,dirname,parse} from 'node:path';

export async function authOutboxRuntime(directory,bindings,outboundService){
 const emitted=resolve('dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
 const wrapper=join(directory,'auth-outbox-envelope.mjs');
 await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};
 export default {async fetch(request,env,ctx){
  const input=await request.json();let outboxReads=0;
  const DB=new Proxy(env.DB,{get(target,name){
   if(name==='prepare')return sql=>{if(/\\b(?:SELECT|WITH)\\b[\\s\\S]*\\brer_mail_development_outbox\\b/i.test(sql))outboxReads++;return target.prepare(sql)};
   const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;
  }});
  const response=await app.fetch(new Request(input.url,{method:input.method,headers:input.headers,...(input.body===undefined?{}:{body:input.body})}),{...env,DB},ctx);
  const headers=new Headers(response.headers);headers.set('x-test-outbox-reads',String(outboxReads));
  return new Response(response.body,{status:response.status,headers});
 }};`);
 const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))];
 const worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,host:'127.0.0.1',port:15504,d1Databases:{DB:'auth-outbox-test'},resourcePersistencePath:join(directory,'outbox-state'),bindings,outboundService,unsafeLocalExplorer:false,unsafeObservability:false}));
 try{await worker.ready}catch(error){await worker.dispose();throw error}
 const call=(path,body,headers={})=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:bindings.UPTIME_ORIGIN+path,method:body===undefined?'GET':'POST',headers:Object.fromEntries(Object.entries({host:new URL(bindings.UPTIME_ORIGIN).host,origin:bindings.UPTIME_ORIGIN,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...headers}).filter(([,value])=>value!==undefined)),...(body===undefined?{}:{body:JSON.stringify(body)})})});
 return {worker,call,DB:await worker.getD1Database('DB')};
}
