import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve,relative,dirname,parse} from 'node:path';

// Clock edge only: execute the emitted application and its real D1/mail code.
// scheduledTime is otherwise ignored by the application's scheduled handler;
// changing Node's Date.now cannot control the separate Worker isolate.
export async function startWatchClockWorker({port,persist,bindings}){
 const emitted=resolve('dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
 const wrapper=join(persist,'watch-clock.mjs');
 await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};
 let now=Date.now();Date.now=()=>now;
 export default {
  fetch(request,env,ctx){return app.fetch(request,env,ctx)},
  scheduled(controller,env,ctx){now=controller.scheduledTime;return app.scheduled(controller,env,ctx)}
 };
 `);
 const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))];
 const worker=new Miniflare(convertV4MiniflareOptions({
  name:config.name,scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,
  compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
  host:'127.0.0.1',port,unsafeTriggerHandlers:false,unsafeLocalExplorer:false,unsafeObservability:false,
  resourcePersistencePath:join(resolve(persist),'v3'),
  d1Databases:Object.fromEntries(config.d1_databases.map(db=>[db.binding,db.database_id])),
  assets:{directory:resolve(emitted,config.assets.directory),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true},
  bindings:{...bindings,UPTIME_ORIGIN:`http://127.0.0.1:${port}`},
 }));
 try{await worker.ready;return worker}catch(error){await worker.dispose();throw error}
}
