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
import {proveServiceCatalog} from './service-catalog-journey.mjs';
import {proveDiscoverySources} from './discovery-sources-journey.mjs';
import {proveAttributedDiscoveryJobs} from './access-discovery-job-support.mjs';
import {provePublicDnsDiscovery} from './discovery-public-dns-support.mjs';
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
// ACCESS-001 adds opaque actor receipts to the owner's committed discovery
// batches. Keep every earlier row exact and account for each new receipt;
// runner answers and refused inputs still have no unrelated durable effect.
function assertDiscoveryReceipts(before,after,count,started){
 const owner=before.oa_operators.find(row=>row.role==='owner'&&row.status==='active');assert.ok(owner);
 const prior=new Set(before.uptime_audit.map(row=>row.id));
 const receipts=after.uptime_audit.filter(row=>!prior.has(row.id));
 assert.equal(receipts.length,count,'one opaque actor receipt per authorized discovery write batch');
 for(const row of receipts){
  assert.match(row.id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.ok(Number.isSafeInteger(row.occurred_at)&&row.occurred_at>=started&&row.occurred_at<=Date.now());
  assert.deepEqual(row,{id:row.id,actor_kind:'operator',actor_ref:owner.id,occurred_at:row.occurred_at,action:'access_discovery_write',subject_kind:'operator',subject_ref:row.id});
 }
 assert.deepEqual(after,{...before,uptime_audit:[...before.uptime_audit,...receipts]},'every prior audit and every other non-counter table stays exact');
}
const clear=()=>f.DB.prepare('DELETE FROM discovery_jobs').run();

const waitUntil=async(read,label,ms=20000)=>{const until=Date.now()+ms;for(;;){const value=await read();if(value)return value;if(Date.now()>until)throw Error(`${label} did not happen`);await new Promise(r=>setTimeout(r,50))}};

test("Discover a site, review and adopt monitoring, follow its dependency, and retain source custody",async()=>{
 await proveAttributedDiscoveryJobs();
// the owner asks, a runner claims and answers, and the owner reads the proposals with the runner's network label
{
 await clear();const started=Date.now(),before=await everythingElse();
 const made=await create('https://example.com');assert.equal(made.status,201);assert.equal(made.data.status,'queued');
 const id=made.data.id,queued=await read(id);assert.deepEqual(queued.data,{id,url:'https://example.com/',status:'queued',initiatingOwnerId:before.oa_operators.find(o=>o.role==='owner'&&o.status==='active').id,stoppedAt:null,stopReason:null});
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
 assert.deepEqual((await read(failedId)).data,{id:failedId,url:'https://example.org/',status:'failed',initiatingOwnerId:before.oa_operators.find(o=>o.role==='owner'&&o.status==='active').id,stoppedAt:null,stopReason:null,networkLabel:'second-network',error:'The site did not answer.'});
 assertDiscoveryReceipts(before,await everythingElse(),10,started);
}
// DEPENDENCY-001 a linked provider status page is discovered, its component adopted and changed, and its evidence stays separate from the application monitor
{
 const g=await fixture(),edge=await statuspageEdge(g.directory),controller=new AbortController();
 const browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--disable-gpu','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 let running;
 try{
  assert.equal((await g.request('/api/runners/'+g.second.runnerId,{method:'DELETE'})).status,200,'one runner network is left');
  assert.equal((await g.request('/api/external-check',{body:{url:canaryUrl}})).status,200);
  const page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();
  await browserSignIn(page,g.origin,{bindings:g.bindings});
  await page.goto(g.origin+'/app/monitors/new');
  await page.getByLabel('Website URL',{exact:true}).fill(applicationUrl);
  await page.getByRole('button',{name:'Check',exact:true}).click();
  running=runRunner({origin:g.origin,key:g.first.key,runnerId:g.first.runnerId,localReview:true,signal:controller.signal,pollMs:20});
  const job=await waitUntil(async()=>{const rows=(await g.DB.prepare('SELECT id FROM discovery_jobs').all()).results;if(!rows.length)return;const job=(await g.request('/api/discoveries/'+rows[0].id)).data;return ['done','failed'].includes(job.status)?job:null},'real runner discovery',30000);
  assert.equal(job.status,'done',job.error);
  // The real runner claimed the console's website check beside its probe loop and posted an answer the console accepts.
  assert.equal(job.networkLabel,g.first.networkLabel);assert.equal(job.result.input,applicationUrl);assert.ok(job.result.requests>=1);
  assert.ok(job.result.proposals.every(p=>p.definition.network==='public'&&p.definition.assignments===undefined));
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
  if(evidence){await mkdir(evidence,{recursive:true});for(const width of [1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:join(evidence,`component-review-${width}.png`),fullPage:true})}}
  await page.getByRole('button',{name:'Start 3 monitors',exact:true}).click();
  await page.waitForURL(g.origin+'/app/monitors');
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
}
// DEPENDENCY-002 catalog providers are followed after a live source check, notify every contact and fallback on their route without opening an incident, show linked and coincident notices on application incidents, go Unknown when a source fails, and a provider outside the catalog goes through the reviewed proposal
{
 const launch=()=>chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--disable-gpu','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 await proveServiceCatalog({launch,evidence:process.env.UPTIME_DEPENDENCY_EVIDENCE});
}
// DISCOVERY-001 owner-authorized DNS, sitemap, OpenAPI and six provider sources propose reviewed monitors with provenance, duplicates, traffic and Unknown cost; rediscovery shows new routes and removed endpoints; only adopted monitors run and provider credentials stay on the runner
{
 const launch=()=>chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--disable-gpu','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 await proveDiscoverySources({launch,evidence:process.env.UPTIME_DISCOVERY_EVIDENCE});
 // After controlled source edges close, qualify the publicly delegated RER domain
 // through the real runner's unchanged system resolver and public transport.
 await provePublicDnsDiscovery({launch,evidence:process.env.UPTIME_DISCOVERY_EVIDENCE});
}
});
