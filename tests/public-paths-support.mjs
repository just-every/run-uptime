import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir,writeFile,cp,mkdir} from 'node:fs/promises';
import {resolve,join,relative,dirname,parse} from 'node:path';
import {splitSql} from './migration-support.mjs';

export async function filesIn(directory,prefix=''){
 const result=[];
 for(const item of await readdir(directory,{withFileTypes:true})){
  const path=prefix+item.name;
  result.push(...(item.isDirectory()?await filesIn(join(directory,item.name),path+'/'):[path]));
 }
 return result.sort();
}
export async function publicRuntime(directory,bindings,port){
 await mkdir(directory,{recursive:true});
 const emitted=resolve('dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
 const wrapper=join(directory,'envelope.mjs'),assets=join(directory,'assets');
 await cp(resolve(emitted,config.assets.directory),assets,{recursive:true});
 // A genuine file at the network/static edge, deliberately absent from the
 // manifest. The unchanged production Worker must never disclose its content.
 await writeFile(join(assets,'undeclared-public-probe.txt'),'UNDECLARED ASSET MUST NOT BE SERVED');
 await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};
 export default {async fetch(request,env,ctx){const input=await request.json();
 if(input.scheduled){await app.scheduled({},env,ctx);return new Response(null,{status:204})}
 return app.fetch(new Request(input.url,{method:input.method,headers:input.headers,...(input.body===undefined?{}:{body:input.body})}),env,ctx)}};`);
 const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},...(await readdir(join(emitted,'assets'))).filter(n=>n.endsWith('.js')).map(n=>({type:'ESModule',path:join(emitted,'assets',n)}))];
 const worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,host:'127.0.0.1',port,assets:{directory:assets,binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true},d1Databases:{DB:'public-paths-test'},resourcePersistencePath:join(directory,'state'),bindings,unsafeLocalExplorer:false,unsafeObservability:false,
 outboundService:()=>{throw Error('Public declaration checks must not send external requests')}}));
 try{
  await worker.ready;
  const DB=await worker.getD1Database('DB');
  if(!await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='monitors'").first())for(const file of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const envelope=input=>worker.dispatchFetch(`http://127.0.0.1:${port}/`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),redirect:'manual'});
  const call=(path,{ip='192.0.2.1',method='GET',headers={},body}={})=>envelope({url:bindings.UPTIME_ORIGIN+path,method,headers:{host:new URL(bindings.UPTIME_ORIGIN).host,origin:bindings.UPTIME_ORIGIN,...(ip===null?{}:{'cf-connecting-ip':ip}),...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body})});
  return {worker,DB,call,scheduled:()=>envelope({scheduled:true})};
 }catch(error){await worker.dispose();throw error}
}
export async function prefill(DB,classification,limit){
 const row=await DB.prepare('SELECT client_hash FROM public_rate_limits WHERE class=? LIMIT 1').bind(classification).first();
 assert.ok(row,`public request created a durable ${classification} counter`);
 // Populate the current and next real window so wall-clock rollover between
 // two HTTP requests cannot invalidate the boundary fixture. No app test hook.
 const start=Math.floor(Date.now()/60_000)*60_000;
 for(const time of [start,start+60_000])await DB.prepare(`INSERT INTO public_rate_limits(class,client_hash,window_start,request_count,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(class,client_hash,window_start) DO UPDATE SET request_count=excluded.request_count`).bind(classification,row.client_hash,time,limit-1,time+60_000).run();
}
export async function limited(response,label){
 assert.equal(response.status,429,label);
 const seconds=Number(response.headers.get('retry-after'));
 assert.ok(Number.isInteger(seconds)&&seconds>0,`${label}: Retry-After is a positive number of seconds`);
 assert.equal(response.headers.get('cache-control'),'no-store');
 await response.arrayBuffer();
}
