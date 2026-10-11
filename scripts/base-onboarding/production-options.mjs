import {createRequire} from 'node:module';
import {realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readSettings} from './adapter-settings.mjs';
import {productionModules} from './production-modules.mjs';

export async function productionRuntime(root,origin,port,host='127.0.0.1'){
 const require=createRequire(await realpath(resolve(root,'node_modules/wrangler/package.json')));
 const {unstable_getMiniflareWorkerOptions,unstable_readConfig}=require('wrangler');
 const miniflare=require('miniflare'),{Miniflare,convertV4MiniflareOptions}=miniflare;
 const config=unstable_readConfig({config:resolve(root,'dist/server/wrangler.json')});
 const selected=unstable_getMiniflareWorkerOptions(config);
 const vars=(await readSettings(root,{file:'.dev.vars'})).values;
 const {modulesRules,...workerOptions}=selected.workerOptions;
 const worker={...workerOptions,name:config.name,...await productionModules(selected.main,modulesRules,miniflare),
  bindings:{...workerOptions.bindings,...vars,[process.env.RER_ORIGIN_KEY ?? 'AUTH_ORIGIN']:origin,RER_DEV_ORIGIN:origin,...(process.env.RER_DEV_KEY?{RER_DEV_KEY:process.env.RER_DEV_KEY}:{})}};
 // No trigger handlers and no Local Explorer: neither may answer on a port a person or proxy reaches.
 const options=convertV4MiniflareOptions({host,port,unsafeTriggerHandlers:false,unsafeLocalExplorer:false,workers:[worker,...selected.externalWorkers]});
 return new Miniflare({...options,resourcePersistencePath:resolve(root,'.wrangler/state/v3')});
}
