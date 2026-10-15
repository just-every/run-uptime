// Discovery jobs through the Worker door: the owner's console asks, a runner claims and answers, and the Worker never
// fetches the target. The test plays the runner with its real credentials and signatures; time moves by ageing the
// stored job, as other tests age sessions. Fakes sit only at the edge, and there is none here: nothing is fetched.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture} from './resilience/support.mjs';
import {browserSignIn,signInOwner,emailSignIn} from './auth-test-support.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
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
 return Object.fromEntries(await Promise.all(names.map(async name=>[name,(await f.DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results])));
}
const age=(id,column,ms)=>f.DB.prepare(`UPDATE discovery_jobs SET ${column}=${column}-? WHERE id=?`).bind(ms,id).run();
const clear=()=>f.DB.prepare('DELETE FROM discovery_jobs').run();

test('the owner asks, a runner claims and answers, and the owner reads the proposals with the runner\'s network label',async()=>{
 await clear();const before=await everythingElse();
 const made=await create('https://example.com');assert.equal(made.status,201);assert.equal(made.data.status,'queued');
 const id=made.data.id,queued=await read(id);assert.deepEqual(queued.data,{id,url:'https://example.com/',status:'queued'});
 const claimed=await claim(f.first);assert.deepEqual(claimed.data,{job:{id,url:'https://example.com/'}});
 assert.deepEqual((await claim(f.second)).data,{job:null},'a claimed job is handed out once');
 const running=await read(id);assert.equal(running.data.status,'running');assert.equal(running.data.networkLabel,'owner-network');
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
 const done=(await read(id)).data;assert.equal(done.status,'done');assert.equal(done.networkLabel,'owner-network');
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
  assert.equal(job.status,'done',job.error);assert.equal(job.networkLabel,'owner-network');
  assert.equal(job.result.input,`http://93.184.216.34:${f.port}/`);assert.ok(job.result.requests>=1);
  assert.ok(job.result.proposals.every(p=>p.definition.network==='public'&&p.definition.assignments===undefined));
 }finally{controller.abort();await running}
});

test('a new monitor starts from a pasted URL: the runner answers, the owner unticks one, and the rest start with no other input',async()=>{
 await clear();
 assert.equal((await f.request('/api/runners/'+f.second.runnerId,{method:'DELETE'})).status,200,'one runner network is left');
 const browser=await chromium.launch({headless:true,args:['--disable-gpu'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 try{
  const page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();
  await browserSignIn(page,f.origin,{bindings:f.bindings});
  await page.goto(f.origin+'/app/monitor');
  await page.getByLabel('Website URL',{exact:true}).fill('example.com');
  await page.getByRole('button',{name:'Check',exact:true}).click();
  // The test is the runner: it claims over the runner route and answers over the signed result route.
  const job=await waitUntil(async()=>(await claim(f.first)).data.job,'the console queueing the check');
  assert.equal(job.url,'https://example.com/');
  await page.getByText('Checking example.com from owner-network',{exact:false}).waitFor();
  const shape=(name,url,extra={})=>proposal(name.toLowerCase().replace(/\W+/g,'-'),{name,reason:`${name} answered 200.`,checks:['Expects 200','Every minute'],definition:definition({name,url,...extra})});
  const answer=result({input:'https://example.com/',finalUrl:'https://example.com/',requests:9,durationMs:5400,notes:['robots.txt was read on 1 host and honoured for everything except your own URL.'],
   proposals:[shape('Example site','https://example.com/'),{...shape('Example status','https://status.example.com/api/v2/status.json',{assertions:{status:200,json:{path:'status.indicator',equals:'none'}}}),kind:'status-page'},shape('Example dashboard','https://example.com/dashboard')]});
  assert.equal((await post(f.first,job.id,{result:answer})).status,200);
  await page.getByRole('heading',{name:'Proposed monitors'}).waitFor();
  assert.equal(await page.locator('#discovery-status').innerText(),'Checked from owner-network · 9 requests · 5 seconds');
  assert.equal(await page.getByRole('checkbox').evaluateAll(boxes=>boxes.filter(b=>b.checked).length),3,'the runner pre-ticked all three');
  await page.getByRole('checkbox',{name:'Example status'}).uncheck();
  await page.getByRole('button',{name:'Start 2 monitors',exact:true}).waitFor();
  // The visible first-run default is independent of example.com; no extra input is required.
  await page.getByRole('button',{name:'Start 2 monitors',exact:true}).click();
  await page.waitForURL(f.origin+'/app');
  const monitors=(await f.request('/api/overview')).data.monitors;
  assert.deepEqual(monitors.map(m=>m.definition.name).sort(),['Example dashboard','Example site']);
  for(const m of monitors){assert.equal(m.definition.enabled,true);assert.deepEqual(m.definition.assignments['local-a'],{runnerId:f.first.runnerId,networkLabel:'owner-network',canaryUrl:'https://example.org/'})}
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
  assert.equal(finished.status,303);assert.equal(finished.headers.get('location'),`/app/monitor?discovery=${job.id}`);assert.equal((await jobs()).length,1);
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
   assert.ok((await page.text()).includes('name="start_url"'),`${label}: the field is offered`);assert.deepEqual(await jobs(),[]);
   const done=await fetch(g.origin+'/setup',{method:'POST',redirect:'manual',headers:{origin:g.origin,cookie,...(form===undefined?{}:formHeaders)},...(form===undefined?{}:{body:form})});assert.equal(done.status,303,label);
   if(form==='start_url=Example.com%2Fabout'){const all=await jobs();assert.deepEqual(all.map(j=>[j.url,j.status]),[['https://example.com/about','queued']]);assert.equal(done.headers.get('location'),`/app/monitor?discovery=${all[0].id}`)}
   else{assert.equal(done.headers.get('location'),'/app',label);assert.deepEqual(await jobs(),[],`${label}: nothing is queued`)}
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
