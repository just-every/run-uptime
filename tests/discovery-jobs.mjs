// Discovery jobs through the Worker door: the owner's console asks, a runner claims and answers, and the Worker never
// fetches the target. The test plays the runner with its real credentials and signatures; time moves by ageing the
// stored job, as other tests age sessions. Fakes sit only at the network edge.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture} from './resilience/support.mjs';
import {browserSignIn,signInOwner,emailSignIn} from './auth-test-support.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {statuspageEdge,applicationUrl,statusOrigin,canaryUrl} from './dependency-status-fixture.mjs';
let f;
before(async()=>{f=await fixture()});
after(async()=>{await f?.close()});
const create=url=>f.request('/api/discoveries',{body:{url}});
const read=id=>f.request('/api/discoveries/'+id);
const claim=runner=>f.request('/api/runner/discoveries/claim',{runner,body:{}});
const post=(runner,id,body)=>f.request(`/api/runner/discoveries/${id}/result`,{runner,signed:true,body});
const definition=(overrides={})=>({name:'Example home',url:'https://example.com/',method:'GET',assertions:{status:200},intervalMs:60000,...overrides});
const proposal=(key,overrides={})=>({key,kind:'page',selected:true,name:'Home page',reason:'The page answered 200.',checks:['Status is 200'],definition:definition(),...overrides});
const result=(overrides={})=>({input:'https://example.com/',finalUrl:'https://example.com/',requests:3,durationMs:420,hosts:['example.com'],notes:['robots.txt was not found'],proposals:[proposal('home'),proposal('api-health',{kind:'health',definition:definition({name:'Example health',url:'https://example.com/health',type:'keyword',assertions:{status:200,bodyIncludes:'ok'}})})],...overrides});
// Every table but the one that holds jobs and the public request counter, which a refused public-path request may touch.
async function everythingElse(){
 const names=(await f.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_METADATA','discovery_jobs','public_rate_limits') ORDER BY name").all()).results.map(r=>r.name);
 const snapshots={};
 for(let index=0;index<names.length;index+=2){
  const rows=await Promise.all(names.slice(index,index+2).map(async name=>[name,(await f.DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results]));
  Object.assign(snapshots,Object.fromEntries(rows));
 }
 return snapshots;
}
const age=(id,column,ms)=>f.DB.prepare(`UPDATE discovery_jobs SET ${column}=${column}-? WHERE id=?`).bind(ms,id).run();
const clear=()=>f.DB.prepare('DELETE FROM discovery_jobs').run();

test('the owner asks, a runner claims and answers, and the owner reads the proposals with the runner\'s network label',async()=>{
 await clear();const before=await everythingElse();
 const made=await create('https://example.com');assert.equal(made.status,201);assert.equal(made.data.status,'queued');
 const id=made.data.id,queued=await read(id);assert.deepEqual(queued.data,{id,url:'https://example.com/',status:'queued'});
 const claimed=await claim(f.first);assert.deepEqual(claimed.data,{job:{id,url:'https://example.com/'}});
 assert.deepEqual((await claim(f.second)).data,{job:null},'a claimed job is handed out once');
 const running=await read(id);assert.equal(running.data.status,'running');assert.equal(running.data.networkLabel,f.first.networkLabel);
 // A runner that did not claim the job cannot answer it.
 assert.equal((await post(f.second,id,{result:result()})).status,409);assert.equal((await read(id)).data.status,'running');
 // Hostile answers from the claiming runner are refused and leave the job running.
 const hostile={'an unknown key':result({cookies:'a=b'}),'an unknown proposal key':result({proposals:[{...proposal('home'),body:'<html>'}]}),'an oversize note':result({notes:['x'.repeat(201)]}),
  'too many proposals':result({proposals:Array.from({length:13},(_,i)=>proposal(`p-${i}`))}),'a bad key':result({proposals:[proposal('Not Valid')]}),'a repeated key':result({proposals:[proposal('a'),proposal('a')]}),
  'a loopback definition':result({proposals:[proposal('local',{definition:definition({url:'http://127.0.0.1:8080/'})})]}),'a private address':result({proposals:[proposal('private',{definition:definition({url:'http://10.0.0.5/'})})]}),
  'a definition with assignments':result({proposals:[proposal('assigned',{definition:{...definition(),probes:['local-a'],assignments:{'local-a':{runnerId:'self-00000000-0000-0000-0000-000000000000'}}}})]}),
  'a definition with a secret':result({proposals:[proposal('secret',{definition:{...definition(),headers:{authorization:'Bearer x'}}})]}),'a definition with an unknown field':result({proposals:[proposal('extra',{definition:{...definition(),probeBody:'x'}})]}),
  'a method that is not allowed':result({proposals:[proposal('trace',{definition:definition({method:'TRACE'})})]}),'a heartbeat definition':result({proposals:[proposal('beat',{definition:{name:'Beat',type:'heartbeat'}})]}),
  'a final URL with credentials':result({finalUrl:'https://user:pw@example.com/'}),'a negative request count':result({requests:-1}),'a result that is not an object':'a page'};
 for(const [label,body] of Object.entries(hostile)){const refused=await post(f.first,id,{result:body});assert.equal(refused.status,400,label);assert.match(refused.data.error,/^Invalid discovery result/,label)}
 for(const body of [{},{result:result(),error:'both'},{error:'x'.repeat(201)},{error:''},{results:result()}])assert.equal((await post(f.first,id,body)).status,400);
 assert.equal((await post(f.first,id,{result:result({input:'x'.repeat(200_000)})})).status,403,'an oversize body is refused before it is read');
 assert.equal((await read(id)).data.status,'running','no refused answer finished the job');
 const stored=await post(f.first,id,{result:result()});assert.equal(stored.status,200);
 const done=(await read(id)).data;assert.equal(done.status,'done');assert.equal(done.networkLabel,f.first.networkLabel);
 assert.equal(done.result.proposals.length,2);assert.equal(done.result.proposals[0].definition.network,'public');assert.equal(done.result.proposals[0].definition.assignments,undefined);assert.equal(done.error,undefined);
 assert.equal((await post(f.first,id,{result:result()})).status,409,'a finished job takes no second answer');
 // A runner may also report that it could not look.
 const failedId=(await create('https://example.org/')).data.id;assert.equal((await claim(f.second)).data.job.id,failedId);
 assert.equal((await post(f.second,failedId,{error:'The site did not answer.'})).status,200);
 assert.deepEqual((await read(failedId)).data,{id:failedId,url:'https://example.org/',status:'failed',networkLabel:'second-network',error:'The site did not answer.'});
 assert.deepEqual(await everythingElse(),before,'no monitor, slot, observation, state, outbox, audit or notification row was written');
});
test('a job nobody claims, or nobody finishes, expires; refusals at create leave nothing behind',async()=>{
 await clear();const before=await everythingElse();
 const stale=(await create('https://example.com/')).data.id;await age(stale,'created_at',120_001);
 const expired=await read(stale);assert.equal(expired.data.status,'expired');assert.equal(expired.data.error,'No runner picked this up. Check that your runner is running.');
 const fresh=(await create('https://example.net/')).data.id,older=(await create('https://example.org/')).data.id;await age(older,'created_at',120_001);
 assert.equal((await claim(f.first)).data.job.id,fresh,'claim expires the stale job first and hands out the oldest job still waiting');
 assert.equal((await read(older)).data.status,'expired');
 await age(fresh,'claimed_at',120_001);assert.equal((await read(fresh)).data.status,'expired');
 assert.equal((await post(f.first,fresh,{result:result()})).status,409,'an expired job is not stored');assert.equal((await read(fresh)).data.result,undefined);
 await clear();
 for(const url of ['http://10.0.0.1/','http://127.0.0.1:4795/','http://[::1]/','http://192.168.1.1/admin','file:///etc/passwd','ftp://example.com/','https://user:pw@example.com/','https://example.com/#top','not a url',7])assert.equal((await create(url)).status,400,String(url));
 assert.equal((await f.request('/api/discoveries',{body:{url:'https://example.com/',extra:true}})).status,400);
 assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM discovery_jobs').first()).n,0);
 assert.equal((await f.request('/api/discoveries',{body:{url:'https://example.com/'},headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM discovery_jobs').first()).n,0);
 assert.equal((await read('00000000-0000-0000-0000-000000000000')).status,404);assert.equal((await read('not-an-id')).status,400,'a malformed id is invalid input');
 assert.deepEqual(await everythingElse(),before);
});
test('at most five discoveries wait or run at once, and a finished one frees its place',async()=>{
 await clear();const ids=[];
 for(let i=0;i<5;i++){const made=await create(`https://example.com/${i}`);assert.equal(made.status,201);ids.push(made.data.id)}
 const refused=await create('https://example.com/six');assert.equal(refused.status,429);assert.match(refused.data.error,/5 discoveries are already waiting or running/);
 assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM discovery_jobs').first()).n,5);
 assert.equal((await claim(f.first)).data.job.id,ids[0]);assert.equal((await post(f.first,ids[0],{error:'Finished early.'})).status,200);
 assert.equal((await create('https://example.com/six')).status,201);
});

const waitUntil=async(read,label,ms=20000)=>{const until=Date.now()+ms;for(;;){const value=await read();if(value)return value;if(Date.now()>until)throw Error(`${label} did not happen`);await new Promise(r=>setTimeout(r,50))}};

test('the real runner claims a website check beside its probe loop, looks at the site and posts an answer the console accepts',async()=>{
 await clear();
 f.modes.target=200;
 const id=(await create(`http://93.184.216.34:${f.port}/`)).data.id,controller=new AbortController();
 const running=runRunner({origin:f.origin,key:f.first.key,runnerId:f.first.runnerId,localReview:true,signal:controller.signal,pollMs:20});
 try{
  const job=await waitUntil(async()=>{const read=(await f.request('/api/discoveries/'+id)).data;return ['done','failed'].includes(read.status)?read:null},'the runner answering the website check');
  assert.equal(job.status,'done',job.error);assert.equal(job.networkLabel,f.first.networkLabel);
  assert.equal(job.result.input,`http://93.184.216.34:${f.port}/`);assert.ok(job.result.requests>=1);
  assert.ok(job.result.proposals.every(p=>p.definition.network==='public'&&p.definition.assignments===undefined));
 }finally{controller.abort();await running}
});

test('DEPENDENCY-001 a linked provider status page is discovered, its component adopted and changed, and its evidence stays separate from the application monitor',async()=>{
 const g=await fixture(),edge=await statuspageEdge(g.directory),controller=new AbortController();
 const browser=await chromium.launch({headless:true,args:['--disable-gpu','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 let running;
 try{
  assert.equal((await g.request('/api/runners/'+g.second.runnerId,{method:'DELETE'})).status,200,'one runner network is left');
  assert.equal((await g.request('/api/external-check',{body:{url:canaryUrl}})).status,200);
  const page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();
  await browserSignIn(page,g.origin,{bindings:g.bindings});
  await page.goto(g.origin+'/app/monitor');
  await page.getByLabel('Website URL',{exact:true}).fill(applicationUrl);
  await page.getByRole('button',{name:'Check',exact:true}).click();
  running=runRunner({origin:g.origin,key:g.first.key,runnerId:g.first.runnerId,localReview:true,signal:controller.signal,pollMs:20});
  const job=await waitUntil(async()=>{const rows=(await g.DB.prepare('SELECT id FROM discovery_jobs').all()).results;if(!rows.length)return;const job=(await g.request('/api/discoveries/'+rows[0].id)).data;return ['done','failed'].includes(job.status)?job:null},'real runner discovery',30000);
  assert.equal(job.status,'done',job.error);
  controller.abort();await running;running=undefined;
  const proposals=job.result.proposals,overall=proposals.find(p=>p.definition.assertions.json?.path==='status.indicator');
  const components=proposals.filter(p=>p.definition.url===statusOrigin+'/api/v2/components.json');
  assert.ok(overall);assert.ok(components.length>=2&&components.length<edge.state.components.length,'the list is bounded');
  assert.equal(new Set(components.map(p=>p.key)).size,components.length,'same URL retains distinct ID-keyed rows');
  assert.ok(components.every(p=>!p.selected));assert.ok(proposals.indexOf(overall)<proposals.indexOf(components[0]));
  assert.ok(edge.requests.some(r=>r.host==='status.provider.test'&&r.path==='/api/v2/components.json'));
  const api=components.find(p=>p.definition.assertions.json.path==='components[?(@.id=="api")].status');
  const payments=components.find(p=>p.definition.assertions.json.path==='components[?(@.id=="payments")].status');
  assert.ok(api&&payments);
  for(const p of [overall,...components]){assert.equal(p.kind,'status-page');assert.equal(p.definition.service,'Acme Cloud');assert.ok(p.definition.tags.includes('dependency'));assert.match(p.definition.outcome,/provider.*own claim/i);assert.ok(p.definition.outcome.includes(p.definition.url))}
  await page.getByRole('heading',{name:'Proposed monitors'}).waitFor();
  for(const p of proposals)assert.equal(await page.getByRole('checkbox',{name:p.name,exact:true}).isChecked(),p.selected);
  // Reviewing another component is a checkbox choice before adoption.
  await page.getByRole('checkbox',{name:api.name,exact:true}).check();
  await page.getByRole('checkbox',{name:api.name,exact:true}).uncheck();
  await page.getByRole('checkbox',{name:payments.name,exact:true}).check();
  const evidence=process.env.UPTIME_DEPENDENCY_EVIDENCE;
  if(evidence){await mkdir(evidence,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:join(evidence,`component-review-${width}.png`),fullPage:true})}}
  await page.getByRole('button',{name:'Start 3 monitors',exact:true}).click();
  await page.waitForURL(g.origin+'/app');
  const monitors=async()=>(await g.request('/api/overview')).data.monitors;
  const adopted=await monitors(),app=adopted.find(m=>m.definition.url===applicationUrl),provider=adopted.find(m=>m.definition.url===payments.definition.url),whole=adopted.find(m=>m.definition.url===overall.definition.url);
  assert.equal(adopted.length,3);assert.ok(app&&provider&&whole);
  for(const m of [provider,whole]){assert.equal(m.definition.service,'Acme Cloud');assert.deepEqual(m.definition.tags,['dependency']);assert.ok(m.definition.outcome.includes(m.definition.url))}
  const history=async id=>{const response=await g.request(`/api/monitors/${id}/history`);assert.equal(response.status,200);return response.data};
  const check=async id=>{
   await g.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now()-1,id).run();
   const previous=(await history(id)).length;
   for(let i=0;i<adopted.length;i++){await g.run(g.first);if((await history(id)).length>previous)break}
   const rows=await history(id);assert.equal(rows.length,previous+1,'a scheduled signed runner completion was accepted');assert.equal(rows[0].manual,0);assert.equal(rows[0].status,'complete');return rows[0];
  };
  // Complete each independent initial schedule, without waiting a minute between slots.
  for(const m of adopted)for(let i=0;i<2;i++)await check(m.id);
  assert.equal((await g.state(app.id)).state,'Healthy');assert.equal((await g.state(provider.id)).state,'Healthy');
  // Persisted state is compared byte-for-byte; the public projection's evaluation
  // clock advances on each read, so compare its health separately below.
  const appSnapshot=async()=>({monitor:await g.DB.prepare('SELECT * FROM monitors WHERE id=?').bind(app.id).first(),state:(await g.state(app.id)).state,history:await history(app.id),revisions:(await g.DB.prepare('SELECT * FROM revisions WHERE monitor_id=? ORDER BY revision').bind(app.id).all()).results});
  const before=await appSnapshot(),oldRevision=provider.revision;
  // The editor's ordinary PATCH saves a reviewed name, component label and assertion together.
  const changed=await g.request('/api/monitors/'+provider.id,{method:'PATCH',body:{...provider.definition,...api.definition,assignments:provider.definition.assignments}});
  assert.equal(changed.status,200,JSON.stringify(changed.data));assert.ok(changed.data.revision>oldRevision);
  const revisions=(await g.DB.prepare('SELECT definition FROM revisions WHERE monitor_id=? ORDER BY revision').bind(provider.id).all()).results.map(r=>JSON.parse(r.definition));
  assert.equal(revisions[0].assertions.json.path,payments.definition.assertions.json.path);assert.equal(revisions.at(-1).assertions.json.path,api.definition.assertions.json.path);
  edge.state.components.find(c=>c.id==='api').status='degraded_performance';
  await check(provider.id);const failed=await check(provider.id);
  assert.equal(failed.definition.service,'Acme Cloud');assert.ok(failed.definition.outcome.includes(statusOrigin));assert.equal(failed.observations[0].outcome,'target_failure');assert.ok(failed.observations[0].checks.some(c=>c.assertion==='json'&&!c.pass));
  assert.equal((await g.state(provider.id)).state,'Failing');
  const failedMonitor=(await monitors()).find(m=>m.id===provider.id);assert.equal(failedMonitor.definition.service,'Acme Cloud');assert.ok(failedMonitor.definition.outcome.includes(statusOrigin));
  const alerts=(await g.request('/api/overview')).data.alerts;assert.ok(alerts.some(a=>a.monitor_id===provider.id&&a.kind==='trigger'),'ordinary separate provider monitor has its own incident');assert.ok(!alerts.some(a=>a.monitor_id===app.id));
  assert.deepEqual(await appSnapshot(),before,'provider state, revision and evidence never alter the application monitor');
  edge.state.components=edge.state.components.filter(c=>c.id!=='api');
  let missing=await check(provider.id);assert.equal(missing.observations[0].outcome,'runner_error');assert.match(missing.observations[0].checks[0].reason,/Acme Cloud.*component is missing or renamed/);assert.equal((await g.state(provider.id)).state,'Unknown');
  edge.state.components.push({id:'api',name:'Renamed API',status:'operational'});
  missing=await check(provider.id);assert.equal(missing.observations[0].outcome,'runner_error');assert.equal((await g.state(provider.id)).state,'Unknown','a renamed reviewed component never becomes Healthy');
  edge.state.source=503;missing=await check(provider.id);assert.match(missing.observations[0].checks[0].reason,/source is unavailable/);assert.equal((await g.state(provider.id)).state,'Unknown');
  edge.state.source=null;missing=await check(provider.id);assert.match(missing.observations[0].checks[0].reason,/source is unavailable/);assert.equal((await g.state(provider.id)).state,'Unknown','a source that stops answering is missing evidence');
  assert.deepEqual(await appSnapshot(),before);
  // A provider's robots policy still gates component discovery while the overall proposal survives.
  edge.state.source=200;edge.state.robots=true;const requestCount=edge.requests.length;
  const blocked=(await g.request('/api/discoveries',{body:{url:applicationUrl}})).data.id,blockedController=new AbortController();
  running=runRunner({origin:g.origin,key:g.first.key,runnerId:g.first.runnerId,localReview:true,signal:blockedController.signal,pollMs:20});
  try{const job=await waitUntil(async()=>{const job=(await g.request('/api/discoveries/'+blocked)).data;return ['done','failed'].includes(job.status)?job:null},'robots-honouring discovery',30000);assert.equal(job.status,'done',job.error);assert.ok(job.result.proposals.some(p=>p.definition.url===overall.definition.url));assert.ok(!job.result.proposals.some(p=>p.definition.url===provider.definition.url));assert.ok(!edge.requests.slice(requestCount).some(r=>r.path==='/api/v2/components.json'))}finally{blockedController.abort();await running;running=undefined}
 }finally{controller.abort();if(running)await running;await browser.close();await edge.close();await g.close()}
});

test('a new monitor starts from a pasted URL: the runner answers, the owner unticks one, and the rest start with no other input',async()=>{
 await clear();
 assert.equal((await f.request('/api/runners/'+f.second.runnerId,{method:'DELETE'})).status,200,'one runner network is left');
 const browser=await chromium.launch({headless:true,args:['--disable-gpu','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 try{
  const page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();
  await browserSignIn(page,f.origin,{bindings:f.bindings});
  await page.goto(f.origin+'/app/monitor');
  await page.getByLabel('Website URL',{exact:true}).fill('example.com');
  await page.getByRole('button',{name:'Check',exact:true}).click();
  // The test is the runner: it claims over the runner route and answers over the signed result route.
  const job=await waitUntil(async()=>(await claim(f.first)).data.job,'the console queueing the check');
  assert.equal(job.url,'https://example.com/');
  await page.getByText(`Looking at example.com from ${f.first.networkLabel}`,{exact:false}).waitFor();
  const shape=(name,url,extra={})=>proposal(name.toLowerCase().replace(/\W+/g,'-'),{name,reason:`${name} answered 200.`,checks:['Expects 200','Every minute'],definition:definition({name,url,...extra})});
  const answer=result({input:'https://example.com/',finalUrl:'https://example.com/',requests:9,durationMs:5400,notes:['robots.txt was read on 1 host and honoured for everything except your own URL.'],
   proposals:[shape('Example site','https://example.com/'),{...shape('Example status','https://status.example.com/api/v2/status.json',{assertions:{status:200,json:{path:'status.indicator',equals:'none'}}}),kind:'status-page'},shape('Example dashboard','https://example.com/dashboard')]});
  assert.equal((await post(f.first,job.id,{result:answer})).status,200);
  await page.getByRole('heading',{name:'Proposed monitors'}).waitFor();
  assert.equal(await page.locator('#discovery-status').innerText(),`Checked from ${f.first.networkLabel} · 9 requests · 5 seconds`);
  assert.equal(await page.getByRole('checkbox').evaluateAll(boxes=>boxes.filter(b=>b.checked).length),3,'the runner pre-ticked all three');
  await page.locator('.proposal-name').filter({hasText:'Example status'}).click();
  assert.equal(await page.getByRole('checkbox',{name:'Example status'}).isChecked(),false,'clicking the row unticks it');
  await page.getByRole('button',{name:'Start 2 monitors',exact:true}).waitFor();
  // The visible first-run default is independent of example.com; no extra input is required.
  await page.getByRole('button',{name:'Start 2 monitors',exact:true}).click();
  await page.waitForURL(f.origin+'/app');
  const monitors=(await f.request('/api/overview')).data.monitors;
  assert.deepEqual(monitors.map(m=>m.definition.name).sort(),['Example dashboard','Example site']);
  for(const m of monitors){assert.equal(m.definition.enabled,true);assert.deepEqual(m.definition.assignments['local-a'],{runnerId:f.first.runnerId,networkLabel:f.first.networkLabel,canaryUrl:'https://example.org/'})}
  await page.goto(f.origin+'/app/monitor');
  await page.getByLabel('Website URL',{exact:true}).fill('http://10.0.0.5/status');await page.getByRole('button',{name:'Check',exact:true}).click();
  await page.getByRole('link',{name:'Check a private address',exact:true}).click();await page.locator('html.editor-context-ready').waitFor();
  assert.equal(await page.locator('[name=networkScope]').inputValue(),'private');assert.equal(await page.locator('[name=url]').inputValue(),'http://10.0.0.5/status');
  assert.equal((await f.request('/api/overview')).data.monitors.length,monitors.length,'opening the private form creates nothing');
 }finally{await browser.close()}
});
// First-run setup through its public door: the owner's website, set at installation or typed into the form, becomes one discovery job.
// Each case starts its own installation because first run completes once. No runner runs, so every job stays queued and nothing is fetched.
const formHeaders={'content-type':'application/x-www-form-urlencoded'};
test('first run with a website in the settings queues one job, however often the page is opened, and finishing lands on it',async()=>{
 const g=await fixture({UPTIME_START_URL:'https://example.com/shop'});
 try{
  const cookie=await signInOwner(g.origin,{bindings:g.bindings});
  const setup=(init={})=>fetch(g.origin+'/setup',{redirect:'manual',...init,headers:{origin:g.origin,cookie,...init.headers}});
  const jobs=async()=>(await g.DB.prepare('SELECT id,url,status FROM discovery_jobs ORDER BY created_at,rowid').all()).results;
  assert.equal((await setup({method:'HEAD'})).status,200);assert.deepEqual(await jobs(),[],'a header request queues nothing');
  let page;for(let i=0;i<3;i++){page=await (await setup()).text();assert.equal((await jobs()).length,1,`open ${i+1}`)}
  assert.ok(page.includes('https://example.com/shop'),'the page names the site being checked');assert.ok(!page.includes('name="start_url"'),'the owner is not asked again');
  const [job]=await jobs();assert.deepEqual({url:job.url,status:job.status},{url:'https://example.com/shop',status:'queued'});
  // A site typed into a stale form is ignored: the installation's answer wins.
  const finished=await setup({method:'POST',headers:formHeaders,body:'start_url=other.example.org'});
  assert.equal(finished.status,303);assert.equal(finished.headers.get('location'),'/app/monitor?'+new URLSearchParams({discovery:job.id,website:'example.com',from:g.first.networkLabel}));assert.equal((await jobs()).length,1);
  assert.equal((await setup()).headers.get('location'),'/app','first run completes once');
  assert.equal((await setup({method:'POST'})).headers.get('location'),'/app');assert.equal((await jobs()).length,1,'a second completion queues nothing');
  // Reuse covers queued, running and done jobs; one that failed or expired is asked again.
  await g.DB.prepare('DELETE FROM uptime_first_run').run();
  await g.DB.prepare("UPDATE discovery_jobs SET status='failed',error='x'").run();
  assert.equal((await setup()).status,200);assert.deepEqual((await jobs()).map(j=>j.status),['failed','queued']);
  await g.DB.prepare("UPDATE discovery_jobs SET status='done' WHERE status='queued'").run();
  assert.equal((await setup()).status,200);assert.equal((await jobs()).length,2);
 }finally{await g.close()}
});
test('first run without a website offers an optional field: filled it queues the job and lands on it, empty it behaves as before',async()=>{
 for(const [label,form] of [['a typed site','start_url=Example.com%2Fabout'],['an empty field','start_url='],['no form at all',undefined]]){
  const g=await fixture();
  try{
   const cookie=await signInOwner(g.origin,{bindings:g.bindings});
   const jobs=async()=>(await g.DB.prepare('SELECT id,url,status FROM discovery_jobs').all()).results;
   const page=await fetch(g.origin+'/setup',{redirect:'manual',headers:{cookie}});assert.equal(page.status,200,label);
   const html=await page.text();assert.ok(html.includes('name="start_url"'),`${label}: the field is offered`);assert.ok(!html.includes('external_check_url'),`${label}: the external check URL is not asked in setup`);assert.deepEqual(await jobs(),[]);
   const done=await fetch(g.origin+'/setup',{method:'POST',redirect:'manual',headers:{origin:g.origin,cookie,...(form===undefined?{}:formHeaders)},...(form===undefined?{}:{body:form})});assert.equal(done.status,303,label);
   if(form==='start_url=Example.com%2Fabout'){const all=await jobs();assert.deepEqual(all.map(j=>[j.url,j.status]),[['https://example.com/about','queued']]);assert.equal(done.headers.get('location'),'/app/monitor?'+new URLSearchParams({discovery:all[0].id,website:'example.com',from:g.first.networkLabel}))}
   else{assert.equal(done.headers.get('location'),'/app/monitor?first=1',`${label}: an installation with no monitors opens the new-monitor form`);assert.deepEqual(await jobs(),[],`${label}: nothing is queued`)}
   assert.equal((await fetch(g.origin+'/setup',{redirect:'manual',headers:{cookie}})).headers.get('location'),'/app');
   assert.equal((await g.DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n,0,'nothing created a monitor');
  }finally{await g.close()}
 }
});
test('first run refuses a site that is not public, a stranger and another origin, and stays unfinished',async()=>{
 const g=await fixture();
 try{
  const cookie=await signInOwner(g.origin,{bindings:g.bindings});
  await g.DB.prepare("INSERT INTO oa_operators VALUES('member','member@example.test','Member','member','active',1,?)").bind(Date.now()).run();
  const member=await emailSignIn(g.origin,{bindings:{...g.bindings,OWNER_EMAIL:'member@example.test'}});
  const post=(session,form,headers={})=>fetch(g.origin+'/setup',{method:'POST',redirect:'manual',headers:{origin:g.origin,...formHeaders,...(session?{cookie:session}:{}),...headers},body:form});
  const unfinished=async()=>{assert.equal((await g.DB.prepare('SELECT COUNT(*) n FROM uptime_first_run').first()).n,0);assert.equal((await g.DB.prepare('SELECT COUNT(*) n FROM discovery_jobs').first()).n,0)};
  for(const site of ['http://10.0.0.1/','127.0.0.1:4795','http://[::1]/','192.168.1.1/admin','ftp://example.com/','https://user:pw@example.com/','https://example.com/#top','not a url','x'.repeat(3000)]){
   const refused=await post(cookie,'start_url='+encodeURIComponent(site));assert.equal(refused.status,400,site);
   const page=await refused.text();assert.match(page,/role="alert"/,'the refusal is on the page');assert.ok(page.includes('name="start_url"'),'the owner can try again');await unfinished()
  }
  assert.equal((await post(cookie,'start_url='+'a'.repeat(20000))).status,400);await unfinished();
  for(const [label,session] of [['signed out',''],['a member',member]]){
   const denied=await post(session,'start_url=example.com');assert.equal(denied.status,session?403:303,label);if(session)assert.match(await denied.text(),/Access denied/);else assert.equal(denied.headers.get('location'),'/login?returnTo=%2Fsetup');await unfinished();
  }
  for(const headers of [{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'}])assert.equal((await post(cookie,'start_url=example.com',headers)).status,403);
  await unfinished();assert.equal((await fetch(g.origin+'/setup',{headers:{cookie}})).status,200,'refusals left first run unfinished');
 }finally{await g.close()}
});
