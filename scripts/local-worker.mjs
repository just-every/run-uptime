import {validateConfiguration} from '../src/domain/startup-config.mjs';
import {portValue,freePort} from './local-ports.mjs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Run the emitted Worker directly. Wrangler's extra local proxy loses the next
// request after a rejected oversized streaming body; preserve its v3 D1 layout.
// `cf` is the request.cf every request carries (where a runner connects from names its location); left out, Miniflare
// reads this machine's own.
export async function startLocalWorker({root=resolve(fileURLToPath(new URL('../',import.meta.url))),host='127.0.0.1',port=0,persist=join(root,'.wrangler/state'),bindings={},assets=true,outboundService,cf}={}) {
  portValue(port,{zero:true});
  const automaticPort=port===0&&!Object.hasOwn(bindings,'UPTIME_ORIGIN');
  for(let attempt=0;;attempt++){
  const candidate=port===0?await freePort():port;
  // Callers prepare installation settings explicitly; missing keys are never regenerated here.
  const runtimeBindings={UPTIME_LOCAL_REVIEW:'true',...bindings,UPTIME_ORIGIN:Object.hasOwn(bindings,'UPTIME_ORIGIN')?bindings.UPTIME_ORIGIN:`http://127.0.0.1:${candidate}`};
  validateConfiguration(runtimeBindings,{scope:'settings'});
  const emitted=join(root,'dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
  const modules=[{type:'ESModule',path:join(emitted,config.main)},...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))];
  const worker=new Miniflare(convertV4MiniflareOptions({
    name:config.name,scriptPath:join(emitted,config.main),modules,modulesRoot:emitted,
    compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
    host,port:candidate,...(outboundService?{outboundService}:{}),...(cf!==undefined?{cf}:{}),unsafeTriggerHandlers:false,unsafeLocalExplorer:false,unsafeObservability:false,resourcePersistencePath:join(resolve(persist),'v3'),
    d1Databases:Object.fromEntries(config.d1_databases.map(db=>[db.binding,db.database_id])),
    ...(assets?{assets:{directory:resolve(emitted,config.assets.directory),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true}}:{}),bindings:runtimeBindings,
  }));
  try{await worker.ready;return worker}catch(error){
    try{await worker.dispose()}catch(cleanupError){if(cleanupError!==error)throw new AggregateError([error,cleanupError],'Local Worker startup and cleanup failed')}
    // A released ephemeral port can be claimed by Miniflare's own loopback
    // listener before workerd binds. Retry only that proven startup bind error,
    // before exposing a Worker, with a fresh listener and matching origin.
    if(!automaticPort||attempt>=2||error.code!=='ERR_RUNTIME_FAILURE'||!/bind\(\): Address already in use \(os error (?:98|48)\)/.test(error.message))throw error;
  }
  }
}
