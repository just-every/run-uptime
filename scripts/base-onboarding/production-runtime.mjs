import {productionRuntime} from './production-options.mjs';

// The pinned Wrangler converter supplies real bindings/assets/migrations. A
// single Miniflare owns one workerd and no bundler or file/config watcher.
if(process.env.RER_ORIGIN_KEY && !/^[A-Z][A-Z0-9_]*$/.test(process.env.RER_ORIGIN_KEY))throw Error('Invalid local origin setting name');
const runtime=await productionRuntime(process.cwd(),process.env.RER_DEV_ORIGIN,Number(process.env.RER_RUNTIME_PORT),process.env.RER_RUNTIME_HOST);
let stopping;
const stop=()=>stopping??=runtime.dispose();
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
try {await runtime.ready;}catch(error){await stop();throw error;}
