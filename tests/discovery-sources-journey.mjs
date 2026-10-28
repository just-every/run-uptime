// DISCOVERY-001 through its public doors: the console's sources panel and the owner API authorize, run and review; the real
// runner reads each source read-only with its runner-local credential; proposals are adopted through the monitor door. The domain,
// robots/sitemap and OpenAPI sources run against controlled real endpoints (a real DNS listener and HTTPS listener); the six
// provider accounts are fakes of their documented API shapes at the network edge. Only those edges are substituted.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './resilience/support.mjs';
import {browserSignIn} from './auth-test-support.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
import {providerCall} from '../runners/src/discovery/sources/provider-http.mjs';
import {DOMAIN,PROVIDER_HOSTS,SECRETS,sourcesEdge} from './discovery-sources-fixture.mjs';
import {proveDiscoveryPortability,proveDiscoveryUpgrade} from './discovery-sources-portability.mjs';
const host=label=>label?`${label}.${DOMAIN}`:DOMAIN;
const axe=async page=>{
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
 await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
 const found=(await page.evaluate(()=>axe.run(document))).violations.filter(v=>['serious','critical'].includes(v.impact));
 assert.deepEqual(found.map(v=>v.id),[],'no serious accessibility findings');
};
// A screen at desktop and phone width: no overflow and no serious axe finding; pictures only for an evidence folder.
const widths=async(page,name,{evidence,target})=>{
 for(const width of [1440]){
  await page.setViewportSize({width,height:1000});await target.scrollIntoViewIfNeeded();
  if(evidence){await mkdir(evidence,{recursive:true});await target.screenshot({path:join(evidence,`${name}-${width}.png`)})}
  await axe(page);
 }
 await page.setViewportSize({width:1440,height:900});
};
const waitUntil=async(read,label,ms=60000)=>{const until=Date.now()+ms;for(;;){const value=await read();if(value)return value;if(Date.now()>until)throw Error(`${label} did not happen`);await new Promise(r=>setTimeout(r,100))}};
export async function proveDiscoverySources({launch,evidence}){
 const g=await fixture(),edge=await sourcesEdge(g.directory),credentials=await mkdtemp(join(tmpdir(),'uptime-provider-credentials-')),browser=await launch();
 const previousDirectory=process.env.UPTIME_CREDENTIAL_DIR;process.env.UPTIME_CREDENTIAL_DIR=credentials;
 const ok=async(path,body,options={})=>{const response=await g.request(path,{body,...options});assert.ok(response.status<300,`${path} ${response.status} ${JSON.stringify(response.data)}`);return response.data};
 const rows=sql=>g.DB.prepare(sql).all().then(r=>r.results);
 const count=async table=>Number((await g.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n);
 const credential=(ref,value)=>writeFile(join(credentials,`provider-${ref}.json`),JSON.stringify(value),{mode:0o600});
 let looking;const stop=new AbortController();
 try{
  await ok('/api/runners/'+g.second.runnerId,undefined,{method:'DELETE'});
  await ok('/api/external-check',{url:`https://${host('canary')}/`});
  // An existing monitor of the site, so a proposal of the same address is shown as a duplicate.
  const existing=await ok('/api/monitors',{name:'Synthetic home',url:`https://${host('www')}/`,intervalMs:60000,probes:['local-a'],assignments:{'local-a':g.first.runnerId},enabled:false});
  // The runner answers source runs (and runs adopted monitors) in the background, reading credentials from its own folder.
  looking=runRunner({origin:g.origin,key:g.first.key,runnerId:g.first.runnerId,localReview:true,signal:stop.signal,pollMs:300});

  // The owner door refuses an anonymous caller and another origin, and nothing durable changes. (Members: tests/access-matrix.mjs.)
  const body=JSON.stringify({kind:'domain',label:'Refused',identifiers:{domain:DOMAIN}});
  assert.equal((await fetch(g.origin+'/api/discovery-sources',{method:'POST',headers:{'content-type':'application/json',origin:g.origin},body})).status,401);
  assert.equal((await fetch(g.origin+'/api/discovery-sources',{method:'POST',headers:{'content-type':'application/json',origin:'https://attacker.example.test',cookie:g.cookie},body})).status,403);
  assert.equal(await count('discovery_sources'),0,'refused requests authorize nothing');

  // The console: empty, then a refused (private) address, then the domain authorized, run and reviewed.
  const page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();
  await browserSignIn(page,g.origin,{bindings:g.bindings});
  await page.goto(g.origin+'/app/monitors/new');
  const panel=page.locator('#discovery-sources');await panel.locator('#sources-empty').waitFor();
  await widths(page,'sources-empty',{evidence,target:panel});
  await panel.getByLabel('Source',{exact:true}).selectOption('website-files');
  await panel.getByLabel('Name',{exact:true}).fill('Private site');
  await panel.getByLabel('Site address',{exact:true}).fill('http://10.0.0.5/');
  await panel.getByRole('button',{name:'Authorize',exact:true}).click();
  await panel.locator('#source-feedback[data-state=error]').waitFor();
  assert.equal(await count('discovery_sources'),0,'a private address is refused and authorizes nothing');
  await widths(page,'sources-denied',{evidence,target:panel});
  await panel.getByLabel('Source',{exact:true}).selectOption('domain');
  await panel.getByLabel('Name',{exact:true}).fill('Synthetic domain');
  await panel.getByLabel('Domain',{exact:true}).fill(DOMAIN);
  await panel.getByRole('button',{name:'Authorize',exact:true}).click();
  const domainRow=panel.locator('.sources-item').filter({hasText:'Synthetic domain'});await domainRow.waitFor();
  const [domainSource]=await rows('SELECT * FROM discovery_sources');
  assert.deepEqual(JSON.parse(domainSource.identifiers),{domain:DOMAIN});assert.equal(domainSource.state,'active');assert.ok(domainSource.authorized_by);
  await domainRow.getByRole('button',{name:'Run discovery',exact:true}).click();
  const review=panel.locator('#source-review');await review.locator('.source-proposal').first().waitFor({timeout:60000});
  // Real DNS: the runner's lookups reached the controlled DNS listener, and a host with a private address was never contacted.
  assert.ok(edge.queries.some(q=>q.name===host('www')&&q.type==='A')&&edge.queries.some(q=>q.name===host('api')),'the domain source made real DNS lookups');
  assert.ok(!edge.requests.some(r=>r.host===host('status')),'a private host is refused before any request');

  // Every other kind through the owner API, with its runner-local credential reference.
  const zoneId=edge.providers.zoneId,authorize=(kind,label,identifiers)=>ok('/api/discovery-sources',{kind,label,identifiers});
  await credential('dns-cf',{provider:'cloudflare',zoneId,token:'synthetic-uptime-21'});
  await credential('dns-r53',{provider:'route53',zoneId:edge.providers.hostedZone,accessKeyId:'synthetic-uptime-22',secretAccessKey:'synthetic-uptime-22-secret'});
  await credential('gh',{provider:'github',owner:'synthetic-uptime',repo:'shop',token:'synthetic-uptime-23'});
  await credential('vercel',{provider:'vercel',projectId:'prj_synthetic_uptime',token:'synthetic-uptime-24'});
  await credential('deploy',{provider:'codedeploy',application:'synthetic-uptime-shop',region:'us-east-1',accessKeyId:'synthetic-uptime-27',secretAccessKey:'synthetic-uptime-27-secret'});
  const sources={domain:domainSource.id,
   sitemap:(await authorize('website-files','Synthetic sitemap',{origin:`https://${host('www')}`})).id,
   spec:(await authorize('openapi','Synthetic API',{url:`https://${host('api')}/openapi.json`})).id,
   cloudflare:(await authorize('cloudflare','Cloudflare zone',{zoneId,domain:DOMAIN,credentialRef:'dns-cf'})).id,
   route53:(await authorize('route53','Route 53 zone',{zoneId:edge.providers.hostedZone,domain:DOMAIN,credentialRef:'dns-r53'})).id,
   github:(await authorize('github-actions','GitHub deployments',{owner:'synthetic-uptime',repo:'shop',credentialRef:'gh'})).id,
   vercel:(await authorize('vercel','Vercel deployments',{projectId:'prj_synthetic_uptime',credentialRef:'vercel'})).id,
   netlify:(await authorize('netlify','Netlify deploys',{siteId:'synthetic-uptime-site',credentialRef:'netlify'})).id,
   codedeploy:(await authorize('codedeploy','CodeDeploy shop',{application:'synthetic-uptime-shop',deploymentGroup:'production',region:'us-east-1',siteUrl:`https://${host('shop')}`,credentialRef:'deploy'})).id};
  const run=async id=>{
   const {id:job}=await ok(`/api/discovery-sources/${id}/runs`,{});
   return waitUntil(async()=>{const read=await ok(`/api/discoveries/${job}`);return ['done','failed','expired'].includes(read.status)&&read},`run of ${id}`);
  };
  const reviewOf=async id=>(await ok(`/api/discovery-sources/${id}`)).review;
  // Netlify's credential is not on the runner yet: the run fails with a plain reason and the console shows it.
  const failed=await run(sources.netlify);assert.equal(failed.status,'failed');assert.match(failed.error,/provider-netlify\.json/);
  assert.equal((await rows(`SELECT status FROM discovery_source_runs WHERE source_id='${sources.netlify}'`))[0].status,'failed');
  await page.reload();await panel.locator('.sources-failure').first().waitFor();
  await widths(page,'sources-failure',{evidence,target:panel.locator('.sources-item').filter({hasText:'Netlify deploys'})});
  await credential('netlify',{provider:'netlify',siteId:'synthetic-uptime-site',token:'synthetic-uptime-25'});
  for(const [name,id] of Object.entries(sources))if(name!=='domain')assert.equal((await run(id)).status,'done',`${name} run`);

  // Each run's proposals carry provenance, the intended outcome, duplicates, traffic and cost (Unknown, never blank), locations and credential needs.
  const first={};for(const [name,id] of Object.entries(sources))first[name]=await reviewOf(id);
  const urls=name=>first[name].proposals.filter(p=>!p.refused&&['page','api','host','spec'].includes(p.kind)).map(p=>p.url).sort();
  assert.deepEqual(urls('domain'),[`https://${host('')}/`,`https://${host('api')}/`,`https://${host('app')}/`,`https://${host('docs')}/`,`https://${host('shop')}/`,`https://${host('blog')}/`,`https://${host('www')}/`].sort());
  assert.deepEqual(urls('sitemap'),[`https://${host('www')}/`,`https://${host('www')}/checkout`,`https://${host('www')}/pricing`].sort());
  assert.deepEqual(urls('spec'),[`https://${host('api')}/openapi.json`,`https://${host('api')}/v1/health`,`https://${host('api')}/v1/orders`].sort());
  assert.deepEqual(urls('cloudflare'),[`https://${host('api')}/`,`https://${host('www')}/`].sort());
  assert.ok(!first.cloudflare.proposals.some(p=>p.kind==='dns'&&p.url===`https://${host('www')}/`),'a proxied Cloudflare name never proposes its hidden origin as a public DNS answer, including mixed proxy flags');
  assert.ok(first.cloudflare.proposals.some(p=>p.kind==='dns'&&p.url===`https://${host('api')}/`),'a DNS-only Cloudflare record still proposes its published answer');
  assert.deepEqual(urls('route53'),[`https://${host('shop')}/`]);
  assert.deepEqual(urls('github'),[`https://${host('app')}/`]);
  assert.deepEqual(urls('vercel'),[`https://${host('web')}/`]);
  assert.deepEqual(urls('netlify'),[`https://${host('docs')}/`]);
  assert.deepEqual(urls('codedeploy'),[`https://${host('shop')}/`]);
  const all=Object.values(first).flatMap(view=>view.proposals);
  for(const proposal of all.filter(p=>!p.refused)){
   assert.ok(proposal.identifier&&Number.isSafeInteger(proposal.seenAt)&&proposal.outcome&&proposal.credentials&&proposal.locations.length===1,'provenance, outcome, credential needs and locations');
   assert.ok(Array.isArray(proposal.duplicates.monitors)&&Array.isArray(proposal.duplicates.proposals),'duplicates against monitors and other proposals');
   assert.ok(proposal.traffic.perDay>0&&proposal.traffic.perMonth===proposal.traffic.perDay*30,'expected traffic');
   assert.equal(proposal.cost.state,'unknown');assert.equal(proposal.cost.usd,null);assert.ok(proposal.cost.reason,'cost is Unknown with its reason, never blank or invented');
  }
  assert.ok(all.some(p=>p.kind==='tls')&&all.some(p=>p.kind==='dns')&&all.some(p=>p.kind==='api')&&all.some(p=>p.kind==='host'),'HTTP, API and protocol proposals');
  const browserProposal=all.find(p=>p.kind==='browser');assert.ok(browserProposal,'a browser proposal');assert.equal(browserProposal.cost.browserMinutes.state,'unknown','browser-minutes are Unknown too');
  assert.ok(first.spec.proposals.find(p=>p.url.endsWith('/v1/orders')).credentials.includes('API-002'),'an API route that wants a key names the credential it needs');
  const wwwOf=name=>first[name].proposals.find(p=>p.kind==='host'&&p.url===`https://${host('www')}/`);
  assert.deepEqual(wwwOf('domain').duplicates.monitors.map(m=>m.id),[existing.id],'a proposal of a monitored address names that monitor');
  assert.ok(wwwOf('domain').duplicates.proposals.some(p=>p.sourceId===sources.cloudflare),'and the other source that proposes it');
  for(const name of ['domain','cloudflare']){const refused=first[name].proposals.find(p=>p.url===`https://${host('status')}/`);assert.ok(refused?.refused?.includes('private'),`${name}: a private host is refused with the plain message`)}
  // The populated list, then the domain's proposals opened for review.
  await page.reload();await panel.locator('.sources-item').filter({hasText:'CodeDeploy shop'}).waitFor();
  await widths(page,'sources-populated',{evidence,target:panel.locator('#sources-list')});
  await panel.locator('.sources-item').filter({hasText:'Cloudflare zone'}).getByRole('button',{name:'Review proposals',exact:true}).click();
  await review.locator('.source-proposal[data-key]').first().waitFor();
  await widths(page,'sources-cloudflare-proxy',{evidence,target:review});
  await panel.locator('.sources-item').filter({hasText:'Synthetic domain'}).getByRole('button',{name:'Review proposals',exact:true}).click();
  await review.locator('.source-proposal[data-key]').first().waitFor();
  await widths(page,'sources-review',{evidence,target:review});

  // Review: reject one proposal of every source; adopt three through the monitor door (one from the console).
  for(const [name,id] of Object.entries(sources)){const target=first[name].proposals.find(p=>!p.refused&&p.kind!=='host'&&!p.duplicates.monitors.length)??first[name].proposals.find(p=>!p.refused&&!p.url.includes('/checkout')&&!p.url.includes(host('docs'))&&!p.url.includes(host('app')));
   if(target)await ok(`/api/discovery-sources/${id}/decisions`,{key:target.key,decision:'rejected'})}
  await page.goto(g.origin+'/app/monitors/new');
  await panel.locator('.sources-item').filter({hasText:'Synthetic domain'}).getByRole('button',{name:'Review proposals',exact:true}).click();
  const docs=first.domain.proposals.find(p=>p.kind==='host'&&p.url===`https://${host('docs')}/`);
  await review.locator(`[data-adopt="${docs.key}"]`).check();
  await review.getByRole('button',{name:'Start 1 monitor',exact:true}).click();
  await waitUntil(async()=>(await rows(`SELECT decision FROM discovery_decisions WHERE candidate_key='${docs.key}'`))[0]?.decision==='adopted','console adoption');
  const adopt=async(name,proposal)=>{const saved=await ok('/api/monitors',{...proposal.definition,probes:['local-a'],assignments:{'local-a':{runnerId:g.first.runnerId}}});await ok(`/api/discovery-sources/${sources[name]}/decisions`,{key:proposal.key,decision:'adopted',monitorId:saved.id});return saved.id};
  const checkout=await adopt('sitemap',first.sitemap.proposals.find(p=>p.url.endsWith('/checkout')));
  const app=await adopt('github',first.github.proposals.find(p=>p.kind==='host'));
  const adopted=new Set([checkout,app,...(await rows("SELECT monitor_id FROM discovery_decisions WHERE decision='adopted'")).map(r=>r.monitor_id)]);
  assert.equal(adopted.size,3);
  assert.equal(await count('discovery_decisions'),Object.keys(sources).length+3,'one rejection per source and three adoptions');

  // Rediscovery: each source changes, and a second owner-started run is compared with the previous run and the current monitors.
  delete edge.zone[host('docs')];edge.zone[host('dashboard')]={A:['93.184.216.50']};
  edge.site.sitemap=['/','/pricing','/signup'];edge.site.spec['/status']=false;
  edge.providers.cloudflare=edge.providers.cloudflare.filter(r=>r.name!==host('api'));edge.providers.cloudflare.push({type:'A',name:host('cdn'),content:'93.184.216.50'});
  edge.providers.route53.push({type:'A',name:host('blog'),values:['93.184.216.50']});
  edge.providers.github.push({id:9002,created_at:new Date().toISOString(),environment:'preview',url:host('preview')});
  edge.site.down.add(host('docs'));
  edge.providers.codedeploy.deployments.push({id:'d-SYNTHETIC2',createTime:Date.now()/1000});
  const providerRequests=()=>edge.requests.filter(r=>PROVIDER_HOSTS.includes(r.host)).length,beforeSecond=providerRequests();
  for(const [name,id] of Object.entries(sources))assert.equal((await run(id)).status,'done',`${name} rediscovery`);
  const second={};for(const [name,id] of Object.entries(sources))second[name]=await reviewOf(id);
  const changed=(name,change)=>second[name].proposals.filter(p=>!p.refused&&p.change===change&&['page','api','host'].includes(p.kind)).map(p=>p.url).sort();
  const removed=name=>second[name].removed.filter(r=>['page','api','host'].includes(r.kind)).map(r=>[r.url,r.monitors.map(m=>m.id)]);
  assert.deepEqual(changed('domain','new'),[`https://${host('dashboard')}/`]);assert.deepEqual(removed('domain'),[[`https://${host('docs')}/`,[...adopted].filter(id=>id!==checkout&&id!==app)]],'a removed host names the adopted monitor that still checks it');
  assert.deepEqual(changed('sitemap','new'),[`https://${host('www')}/signup`]);assert.deepEqual(removed('sitemap'),[[`https://${host('www')}/checkout`,[checkout]]]);
  assert.deepEqual(changed('spec','new'),[`https://${host('api')}/v1/status`]);
  assert.deepEqual(changed('cloudflare','new'),[`https://${host('cdn')}/`]);assert.deepEqual(removed('cloudflare'),[[`https://${host('api')}/`,[]]]);
  assert.deepEqual(changed('route53','new'),[`https://${host('blog')}/`]);
  assert.deepEqual(changed('github','new'),[`https://${host('preview')}/`]);assert.deepEqual(changed('github','unchanged'),[`https://${host('app')}/`],'a site an earlier deployment named is read again');
  assert.deepEqual(changed('vercel','unchanged'),[`https://${host('web')}/`]);
  assert.deepEqual(removed('netlify'),[[`https://${host('docs')}/`,[...adopted].filter(id=>id!==checkout&&id!==app)]],'a deployed site that stopped answering is removed, for review');
  assert.equal(second.netlify.removed[0].answered,false);
  // Deploy adapters ask only for events since the previous run.
  const later=edge.requests.slice(-1000).filter(r=>PROVIDER_HOSTS.includes(r.host));
  assert.ok(providerRequests()>beforeSecond);
  assert.ok(later.some(r=>r.host==='api.github.com'&&r.path.endsWith('/actions/runs')&&decodeURIComponent(r.query).includes('created=>=')),'GitHub workflow runs since the last run');
  assert.ok(later.some(r=>r.host==='api.vercel.com'&&r.path==='/v6/deployments'&&/since=\d+/.test(r.query)),'Vercel deployments since the last run');
  assert.ok(edge.providers.codedeploy.since.some(value=>value!==null),'CodeDeploy deployments since the last run');
  // Nothing was paused, archived or deleted by rediscovery.
  for(const id of adopted)assert.ok((await rows(`SELECT id FROM monitors WHERE id='${id}'`)).length===1);

  // Read-only: every provider request was a documented read with its own credential, and a mutating call is refused before it is sent.
  for(const request of edge.requests.filter(r=>PROVIDER_HOSTS.includes(r.host))){
   assert.ok(request.credentialOk,`${request.host} saw its own credential`);
   assert.ok(request.method==='GET'||(request.method==='POST'&&['CodeDeploy_20141006.ListDeployments','CodeDeploy_20141006.BatchGetDeployments'].includes(request.target)),`${request.method} ${request.host}${request.path} is a read`);
  }
  const sent=edge.requests.length,signal=AbortSignal.timeout(10000);
  await assert.rejects(providerCall({provider:'cloudflare',method:'DELETE',url:`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/r0`,signal}),/Refused before sending/);
  await assert.rejects(providerCall({provider:'codedeploy',method:'POST',url:'https://codedeploy.us-east-1.amazonaws.com/',headers:{'x-amz-target':'CodeDeploy_20141006.CreateDeployment'},body:'{}',signal}),/Refused before sending/);
  const repository=['synthetic-uptime','shop'].join('/');
  await assert.rejects(providerCall({provider:'github',method:'POST',url:`https://api.github.com/repos/${repository}/deployments`,body:'{}',signal}),/Refused before sending/);
  assert.equal(edge.requests.length,sent,'a refused call reaches no provider');
  assert.ok(edge.requests.filter(r=>!PROVIDER_HOSTS.includes(r.host)).every(r=>['GET','HEAD'].includes(r.method)),'only GET and HEAD reached the owner’s own sites');

  // Only adopted monitors run: after more runner passes, slots and evidence exist only for them (and the paused monitor has none).
  await waitUntil(async()=>(await rows('SELECT DISTINCT monitor_id FROM slots')).length>=1,'an adopted monitor runs',60000);
  for(const table of ['slots','outbox'])for(const row of await rows(`SELECT DISTINCT monitor_id FROM ${table}`))assert.ok(adopted.has(row.monitor_id),`${table}: only adopted monitors`);
  for(const row of await rows('SELECT DISTINCT s.monitor_id FROM observations o JOIN slots s ON s.id=o.slot_id'))assert.ok(adopted.has(row.monitor_id),'observations: only adopted monitors');
  assert.equal((await rows(`SELECT id FROM monitors`)).length,adopted.size+1,'runs, proposals and rejections create no monitor');
  assert.equal(await count('notification_jobs'),0,'and send nothing');

  // No provider credential is held by the Worker: not in its database, archive, definition export or rendered console.
  const tables=(await rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")).map(r=>r.name),everything=[];
  for(const table of tables)everything.push(JSON.stringify(await rows(`SELECT * FROM "${table}"`)));
  const archive=await ok('/api/archive'),definitions=await ok('/api/definitions/export');
  await page.goto(g.origin+'/app/monitors/new');await panel.locator('.sources-item').first().waitFor();
  for(const [label,text] of [['database',everything.join('\n')],['archive',JSON.stringify(archive)],['definition export',JSON.stringify(definitions)],['console',await page.content()]])
   for(const secret of SECRETS)assert.ok(!text.includes(secret),`${label} holds no provider credential`);

  // Revocation removes the authorization with its runs and decisions; adopted monitors stay.
  await ok(`/api/discovery-sources/${sources.vercel}`,undefined,{method:'DELETE'});
  for(const table of ['discovery_sources WHERE id','discovery_source_runs WHERE source_id','discovery_decisions WHERE source_id'])assert.equal((await rows(`SELECT * FROM ${table}='${sources.vercel}'`)).length,0,table);
  assert.equal((await g.request(`/api/discovery-sources/${sources.vercel}/runs`,{body:{}})).status,404);
  assert.ok((await rows("SELECT action FROM uptime_audit WHERE action='discovery_source_revoke'")).length===1,'revocation is audited');
  await proveDiscoveryPortability({g,archive:await ok('/api/archive'),erase:checkout,ok});
  await proveDiscoveryUpgrade();
 }finally{
  stop.abort();await looking;if(previousDirectory===undefined)delete process.env.UPTIME_CREDENTIAL_DIR;else process.env.UPTIME_CREDENTIAL_DIR=previousDirectory;
  await browser.close();await edge.close();await g.close();await rm(credentials,{recursive:true,force:true});
 }
}
