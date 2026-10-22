import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {runtimeDirectory,cleanupDirectory,availablePorts,waitFor} from './notify-acceptance-runtime.mjs';
import {authRequest,signInOwner,testAuthBindings,readCheckoutKey,sessionCookie,finishSetup} from './auth-test-support.mjs';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {splitSql} from './migration-support.mjs';
import {scratchInstallation,machineAvailable} from './scratch-installation.mjs';
import {assertPortFree,descendantGroups,assertGroupsGone} from './installer-support.mjs';
const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
const scratch=await scratchInstallation(),groups=new Set();
let child,worker,syntheticPort;
async function stop(){if(!child)return;groups.add(child.pid);for(const group of await descendantGroups(child.pid))groups.add(group);await scratch.stop(child);child=null}
const consoleMarkers=/class="app"|monitor-list|id="access-form"|id="owner-token"|\/style\.css|\/app\.js/;
async function probe(call,settings,fetcher=fetch,requireRunner=false){
 // The Lobby and docs are public documents with no console assets or data.
 for(const path of ['/','/docs','/docs/overview','/docs/install']){
  const response=await call(path);assert.equal(response.status,200,'public '+path);
  assert.match(response.headers.get('content-type'),/text\/html/);const body=await response.text();assert.doesNotMatch(body,consoleMarkers,path+' carries no console markers');assert.equal(body.match(/<title>/g)?.length,1,path+' has exactly one title');
 }
 const slash=await call('/docs/');assert.equal(slash.status,307,'Start canonicalises the trailing slash without a session redirect');assert.equal(slash.headers.get('location'),'/docs');
 assert.equal((await call('/docs/nope')).status,404);assert.equal((await call('/docs/nope/extra')).status,404);
 for(const path of ['/app','/app/','/app/monitor','/app/monitor/']){
  const denied=await call(path);assert.equal(denied.status,303,'signed-out '+path);assert.equal(denied.headers.get('location'),'/login');assert.equal(denied.headers.get('cache-control'),'no-store');
 }
 const legacy=await call('/monitor?monitor=x');assert.equal(legacy.status,308);assert.equal(legacy.headers.get('location'),'/app/monitors/x/edit');
 const legacySlash=await call('/monitor/?monitor=x');assert.equal(legacySlash.status,308);assert.equal(legacySlash.headers.get('location'),'/app/monitors/x/edit');
 const login=await call('/login');assert.equal(login.status,requireRunner?303:200);if(requireRunner)assert.equal(login.headers.get('location'),'/signin?returnTo=%2Fapp');
 assert.equal((await call('/does-not-exist')).status,404);
 // Before the owner confirms first-run setup the Lobby's one action is /setup; once confirmed it is sign-in,
 // which a local instance prefills with the owner's address.
 const lobby=async expected=>{const state=await call('/setup/state');assert.equal(state.status,200);assert.deepEqual(await state.json(),{state:expected});const action=(await(await call('/')).text()).match(/<a class="btn" href="([^"]+)"/)?.[1];assert.equal(action,expected==='claimed'?(requireRunner?`/login?login_hint=${encodeURIComponent(settings.OWNER_EMAIL)}`:'/login'):'/setup','Lobby action while '+expected)};
 await lobby('unclaimed');
 let cookie;
 if(requireRunner){
  const gate=await call('/__dev/key',{key:settings.RER_DEV_KEY});assert.equal(gate.status,204);
  const gateCookie=gate.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  cookie=gateCookie+'; '+sessionCookie(await call('/auth/dev/enter?as=owner&returnTo=%2Fsetup',undefined,{cookie:gateCookie}));
  await finishSetup(settings.UPTIME_ORIGIN,cookie,fetcher);
 }else cookie=await signInOwner(settings.UPTIME_ORIGIN,{bindings:settings,fetcher,finishFirstRun:true});
 await lobby('claimed');
 if(requireRunner)await waitFor(async()=>{const response=await call('/api/overview',undefined,{cookie});return response.ok&&(await response.json()).runner.contact.state==='Fresh contact'},'real private runner contact',60000);
 const alias=await call('/app',undefined,{cookie});assert.equal(alias.status,308);assert.equal(alias.headers.get('location'),'/app/monitors');
 const response=await call('/app/monitors',undefined,{cookie});assert.equal(response.status,200);const html=await response.text();assert.match(html,/class="app"/);assert.match(html,/href="\/style\.css"/);assert.doesNotMatch(html,/<script[^>]*src="\/app\.js"/,'the DOM-mutating controller starts only after hydration');assert.doesNotMatch(html,/id="access-form"|id="owner-token"/);
 const app=await call('/app.js',undefined,{cookie});assert.equal(app.status,200);assert.equal(await app.text(),await readFile('public/app.js','utf8'),'the deferred console controller is served intact');
 const editorAlias=await call('/app/monitor',undefined,{cookie});assert.equal(editorAlias.status,308);assert.equal(editorAlias.headers.get('location'),'/app/monitors/new');assert.equal((await call('/app/monitors/new',undefined,{cookie})).status,200);
 assert.equal((await call('/docs/overview',undefined,{cookie})).status,200,'signed-in owner can still read the public docs');
 const missing=await call('/does-not-exist',undefined,{cookie});assert.equal(missing.status,404);assert.doesNotMatch(await missing.text(),/class="app"|src="\/app.js"/);
}
try{
 await scratch.run('pnpm',['install','--frozen-lockfile']);
 await scratch.run('pnpm',['run','setup','--','--owner-email',testAuthBindings.OWNER_EMAIL,'--port',String(port),'--non-interactive']);
 // The installation's own dev key opens one-click owner entry.
 const settings={...JSON.parse(await readFile(join(scratch.root,'data/local-secrets.json'),'utf8')),RER_DEV_KEY:await readCheckoutKey(scratch.root)};
 // rer dev detaches without a terminal; --foreground keeps it this test's child, as a terminal would.
 await machineAvailable();child=scratch.start('pnpm',['run','dev','--','--foreground']);
 await waitFor(async()=>{if(child.exitCode!==null)throw Error('Development launcher stopped');return child.output.includes('RER_READY '+origin)&&(await fetch(origin+'/health')).ok},'real pnpm run dev',60000);
 syntheticPort=JSON.parse(await readFile(join(scratch.root,'.wrangler/state/synthetic-grant.json'),'utf8')).port;
 await probe(authRequest(origin),settings,fetch,true);
 await stop();await assertGroupsGone(groups);
 for(const released of [port,syntheticPort])await assertPortFree(released);
 const hostedOrigin='https://uptime.example.test',bindings={...testAuthBindings,UPTIME_ORIGIN:hostedOrigin,UPTIME_LOCAL_REVIEW:'false',MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-not-submitted'};
 worker=await hostedRuntime(directory,bindings,()=>{throw Error('No provider submission expected')});
 const DB=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
 const fetcher=(url,init)=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url,method:init.method,headers:{...init.headers,'cf-connecting-ip':'192.0.2.1'},body:init.body})});
 await probe(authRequest(hostedOrigin,fetcher),bindings,fetcher);
 console.log('ACCESS-SMOKE passed real pnpm run dev and emitted hosted Worker: the Lobby turns from Finish setup to Sign in when first run is confirmed, public docs 200 without console markers, unknown docs and routes 404, signed-out /app redirect, /monitor 308, signed-in /app console.');
}finally{
 const failures=[];
 for(const action of [stop,()=>worker?.dispose(),()=>scratch.close(),()=>cleanupDirectory(directory),()=>assertGroupsGone(groups),...[port,syntheticPort,15504].filter(Boolean).map(port=>()=>assertPortFree(port))])try{await action()}catch(error){failures.push(error)}
 if(failures.length)throw new AggregateError(failures,'Access smoke teardown failed');
}
console.log(`ACCESS-SMOKE cleanup passed: ${groups.size} owned process groups gone; native control, synthetic and hosted ports free.`);
