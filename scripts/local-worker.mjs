import {portValue,freePort} from './local-ports.mjs';
import {readLocalSettings,prepareLocalSettings,generatedNames} from './local-settings.mjs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Run the emitted Worker directly. Wrangler's extra local proxy loses the next
// request after a rejected oversized streaming body; preserve its v3 D1 layout.
export async function startLocalWorker({root=resolve(fileURLToPath(new URL('../',import.meta.url))),host='127.0.0.1',port=0,persist=join(root,'.wrangler/state'),bindings={},assets=true,outboundService}={}) {
  portValue(port,{zero:true});if(port===0)port=await freePort();
  // Native runtime callers may omit credentials. The same kit definitions persist
  // their installation keys; explicit bindings always retain precedence.
  const secrets=generatedNames.every(name=>typeof bindings[name]==='string') ? {}
    : (await prepareLocalSettings({path:join(resolve(persist),'worker-secrets.json'),input:{email:bindings.OWNER_EMAIL}})).vars;
  const emitted=join(root,'dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
  const modules=[{type:'ESModule',path:join(emitted,config.main)},...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))];
  const worker=new Miniflare(convertV4MiniflareOptions({
    name:config.name,scriptPath:join(emitted,config.main),modules,modulesRoot:emitted,
    compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
    host,port,...(outboundService?{outboundService}:{}),unsafeLocalExplorer:false,unsafeObservability:false,resourcePersistencePath:join(resolve(persist),'v3'),
    d1Databases:Object.fromEntries(config.d1_databases.map(db=>[db.binding,db.database_id])),
    ...(assets?{assets:{directory:resolve(emitted,config.assets.directory),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true}}:{}),bindings:{UPTIME_LOCAL_REVIEW:'true',...secrets,...bindings,UPTIME_ORIGIN:bindings.UPTIME_ORIGIN??`http://127.0.0.1:${port}`},
  }));
  try{await worker.ready;return worker}catch(error){await worker.dispose();throw error}
}
