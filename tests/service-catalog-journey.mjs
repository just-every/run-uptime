// DEPENDENCY-002 through its public doors: the console's catalog control, the owner API, the real runner reading provider status
// sources at an authorized network edge, the real signed-runner check path, and the real notification delivery path into
// receivers that observe the production wire bytes. Only the providers' status sources, the monitored application and the
// destinations' receivers are substituted.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fixture} from './resilience/support.mjs';
import {browserSignIn} from './auth-test-support.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
import {acceptanceReceiver,verifySlack,loopbackWireTransport} from './notify-acceptance-receivers.mjs';
import {availablePorts} from './notify-acceptance-runtime.mjs';
import {catalogEdge,hosts} from './service-catalog-fixture.mjs';
import {proveCatalogPortability,proveCatalogUpgrade,proveDependencyErasure} from './service-catalog-portability.mjs';
import {proveFullSizeSources} from './service-catalog-sources.mjs';
export const CLAUSE_PROVIDERS=['AWS','Google Cloud','Microsoft Azure','Microsoft 365','Cloudflare','Stripe','PayPal','Square','Shopify','GitHub','Vercel','Netlify','Twilio','SendGrid','Mailgun','Slack','Zoom','Atlassian','OpenAI','Anthropic','Okta','Auth0','DigitalOcean','Fastly'];
const axe=async page=>{
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
 await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
 const found=(await page.evaluate(()=>axe.run(document))).violations.filter(v=>['serious','critical'].includes(v.impact));
 assert.deepEqual(found.map(v=>v.id),[],'no serious accessibility findings');
};
// A changed screen at desktop and phone width: no horizontal overflow and no serious axe finding; pictures only for an evidence folder.
const widths=async(page,name,{evidence,target,full=false})=>{
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  if(evidence){await mkdir(evidence,{recursive:true});await (full?page:target).screenshot({path:join(evidence,`${name}-${width}.png`),...(full?{fullPage:true}:{})})}
  await axe(page);
 }
 await page.setViewportSize({width:1440,height:900});
};
const waitUntil=async(read,label,ms=30000)=>{const until=Date.now()+ms;for(;;){const value=await read();if(value)return value;if(Date.now()>until)throw Error(`${label} did not happen`);await new Promise(r=>setTimeout(r,50))}};
export async function proveServiceCatalog({launch,evidence}){
 const g=await fixture(),edge=await catalogEdge(g.directory),ports=await availablePorts(4),controller=new AbortController();
 // Three contacts on Stripe's route; the fourth is a dead primary whose 400 hands AWS's notice to a fallback contact.
 const urls=['https://hooks-one.example.com/dependency','https://hooks-two.example.com/dependency','https://hooks.slack.com/services/TSYNTH/BSYNTH/synthetic-uptime-1','https://hooks-dead.example.com/dependency'];
 const receivers=[await acceptanceReceiver(ports[0],()=>{}),await acceptanceReceiver(ports[1],()=>{}),await acceptanceReceiver(ports[2],verifySlack),await acceptanceReceiver(ports[3],()=>{})];
 receivers[3].setDisposition('rejected');
 const transport=loopbackWireTransport(new Map(urls.map((url,index)=>[url,{port:ports[index],path:index===2?'/slack':new URL(url).pathname}])));
 const browser=await launch();
 const ok=async(path,body,options={})=>{const response=await g.request(path,{body,...options});assert.ok(response.status<300,`${path} ${response.status} ${JSON.stringify(response.data)}`);return response.data};
 const run=()=>runRunner({origin:g.origin,key:g.first.key,runnerId:g.first.runnerId,localReview:true,once:true,transport,signal:controller.signal});
 const history=async id=>ok(`/api/monitors/${id}/history`);
 // One scheduled check of one monitor through the real runner, with the notification delivery that follows it.
 const check=async id=>{
  await g.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now()-1,id).run();
  const previous=(await history(id)).length;
  for(let i=0;i<6;i++){await run();if((await history(id)).length>previous)break}
  assert.equal((await history(id)).length,previous+1,'a scheduled signed runner completion was accepted');
 };
 const twice=async id=>{await check(id);await check(id)};
 const monitors=async()=>(await ok('/api/overview')).monitors;
 const rows=sql=>g.DB.prepare(sql).all().then(r=>r.results);
 let page,looking,stopLooking;
 // While the owner follows services, the runner is also answering the console's status-source checks.
 const startLooking=()=>{stopLooking=new AbortController();looking=runRunner({origin:g.origin,key:g.first.key,runnerId:g.first.runnerId,localReview:true,transport,signal:stopLooking.signal,pollMs:300})};
 const stopLookingNow=async()=>{stopLooking.abort();await looking};
 try{
  await ok('/api/runners/'+g.second.runnerId,undefined,{method:'DELETE'});
  await ok('/api/external-check',{url:`https://${hosts.canary}/health`});
  // The catalog is searchable by anyone who can name a provider or a component, and covers every provider the clause lists.
  const everyone=await ok('/api/service-catalog');
  for(const name of CLAUSE_PROVIDERS)assert.ok(everyone.entries.some(entry=>entry.name===name),`${name} is in the catalog`);
  assert.deepEqual((await ok('/api/service-catalog?q=stripe')).entries.map(entry=>entry.name),['Stripe']);
  assert.ok((await ok('/api/service-catalog?q=us-east-1%20ec2')).entries.some(entry=>entry.name==='AWS'),'a component and region find the provider');
  for(const entry of everyone.entries){assert.ok(['statuspage','json','feed','paypal','gcp','page'].includes(entry.source.kind));assert.match(entry.source.url,/^https:\/\//)}
  // A provider the current catalog reader cannot follow is named but never followed through the catalog.
  const auth0=(await ok('/api/service-catalog?q=auth0')).entries[0];assert.equal(auth0.followable,false);
  assert.equal((await g.request('/api/service-catalog/checks',{body:{entry:'auth0',scope:'whole'}})).status,400);

  startLooking();
  page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();
  if(process.env.UPTIME_DEBUG){page.on('pageerror',e=>console.error('PAGEERROR',e.message));page.on('console',m=>console.error('CONSOLE',m.type(),m.text()));page.on('response',r=>{if(r.url().includes('/api/'))console.error('RESP',r.status(),r.request().method(),r.url())})}
  await browserSignIn(page,g.origin,{bindings:g.bindings});
  await page.goto(g.origin+'/app/monitors/new');
  const catalog=page.locator('#service-catalog');await catalog.waitFor();
  const search=async text=>{await page.getByLabel('Search providers',{exact:true}).fill(text);await waitUntil(async()=>(await catalog.locator('.catalog-entry').count())===1,`search ${text}`)};
  const entry=name=>catalog.locator('.catalog-entry').filter({has:page.getByRole('heading',{name,exact:true})});
  // Search for Stripe and follow only its API component. The runner reads the status source before anything is followed.
  await search('stripe');
  const stripe=entry('Stripe');
  await stripe.getByLabel('Chosen components',{exact:true}).check();
  await stripe.getByRole('checkbox',{name:'API',exact:true}).check();
  await stripe.getByRole('button',{name:'Follow',exact:true}).click();
  const outcome=stripe.locator('.catalog-feedback[data-state=done], .catalog-feedback[data-state=error]');await outcome.waitFor();assert.equal(await outcome.getAttribute('data-state'),'done',await outcome.innerText());
  const followed=(await monitors()).filter(m=>m.definition.tags?.includes('dependency'));
  assert.equal(followed.length,1);
  const stripeMonitor=followed[0];
  assert.equal(stripeMonitor.definition.service,'Stripe');assert.deepEqual(stripeMonitor.definition.tags,['dependency']);assert.deepEqual(stripeMonitor.definition.catalog,{entry:'stripe',scope:'component',key:'api',ref:null});
  assert.match(stripeMonitor.definition.outcome,/provider.*own claim.*never proof/i);assert.ok(stripeMonitor.definition.outcome.includes(stripeMonitor.definition.url));
  assert.equal(stripeMonitor.definition.assertions.latencyMs,undefined,'the provider’s claim is the only assertion');
  const stripeRow=(await rows('SELECT * FROM followed_services'))[0];
  assert.deepEqual({entry:stripeRow.entry_id,scope:stripeRow.scope,component:stripeRow.component_key,version:stripeRow.catalog_version},{entry:'stripe',scope:'component',component:'api',version:everyone.version});
  assert.ok(Number.isSafeInteger(stripeRow.checked_at),'the follow records when its status source passed the live check');
  assert.ok(edge.requests.some(r=>r.host===hosts.stripe&&r.path==='/current'),'the runner read the status source before following');
  // Then AWS us-east-1 EC2.
  await search('aws us-east-1');
  await entry('AWS').getByLabel('Chosen components',{exact:true}).check();
  await entry('AWS').getByRole('checkbox',{name:'Amazon EC2 · us-east-1',exact:true}).check();
  await entry('AWS').getByRole('button',{name:'Follow',exact:true}).click();
  await entry('AWS').locator('.catalog-feedback[data-state=done]').waitFor();
  const awsMonitor=(await monitors()).find(m=>m.definition.service==='AWS');assert.ok(awsMonitor);
  assert.equal(awsMonitor.definition.type,'http');assert.deepEqual(awsMonitor.definition.catalog,{entry:'aws',scope:'component',key:'ec2-us-east-1',ref:null});assert.equal(awsMonitor.definition.url,'https://status.aws.amazon.com/rss/ec2-us-east-1.rss');
  // A source that fails its live check is marked needs review and is never followed.
  edge.state.slack.mode=503;
  await search('slack');
  await entry('Slack').getByRole('button',{name:'Follow',exact:true}).click();
  await entry('Slack').locator('.catalog-feedback[data-state=error]').waitFor();
  assert.equal((await monitors()).filter(m=>m.definition.service==='Slack').length,0,'a failing source is never adopted');
  assert.equal((await ok('/api/service-catalog?q=slack')).entries[0].review.state,'needs_review');
  await entry('Slack').locator('.catalog-review').waitFor();
  await catalog.scrollIntoViewIfNeeded();await widths(page,'catalog-follow',{evidence,full:true});
  edge.state.slack.mode=200;
  await entry('Slack').getByRole('button',{name:'Follow',exact:true}).click();
  await entry('Slack').locator('.catalog-feedback[data-state=done]').waitFor();
  assert.equal((await ok('/api/service-catalog?q=slack')).entries[0].review,null,'a passing check clears the mark');
  // A provider the catalog cannot follow, or does not list, goes through the website check's reviewed proposal (DEPENDENCY-001).
  await search('auth0');
  await entry('Auth0').getByRole('button',{name:'Add its status page by address',exact:true}).click();
  assert.equal(await page.locator('#discovery-url').inputValue(),'https://status.auth0.com/');
  await page.locator('#catalog-other').click();
  await page.locator('#discovery-url').fill(`https://${hosts.acme}/`);
  await page.locator('#discovery-check').click();
  const overall=page.locator('#discovery-proposals .proposal').filter({hasText:'/api/v2/status.json'});await overall.waitFor();
  for(const pick of await page.locator('#discovery-proposals .proposal-pick').all())if(await pick.isChecked())await pick.uncheck();
  await overall.locator('.proposal-pick').check();
  await page.locator('#discovery-start').click();
  // The editor already sits under /app/monitors/new; the start ends on the started monitor's own page.
  await page.waitForURL(url=>/^\/app\/monitors\/(?!new(?:\/|$))[^/]+\/?$/.test(url.pathname));
  const acme=(await monitors()).find(m=>m.definition.service==='Acme Cloud');
  assert.ok(acme?.definition.tags.includes('dependency')&&acme.definition.url===`https://${hosts.acme}/api/v2/status.json`,'the reviewed proposal adopted the provider’s own status claim');
  assert.equal((await rows(`SELECT monitor_id FROM followed_services WHERE monitor_id='${acme.id}'`)).length,0,'a provider added by address is an ordinary DEPENDENCY-001 monitor, not a catalog follow');

  await stopLookingNow();
  // The owner's chosen route: three contacts, one of them in quiet hours now.
  const contacts=[];
  for(const [index,url] of urls.entries())contacts.push(await ok('/api/notifications/destinations',{name:['Dependency one','Dependency two','Dependency chat','Dead hook'][index],kind:index===2?'slack':'webhook',url}));
  const dead=contacts.pop();
  const timeZone='America/Chicago',time=at=>new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);
  const quietHours={timeZone,start:time(Date.now()-3600000),end:time(Date.now()+3600000)};
  const routeFor=async(id,route)=>{const path=`/api/monitors/${id}/alert-route`,current=await ok(path),body={scope:'monitor',mode:'selected',...route,expectedRevision:current.policies.find(p=>p.scope==='monitor').revision};const preview=await ok(path+'/preview',body);return ok(path+'/apply',{...body,digest:preview.digest})};
  await routeFor(stripeMonitor.id,{destinationIds:contacts.map(c=>c.id),contactSettings:{[contacts[1].id]:{quietHours}}});
  // AWS's route names only the dead hook, with the second contact as its fallback.
  await routeFor(awsMonitor.id,{destinationIds:[dead.id],contactSettings:{},fallback:{destinationIds:[contacts[1].id],deadlineSeconds:120}});
  // Two application monitors, each linked to Stripe only through the owner's link door; AWS is never linked.
  const app=async(name,url)=>ok('/api/monitors',{name,url,intervalMs:60000,retries:0,confirmSlots:2,recoverSlots:2,probes:['local-a'],assignments:{'local-a':g.first.runnerId},service:name});
  const shop=await app('Shop',`https://${hosts.app}/`),portal=await app('Portal',`https://${hosts.app2}/`);
  await ok(`/api/followed-services/${stripeMonitor.id}/links`,{kind:'monitor',target:shop.id,linked:true});
  await ok(`/api/followed-services/${stripeMonitor.id}/links`,{kind:'service',target:'Portal',linked:true});
  for(const id of [shop.id,portal.id])assert.deepEqual((await monitors()).find(m=>m.id===id).definition.dependencies,[stripeMonitor.id]);
  // The applications' own incidents go to nobody here (an explicit empty route), so every message a contact receives is a provider's.
  for(const id of [shop.id,portal.id])await routeFor(id,{destinationIds:[],contactSettings:{}});
  for(const m of [stripeMonitor,awsMonitor,shop,portal]){await twice(m.id);const state=(await ok('/api/overview')).monitors.find(x=>x.id===m.id).state.state;assert.equal(state,'Healthy',m.definition.name)}
  const snapshot=async id=>({monitor:await g.DB.prepare('SELECT * FROM monitors WHERE id=?').bind(id).first(),history:await history(id),revisions:await rows(`SELECT * FROM revisions WHERE monitor_id='${id}' ORDER BY revision`)});
  const outbox=id=>rows(`SELECT kind,id FROM outbox WHERE monitor_id='${id}' ORDER BY rowid`);
  const shopBefore=await snapshot(shop.id);

  // A Stripe API incident at the status-source edge: a dependency notice reaches every contact on the route, no Uptime incident opens.
  edge.state.stripe.statuses.api='degraded';
  await twice(stripeMonitor.id);
  assert.equal((await ok('/api/overview')).monitors.find(m=>m.id===stripeMonitor.id).state.state,'Failing','the provider monitor states the provider’s claim');
  assert.deepEqual((await outbox(stripeMonitor.id)).map(r=>r.kind),['dependency'],'one dependency notice, no incident trigger');
  assert.equal((await rows("SELECT id FROM outbox WHERE kind='trigger'")).length,0,'no Uptime incident opens anywhere');
  for(let i=0;i<4;i++)await run();
  // The chat contact is on Stripe's route only, and the applications notify nobody, so everything it receives is a Stripe dependency notice.
  const dependencyRecords=index=>index===2?receivers[2].records:receivers[index].records.filter(r=>r.body.eventType?.startsWith('uptime.dependency'));
  const delivered=index=>dependencyRecords(index).length;
  assert.equal(delivered(0),1,'the first contact received the notice once');assert.equal(delivered(2),1,'the chat contact received the notice once');
  const wire=receivers[0].records[0].body;assert.equal(wire.eventType,'uptime.dependency.firing');assert.equal(wire.dependency.provider,'Stripe');assert.equal(wire.dependency.component,'API');assert.equal(wire.dependency.stated,'degraded');assert.equal(wire.dependency.source,'https://status.stripe.com/current');
  assert.ok(receivers[2].records[0].body.blocks.map(block=>block.text?.text??'').join('\n').includes('Stripe'),'the chat contact received Stripe\u2019s notice');
  const jobs=await ok('/api/notifications');
  const stripeJobs=jobs.deliveries.filter(d=>d.event.monitorId===stripeMonitor.id);
  assert.deepEqual(stripeJobs.map(d=>d.destinationId).sort(),contacts.map(c=>c.id).sort(),'every contact the route delivers to has the notice');
  const held=stripeJobs.find(d=>d.destinationId===contacts[1].id);assert.equal(held.state,'queued');assert.equal(held.code,'waiting_for_contact_quiet');assert.equal(delivered(1),0,'the contact in quiet hours is held');
  assert.deepEqual(await snapshot(shop.id),shopBefore,'the application monitor’s state, revisions and evidence are unchanged');
  // A second provider's notice that overlaps in time but is linked to nothing.
  edge.state.aws.items=['Service disruption: Increased Error Rates'];
  await twice(awsMonitor.id);
  assert.deepEqual((await outbox(awsMonitor.id)).map(r=>r.kind),['dependency']);

  // The applications fail while both providers state an issue. The incident view shows each provider by time overlap.
  edge.state.app=503;edge.state.app2=503;
  await twice(shop.id);await twice(portal.id);
  const incidents=await ok(`/api/monitors/${shop.id}/incidents`),incidentId=incidents[0].id;
  const detail=await ok(`/api/incidents/${incidentId}`);
  assert.deepEqual(detail.dependencies.linked.map(n=>n.provider+' '+n.component),['Stripe API']);
  assert.deepEqual(detail.dependencies.coincident.map(n=>n.provider),['AWS']);
  assert.equal(detail.dependencies.group.length,1,'the other application linked to the same notice is in the group');
  const portalIncident=(await ok(`/api/monitors/${portal.id}/incidents`))[0].id;
  // The incident view: Stripe linked and grouped, AWS coincident in time and outside the group.
  await page.goto(g.origin+'/app/monitors/'+encodeURIComponent(shop.id));
  await page.locator(`button[data-incident-work="${incidentId}"]`).click();
  const dialog=page.locator('#incident-work-dialog'),context=dialog.locator('[data-dependency-context]');await context.waitFor();
  const shown=await context.locator('li[data-key]').evaluateAll(items=>items.map(item=>[item.dataset.key.split('-')[0],item.querySelector('strong')?.textContent.split(' · ')[0]]));
  assert.deepEqual(shown,[['dependency','Stripe'],['coincident','AWS']],'the linked provider is in the group; the unlinked one is listed apart as coincident');
  await widths(page,'incident-dependencies',{evidence,target:context});
  await dialog.locator('[data-close-incident]').click();
  // Grouped acknowledgment: the linked notice and the other linked incident are acknowledged with this one, the unlinked notice is not.
  await ok(`/api/incidents/${incidentId}/actions`,{kind:'acknowledge',version:detail.version});
  const after=await ok(`/api/incidents/${incidentId}`);assert.equal(after.status,'acknowledged');
  assert.ok(after.dependencies.linked.every(n=>n.acknowledgedAt!==null),'the linked provider notice is acknowledged in the group');
  assert.ok(after.dependencies.coincident.every(n=>n.acknowledgedAt===null),'an unlinked overlap never groups acknowledgment');
  assert.equal((await ok(`/api/incidents/${portalIncident}`)).status,'acknowledged','the other linked incident is acknowledged with the group');

  // The status source stops answering, moves, then stops parsing as the expected shape: Unknown, never operational, and flagged for review.
  const noticesBefore=(await rows("SELECT id FROM outbox WHERE kind LIKE 'dependency%'")).length;
  for(const mode of [503,'drop','dns','refused','timeout','moved','shape']){
   edge.state.stripe.mode=mode;await twice(stripeMonitor.id);
   const state=(await ok('/api/overview')).monitors.find(m=>m.id===stripeMonitor.id).state;
   assert.equal(state.state,'Unknown',`status source ${mode}`);
   const view=(await ok('/api/service-catalog')).followed.find(f=>f.monitorId===stripeMonitor.id);
   assert.equal(view.review.state,'needs_review',`status source ${mode} needs review`);assert.equal(view.sourceState,'unknown');
   assert.equal((await ok('/api/service-catalog?q=stripe')).entries[0].review.state,'needs_review');
   if(mode==='moved'){
    await page.goto(g.origin+'/app/monitors/new');await search('stripe');await page.locator('.catalog-review').first().waitFor();
    await widths(page,'catalog-moved',{evidence,full:true});
    await page.goto(g.origin+'/app/monitors/'+encodeURIComponent(stripeMonitor.id));await page.locator('.followed-review').waitFor();
    await page.locator('[data-review-followed]').focus();assert.equal(await page.locator('[data-review-followed]').evaluate(e=>e===document.activeElement),true,'review is keyboard reachable');
    await widths(page,'followed-moved',{evidence,full:true});
   }
  }
  assert.equal((await rows("SELECT id FROM outbox WHERE kind LIKE 'dependency%'")).length,noticesBefore,'an unreadable source states nothing, so it sends no notice');
  await page.goto(g.origin+'/app/monitors/'+encodeURIComponent(stripeMonitor.id));
  await page.locator('.followed-panel .followed-review').waitFor();
  await widths(page,'followed-unknown',{evidence,target:page.locator('.followed-panel')});
  // The provider recovers: the source answers again, the claim is operational, and one recovery notice goes out.
  edge.state.stripe.mode=200;edge.state.stripe.statuses.api='up';
  await twice(stripeMonitor.id);
  assert.equal((await ok('/api/overview')).monitors.find(m=>m.id===stripeMonitor.id).state.state,'Healthy');
  assert.deepEqual((await outbox(stripeMonitor.id)).map(r=>r.kind),['dependency','dependency_recovery'],'one recovery notice');
  for(let i=0;i<4;i++)await run();
  assert.equal(delivered(0),2,'Stripe’s notice and its recovery, each once');assert.equal(delivered(2),2);
  assert.deepEqual(dependencyRecords(0).map(r=>r.body.eventType),['uptime.dependency.firing','uptime.dependency.recovered']);
  // Quiet hours held Stripe's notice and recovery for the second contact; it received only AWS's notice, as the fallback of the dead hook.
  assert.equal(receivers[3].records.length,1,'the dead primary was tried once');
  assert.deepEqual(dependencyRecords(1).map(r=>[r.body.dependency.provider,r.body.fallbackContext?.previous?.[0]?.destinationId]),[['AWS',dead.id]]);
  assert.equal((await ok('/api/service-catalog')).followed.find(f=>f.monitorId===stripeMonitor.id).review.state,'needs_review','recovery retains the mark until owner review');
  await page.goto(g.origin+'/app/monitors/'+encodeURIComponent(stripeMonitor.id));startLooking();
  await page.locator('[data-review-followed]').click();await page.locator('.followed-review').waitFor({state:'detached'});await stopLookingNow();
  assert.equal((await ok('/api/service-catalog')).followed.find(f=>f.monitorId===stripeMonitor.id).review.state,'ok','a successful owner review clears the mark');
  assert.ok(edge.requests.every(r=>['GET','HEAD'].includes(r.method)),'only read requests reached any status source');
  await page.goto(g.origin+'/app/monitors/'+encodeURIComponent(stripeMonitor.id));
  await page.locator('.followed-notices').waitFor();
  assert.deepEqual(await page.locator('.followed-panel [data-unlink-monitor]').evaluateAll(buttons=>buttons.map(button=>button.dataset.unlinkMonitor).sort()),[shop.id,portal.id].sort(),'the followed service lists the monitors linked to it');
  await widths(page,'followed-notices',{evidence,target:page.locator('.followed-panel')});
  const fullSize=await proveFullSizeSources({g,edge,page,catalog,search,entry,ok,rows,monitors,routeFor,check,twice,run,contact:contacts[0],receiver:receivers[0],widths,evidence,startLooking,stopLookingNow,snapshot});
  for(const receiver of receivers)receiver.assertValid();
  await proveCatalogPortability({g,ids:{stripe:stripeMonitor.id,shop:shop.id},urls,followed:3+fullSize});
  await proveCatalogUpgrade();
 }finally{
  controller.abort();if(stopLooking&&!stopLooking.signal.aborted)await stopLookingNow();
  await browser.close();for(const receiver of receivers)await receiver.close();await edge.close();await g.close();
 }
 await proveDependencyErasure();
}
