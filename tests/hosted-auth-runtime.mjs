import {testMailOptions} from './mail-provider-fixture.mjs';
// Test-only envelope preserves an exact HTTPS request through local workerd.
// Production handler, Base auth, selected mail adapter and D1 remain unchanged.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join,relative,dirname,parse} from 'node:path';
export async function hostedRuntime(directory,bindings,outboundService,{observeFetch=false}={}){
 ({bindings,outboundService}=testMailOptions({bindings,outboundService}));
 const emitted=resolve('dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
 const wrapper=join(directory,'test-envelope.mjs');
 // Observe options inside workerd; the service boundary reconstructs Request
 // with redirect=follow. Delegate unchanged to the real native Worker fetch.
 const observation=observeFetch?`const redirects=[];const nativeFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=(input,init)=>{redirects.push(init?.redirect??(input instanceof Request?input.redirect:'follow'));return nativeFetch(input,init)};`:'';

 await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))}; ${observation} export default {scheduled(controller,env,ctx){return app.scheduled(controller,env,ctx)},async fetch(request,env,ctx){const input=await request.json(); ${observeFetch?'if(input.transportObservation)return Response.json(redirects);':''} if(input.scheduled){try{await app.scheduled({},env,ctx);return new Response(null,{status:204})}catch(error){return new Response(error.stack,{status:500})}} return app.fetch(new Request(input.url,{method:input.method,headers:input.headers,...(input.body===undefined?{}:{body:input.body})}),env,ctx)}};`);
 const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},...(await readdir(join(emitted,'assets'))).filter(n=>n.endsWith('.js')).map(n=>({type:'ESModule',path:join(emitted,'assets',n)}))];
 const worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,host:'127.0.0.1',port:15504,assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true},d1Databases:{DB:'hosted-auth-test'},resourcePersistencePath:join(directory,'state'),bindings,outboundService,unsafeLocalExplorer:false,unsafeObservability:false}));
 try{await worker.ready;return worker}catch(error){await worker.dispose();throw error}
}
