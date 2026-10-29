// BASE-ACCESS-003: declared sessionless surfaces and atomic persistent D1 limits.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,keyHeader} from './auth-test-support.mjs';
import {filesIn,publicRuntime,prefill,limited,steadyMinute} from './public-paths-support.mjs';
import {provePublicSurfaces} from './public-surfaces-support.mjs';

const seed=JSON.parse(await readFile('seed.json','utf8')),declarations=seed.deploy.publicPaths,limits=seed.limits.publicRequestsPerMinutePerIp;
const matches=(path,local=false)=>declarations.find(item=>(local||item.environment!=='local')&&(item.match==='prefix'?path.startsWith(item.path):path===item.path)&&(!item.withinDirectory||(!/[\\]|%(?:2f|5c|25)/i.test(path)&&path.split('/').includes(item.withinDirectory))));
const emitted=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
const files=await filesIn(resolve('dist/server',emitted.assets.directory));
const [port]=await availablePorts(1),rows=[],unservedFiles=[];
let directory;
let runtime;
const hosted={...testAuthBindings,UPTIME_ORIGIN:'https://uptime.example.test',UPTIME_LOCAL_REVIEW:'false',MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-no-provider-calls',UPTIME_RUNNER_KEY:'test-only-public-runner-key-000001'};
delete hosted.RER_DEV_KEY;
const start=async(local=false)=>{
 const bindings=local?{...testAuthBindings,UPTIME_ORIGIN:`http://127.0.0.1:${port}`,UPTIME_LOCAL_REVIEW:'true',UPTIME_RUNNER_KEY:hosted.UPTIME_RUNNER_KEY}:hosted;
 runtime=await publicRuntime(join(directory,local?'local':'hosted'),bindings,port);return runtime;
};
const probes=new Map();
function probe(path,declaration,source='declaration'){
 const old=probes.get(path);probes.set(path,{path,declaration,source:old?old.source+', '+source:source});
}
const docSite=JSON.parse(await readFile('docs/site.json','utf8'));
const docs=docSite.sections.flatMap(section=>section.pages.map(page=>'/docs/'+page.slug));
for(const declaration of declarations){
 assert.ok(declaration.authentication,'each path names its authentication requirement');
 assert.ok(Number.isSafeInteger(limits[declaration.class])&&limits[declaration.class]>1,'owner tunable positive class budget');
 if(declaration.match==='exact')probe(declaration.path,declaration);
 else{
  assert.ok(declaration.path.endsWith('/'),'prefixes stop at a path boundary');
  const exemplar=files.map(file=>'/'+file).find(path=>path.startsWith(declaration.path))??docs.find(path=>path.startsWith(declaration.path))??declaration.path+(declaration.withinDirectory?'installation/node_modules/vite/dist/client/env.mjs':declaration.class==='runner'?'claim':'declaration-probe');
  probe(exemplar,declaration);
 }
}
for(const file of files){
 const path='/'+file,declaration=matches(path);
 if(!declaration){unservedFiles.push(path);continue}
 assert.equal(declaration.kind,'asset',`emitted static file ${path} must be covered by an asset declaration`);
 probe(path,declaration,'emitted file');
}
directory=await runtimeDirectory();
try{
 let {DB,call}=await start();
 await provePublicSurfaces({call,origin:hosted.UPTIME_ORIGIN,directory});
 await DB.prepare('DELETE FROM public_rate_limits').run();
 // Discover non-served output metadata by its actual Worker denial, never by
 // a fixed filename exclusion. A newly served undeclared file fails here.
 for(const path of unservedFiles){
  const response=await call(path);assert.equal(response.status,404,`${path}: undeclared emitted file must not be served`);await response.arrayBuffer();
  rows.push([path,'undeclared emitted file',404,'n/a','n/a','not served']);
 }
 for(const {path,declaration,source} of probes.values()){
  if(declaration.environment==='local')continue;
  await DB.prepare('DELETE FROM public_rate_limits').run();
  const check=(options={})=>call(path,{...(declaration.kind==='credentialed'?{method:'POST',body:'{}'}:{}),...options});
  const initial=await check(),status=initial.status;await initial.arrayBuffer();
  assert.notEqual(status,429,`${path}: baseline is not limited`);
  if(source.includes('emitted file'))assert.equal(status,200,`${path}: emitted static file served`);
  await prefill(DB,declaration.class,limits[declaration.class]);
  const last=await check();assert.equal(last.status,status,`${path}: limit-th request allowed`);await last.arrayBuffer();
  await limited(await check(),`${path}: limit+1`);
  const other=await check({ip:'192.0.2.2'});assert.equal(other.status,status,`${path}: second client unaffected`);await other.arrayBuffer();
  rows.push([path,declaration.class,status,429,status,declaration.kind==='credentialed'?source+' (POST {})':source]);
 }
 await DB.prepare('DELETE FROM public_rate_limits').run();
 // Discover literal route candidates from the actual server entry, including
 // newly added routes. Denied private routes can never be covered by an asset
 // or document prefix accidentally.
 const source=await readFile('src/server.ts','utf8');
 const candidates=new Set([...source.matchAll(/['"](\/[^'"\s]*)['"]/g)].map(match=>match[1].replace(/:[\w]+/g,'private').replace(/\*/g,'private')));
 for(const path of [...candidates,'/api','/api/overview','/app','/app/monitor','/app/monitors/private','/_serverFn/private','/unknown-path','/undeclared-public-probe.txt','/assets-private','/docs-private','/auth/undeclared-probe']){
  if(matches(path))continue;
  const privateDocument=/^\/app(?:\/?|\/monitor\/?|\/(?:locations|notifications|archive|settings|signout)\/?|\/monitors(?:\/?|\/[^/]+\/?|\/[^/]+\/edit\/?|\/new\/discovery\/[^/]+\/?|\/new\/manual(?:\/(?:public|private)(?:\/[^/]+)?)?\/?))$/.test(path);
  const expected=path==='/api'||path.startsWith('/api/')?401:privateDocument||path.startsWith('/_serverFn/')?303:404;
  for(const method of ['GET','POST']){
   const response=await call(path,{method,...(method==='POST'?{body:'{}'}:{})});
   assert.equal(response.status,expected,`undeclared/private ${method} ${path}`);
   if(expected===303)assert.equal(response.headers.get('location'),'/login');
   assert.doesNotMatch(await response.text(),/UNDECLARED ASSET MUST NOT BE SERVED/);
  }
  rows.push([path,'private/undeclared',expected,'n/a','n/a','GET/POST denied']);
 }
 for(const item of declarations.filter(item=>item.environment==='local'))assert.equal((await call(item.path)).status,404,`${item.path}: unavailable hosted`);
 await DB.prepare('DELETE FROM public_rate_limits').run();
 await (await call('/health')).arrayBuffer();
 const burstTiming=await steadyMinute();
 await prefill(DB,matches('/health').class,limits[matches('/health').class]);
 const dispatched=Date.now();
 assert.ok(burstTiming.windowStart+60_000-dispatched>=20_000,'actual concurrent dispatch has at least twenty seconds remaining');
 const boundary=await Promise.all(Array.from({length:8},()=>call('/health')));
 assert.equal(Math.floor(Date.now()/60_000)*60_000,burstTiming.windowStart,'the concurrent burst completes within one fixed minute');
 console.log('BURST_TIMING '+JSON.stringify({...burstTiming,dispatched,dispatchRemainingMs:burstTiming.windowStart+60_000-dispatched,completed:Date.now()}));
 assert.equal(boundary.filter(response=>response.status===200).length,1,'one simultaneous request occupies the last slot');
 assert.equal(boundary.filter(response=>response.status===429).length,boundary.length-1,'every other simultaneous request is rate limited');
 for(const response of boundary)if(response.status===429)await limited(response,'atomic boundary');else await response.arrayBuffer();
 assert.equal((await call('/')).status,200,'independent class unaffected');
 await runtime.worker.dispose();runtime=null;
 ({DB,call}=await start());await limited(await call('/health'),'D1 limit survives Worker restart');
 await DB.prepare('DELETE FROM public_rate_limits').run();
 await (await call('/health',{ip:null})).arrayBuffer();await prefill(DB,matches('/health').class,limits[matches('/health').class]);
 await (await call('/health',{ip:'not-an-ip'})).arrayBuffer();
 for(const ip of [null,'not-an-ip','999.1.2.3','192.0.2.1, 192.0.2.2','2001:db8::g'])await limited(await call('/health',{ip}),'missing/malformed hosted IP shares unknown bucket');
 assert.equal((await call('/health',{ip:'192.0.2.8'})).status,200,'valid IP independent of unknown bucket');
 await DB.prepare('DELETE FROM public_rate_limits').run();
 await (await call('/health',{ip:'2001:db8::1'})).arrayBuffer();await prefill(DB,matches('/health').class,limits[matches('/health').class]);
 await (await call('/health',{ip:'2001:0db8:0:0:0:0:0:1'})).arrayBuffer();await limited(await call('/health',{ip:'2001:db8::1'}),'equivalent IPv6 addresses share a canonical bucket');
 const stored=(await DB.prepare('SELECT * FROM public_rate_limits').all()).results;
 assert.ok(stored.length>0&&stored.every(row=>/^[a-f0-9]{64}$/.test(row.client_hash)),'D1 stores keyed client hashes');
 assert.doesNotMatch(JSON.stringify(stored),/192\.0\.2|2001:|loopback|unknown/,'no raw client identity stored');
 await DB.prepare('INSERT INTO public_rate_limits VALUES(?,?,?,?,?)').bind('expired-fixture','hash',0,1,1).run();
 assert.equal((await runtime.scheduled()).status,204,'real scheduled handler runs cleanup');
 assert.equal(await DB.prepare("SELECT * FROM public_rate_limits WHERE class='expired-fixture'").first(),null,'cron removes expired counters');
 assert.ok((await DB.prepare('SELECT COUNT(*) n FROM public_rate_limits').first()).n>0,'cron preserves active counters');
 await runtime.worker.dispose();runtime=null;
 ({DB,call}=await start(true));
 for(const path of ['/src/server.ts','/src/domain/control.server.ts','/@fs/installation/data/local-secrets.json','/@fs/installation/exports/private.rer','/@fs/installation/node_modules/../data/local-secrets.json','/@fs/installation/node_modules/%252e%252e/private.rer']){
  const response=await call(path);assert.equal(response.status,404,`${path}: local compiler declaration must not admit private files`);await response.arrayBuffer();
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM public_rate_limits').first()).n,0,'private compiler paths are undeclared, not merely missing assets');
 }
 for(const {path,declaration:item} of probes.values()){
  if(item.environment!=='local')continue;
  await DB.prepare('DELETE FROM public_rate_limits').run();
  const initial=await call(path,{headers:keyHeader()}),status=initial.status;await initial.arrayBuffer();
  await prefill(DB,item.class,limits[item.class]);
  assert.equal((await call(path,{headers:keyHeader()})).status,status);
  await limited(await call(path,{headers:keyHeader()}),`${path}: local limit+1`);
  await limited(await call(path,{ip:'198.51.100.9',headers:{...keyHeader(),'x-forwarded-for':'203.0.113.9'}}),`${path}: local spoof remains loopback`);
  rows.push([path,item.class,status,429,'429 (shared loopback)','local declaration']);
 }
 await DB.prepare('ALTER TABLE public_rate_limits RENAME TO unavailable_public_rate_limits').run();
 for(const path of ['/health','/app.js']){const response=await call(path);assert.equal(response.status,503,`${path}: unavailable counter storage fails closed`);assert.doesNotMatch(await response.text(),/D1|SQL|no such table/)}
 const report=['# BASE-ACCESS-003 public paths and rate limits','',`Inspected emitted Worker with ${files.length} discovered emitted files (${files.length-unservedFiles.length} served static resources); declaration read from seed.json. No session used. Counter fixtures set limit−1 through D1; the final allowed and first refused requests use the public Worker door.`, '', '| Path | Class | Baseline | Limit+1 | Second IP | Source |','| --- | --- | ---: | ---: | --- | --- |',...rows.map(row=>'| '+row.join(' | ')+' |'),'','Passed: independent classes; eight simultaneous final-slot requests admit exactly one; Worker restart preserves limits; absent/malformed hosted CF-Connecting-IP shares unknown bucket; canonical IPv6; spoofed local headers share loopback; raw IP absent from D1; scheduled cleanup removes expired counters and preserves active counters; unknown/undeclared paths fail closed; unavailable counter storage denies health/assets with 503 without SQL details.','','Defaults are owner-tunable and estimated-not-tested: '+JSON.stringify(limits)+'.','Hosted dev endpoints are 404. The production build omits dev identity and Vite compiler handlers, so their local declarations return 404 in emitted local mode; the limiter still executes before routing. Actual Vite behavior is checked in the separate startup development evidence. Local second IP cannot create a second bucket by design. Runtime capacity is not established by these boundary checks.'];
 if(process.env.UPTIME_PUBLIC_PATHS_EVIDENCE){await mkdir(resolve(process.env.UPTIME_PUBLIC_PATHS_EVIDENCE,'..'),{recursive:true});await writeFile(process.env.UPTIME_PUBLIC_PATHS_EVIDENCE,report.join('\n')+'\n')}
 console.log(report.join('\n'));
 // A visitor sees a safe diagnostic while configuration is missing, then health returns after repair.
 await runtime.worker.dispose();runtime=null;
 const incomplete={...hosted};delete incomplete.SESSION_SECRET;
 runtime=await publicRuntime(join(directory,'configuration'),incomplete,port);
 const unavailable=await runtime.call('/health');assert.equal(unavailable.status,503);
 const explanation=await unavailable.text();assert.ok(explanation.includes('SESSION_SECRET'));assert.ok(!explanation.includes(hosted.SESSION_SECRET));
 await runtime.worker.dispose();runtime=null;
 runtime=await publicRuntime(join(directory,'configuration'),hosted,port);
 assert.equal((await runtime.call('/health')).status,200,'corrected configuration restores the public health door');

}finally{await runtime?.worker.dispose();await cleanupDirectory(directory)}
