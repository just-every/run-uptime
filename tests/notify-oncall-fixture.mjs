import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {fixture,closeServer} from './resilience/support.mjs';
import {loopbackWireTransport} from './notify-acceptance-receivers.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {availablePorts,migratedWorker,ownerAPI} from './notify-acceptance-runtime.mjs';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
const require=createRequire(import.meta.url);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));

const WIDTHS=[1440,390];
const UNKNOWN_ACK='Unknown · no valid Oncall receipt',UNKNOWN_OTHER="Unknown · Oncall doesn't report it";
// The owner's console for this journey (Settings › Alerts), signed in with a fresh second factor. Screenshots and notes are kept
// only when UPTIME_ONCALL_EVIDENCE names a folder; nothing captured shows the token, endpoint or a signing secret.
async function openConsole(f){
 const browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1600}}),page=await context.newPage(),evidence=process.env.UPTIME_ONCALL_EVIDENCE;
  await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort());
  await browserSignIn(page,f.origin,{bindings:f.bindings});
  const ui={browser,page,
   async width(width){await page.setViewportSize({width,height:width>480?1600:2400})},
   // The page is loaded once and then left to the console's own five-second refresh: the public asset limiter is per minute.
   async alerts(){
    if(!await page.evaluate(()=>location.pathname==='/app/settings/alerts'&&document.documentElement.classList.contains('signed-in')))await page.goto(f.origin+'/app/settings/alerts');
    await page.locator('html.signed-in').waitFor({timeout:60000});await page.locator('#sent-alerts-heading').waitFor()
   },
   async reload(){await page.reload();await page.locator('html.signed-in').waitFor({timeout:60000});await page.locator('#sent-alerts-heading').waitFor()},
   // Axe, reflow and the smallest rendered text size inside one scope (a dialog or an opened row), kept as evidence on request.
   async audit(scope,name,width){
    if(!await page.evaluate(()=>typeof axe!=='undefined'))await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    const result=await scope.evaluate(async node=>{
     const fonts=[...node.querySelectorAll('*'),node].filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&el.getClientRects().length).map(el=>parseFloat(getComputedStyle(el).fontSize));
     return {violations:(await axe.run(document)).violations.map(v=>v.id),overflow:document.documentElement.scrollWidth>innerWidth||node.scrollWidth>node.clientWidth,smallestFont:Math.min(...fonts)};
    });
    assert.deepEqual(result.violations,[],`${name} at ${width}: axe`);assert.equal(result.overflow,false,`${name} at ${width}: reflow`);assert.ok(result.smallestFont>=13,`${name} at ${width}: text ${result.smallestFont}px`);
    if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:join(evidence,`${name}-${width}.png`)});await writeFile(join(evidence,`${name}-${width}.json`),JSON.stringify({width,...result},null,2))}
   },
   async open(id){
    const all=page.locator('#all-sent-alerts');if(await all.count()&&!await all.evaluate(d=>d.open))await all.locator(':scope > summary').click();
    const row=page.locator(`[data-key="delivery-${id}"]`),details=row.locator('details');if(!await details.evaluate(d=>d.open))await details.locator(':scope > summary').click();
    await row.locator('.sent-body').waitFor();return row;
   },
   // The three facts as written: [dt, dd text, whether the dd holds a <time>].
   async facts(row){return row.locator('.sent-body dl.drill-lines > div').evaluateAll(rows=>rows.map(r=>[r.querySelector('dt').textContent,r.querySelector('dd').textContent,r.querySelector('dd time')?.getAttribute('datetime')??null]))},
   async dialog(id){await page.locator(`#destination-edit-${id}`).click();const dialog=page.locator('dialog.destination-dialog');await dialog.waitFor();return dialog},
  };
  return ui;
 }catch(error){await browser.close();throw error}
}
// Create through the console's Add destination dialog and return what the create door answered.
async function createInConsole(ui,f,{name,url,source,service,environment,severity,token}){
 const {page}=ui;await ui.width(1440);await ui.alerts();
 await page.locator('#add-destination').click();const dialog=page.locator('dialog.destination-dialog');await dialog.waitFor();
 await dialog.locator('[name=kind]').selectOption('webhook');await dialog.locator('[name=name]').fill(name);
 await dialog.locator('[name=webhookFormat]').selectOption('oncall');
 for(const hidden of ['webhookPayload','webhookHeaders','webhookSigning','webhookImport'])assert.equal(await dialog.locator(`[name=${hidden}]`).isVisible(),false,hidden+' is hidden for an Oncall handoff');
 assert.equal(await dialog.locator('[name=webhookPayload]').isDisabled(),true);
 assert.equal(await dialog.locator('[name=oncallToken]').getAttribute('type'),'password');assert.equal(await dialog.locator('[name=oncallToken]').getAttribute('autocomplete'),'off');
 assert.equal(await dialog.locator('[name=oncallSeverity]').inputValue(),'critical','Critical is the default');
 assert.deepEqual(await dialog.locator('[name=oncallSeverity] option').allTextContents(),['Critical','Warning','Info']);
 await dialog.locator('[name=oncallSource]').fill(source);await dialog.locator('[name=oncallService]').fill(service);await dialog.locator('[name=oncallEnvironment]').fill(environment);
 await dialog.getByText('Oncall receives confirmed incidents, reminders and recoveries. Tests are not sent.').waitFor();
 await dialog.getByText('From your Oncall routed key. Stored encrypted; not shown again.').waitFor();
 // The dialog is audited before the URL and token are typed, so nothing secret is captured.
 for(const width of WIDTHS){await ui.width(width);await ui.audit(dialog,'oncall-dialog',width)}
 await ui.width(1440);
 await dialog.locator('[name=url]').fill(url);await dialog.locator('[name=oncallToken]').fill(token);await dialog.locator('[name=oncallSeverity]').selectOption(severity);
 const created=page.waitForResponse(r=>r.url()===f.origin+'/api/notifications/destinations'&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Create destination'}).click();
 const response=await created;assert.equal(response.status(),201);const destination=await response.json();assert.ok(destination.signingSecret,'create returns the signing secret once');
 const secret=page.locator('dialog.secret-dialog');await secret.waitFor();assert.equal(await secret.locator('.one-time-secret').textContent(),destination.signingSecret);
 await secret.getByRole('button',{name:'I saved it — close'}).click();await secret.waitFor({state:'detached'});
 return destination;
}
// Edit's dialog: saved values, an empty token that is not in the page, and the saved-credential helper.
async function inspectEdit(ui,destination,{key,endpoint}){
 const {page}=ui,dialog=await ui.dialog(destination.id),value=name=>dialog.locator(`[name=${name}]`).inputValue();
 assert.equal(await value('webhookFormat'),'oncall');
 assert.deepEqual([await value('oncallSource'),await value('oncallService'),await value('oncallEnvironment'),await value('oncallSeverity')],['intake:synthetic-uptime-1','synthetic-uptime-2','synthetic-uptime-3','critical']);
 assert.equal(await value('oncallToken'),'');assert.equal(await value('url'),'');
 await dialog.getByText('Saved. Leave blank to keep it.').waitFor();
 for(const secret of [key,endpoint])assert.ok(!(await page.content()).includes(secret),'the saved token and endpoint are not in the Edit dialog');
 for(const hidden of ['webhookPayload','webhookHeaders','webhookSigning','webhookImport'])assert.equal(await dialog.locator(`[name=${hidden}]`).isVisible(),false);
 for(const width of WIDTHS){await ui.width(width);await ui.audit(dialog,'oncall-edit-dialog',width)}
 await ui.width(1440);return dialog;
}
// One delivery's opened row, at each width on a freshly loaded page: Acknowledged shows Oncall's accepted time (the first alert's
// acknowledgment on later rows is marked), Received and Responded stay Unknown, and the raw receipt is not rendered.
async function expectAcknowledged(ui,delivery,ack,widths=WIDTHS,name='oncall-row-acknowledged'){
 for(const width of widths){
  await ui.width(width);await ui.alerts();const row=await ui.open(delivery.id);await row.locator('dl.drill-lines time').first().waitFor();
  const [acknowledged,...others]=await ui.facts(row),first=ack.deliveryId!==delivery.id;
  assert.equal(acknowledged[0],'Acknowledged');assert.equal(acknowledged[2],new Date(ack.receiverAcceptedAt).toISOString(),'Acknowledged shows the receiver acceptance time');
  assert.ok(acknowledged[1].endsWith(first?" · Oncall accepted it · this incident's first alert":' · Oncall accepted it'),acknowledged[1]);
  assert.deepEqual(others,[['Received',UNKNOWN_OTHER,null],['Responded',UNKNOWN_OTHER,null]]);
  assert.equal(await row.locator('.webhook-response').count(),0,'the raw receipt is not rendered');assert.ok(!(await row.textContent()).includes(ack.receiptId));
  await ui.audit(row,name,width);
 }
 await ui.width(1440);
}
// Rename through Edit with no token. An invalid Source shows the server's sentence and saves nothing; the retry keeps the saved
// credential, so it issues no new signing secret and no one-time dialog.
async function renameInConsole(ui,f,destination,secrets){
 const {page}=ui,list=async()=>(await f.request('/api/notifications/destinations')).data.find(d=>d.id===destination.id);
 const before=await list(),dialog=await inspectEdit(ui,destination,secrets);
 await dialog.locator('[name=oncallSource]').fill('not a routed key');await dialog.getByRole('button',{name:'Save destination'}).click();
 await dialog.locator('form > .form-error').getByText('Oncall source must name a routed intake key',{exact:true}).waitFor();
 assert.deepEqual((await list()).webhookTemplate,before.webhookTemplate,'a refused save changes nothing');
 await dialog.locator('[name=oncallSource]').fill('intake:synthetic-uptime-1');await dialog.locator('[name=name]').fill('synthetic-uptime-1 renamed');
 const patched=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/api/notifications/destinations/'+destination.id));
 await dialog.getByRole('button',{name:'Save destination'}).click();const response=await patched;
 assert.equal(response.status(),200);assert.equal((await response.json()).signingSecret,undefined,'an unchanged credential issues no new signing secret');
 const sent=JSON.parse(response.request().postData());assert.equal(sent.webhookHeaders,undefined,'no token typed, none sent');assert.equal(sent.webhookSigning,true);assert.equal(sent.webhookTemplate.timeZone,before.webhookTemplate.timeZone);
 await dialog.waitFor({state:'detached'});assert.equal(await page.locator('dialog.secret-dialog').count(),0);
 const after=await list();assert.equal(after.name,'synthetic-uptime-1 renamed');assert.deepEqual(after.webhookTemplate,before.webhookTemplate);assert.equal(after.credentialsAvailable,true);
}
export async function proveOncallHandoff(){
 console.log('ONCALL_PROOF starting emitted Worker');
 const f=await fixture(),key=randomBytes(32).toString('hex'),events=new Map(),alerts=new Map(),records=[],errors=[];
 let disposition='lost',restarted,restored,ui;
 // Only this edge substitutes for Oncall. The application, authenticated owner
 // routes, signed probe results, scheduler and dispatcher are the emitted product.
 const server=createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const raw=Buffer.concat(chunks).toString('utf8'),event=JSON.parse(raw);
   assert.equal(req.url,'/api/ingress/intake:synthetic-uptime-1');
   assert.equal(req.headers.authorization,'Bearer '+key);
   assert.deepEqual(Object.keys(event).sort(),['source','eventId','service','environment','key','generation','intent','severity','title','observedAt','evidence'].sort());
   assert.equal(event.source,'intake:synthetic-uptime-1');assert.equal(event.service,'synthetic-uptime-2');
   assert.equal(event.environment,'synthetic-uptime-3');assert.equal(event.severity,'critical');
   assert.ok(event.evidence.startsWith(f.origin+'/app/monitors/'));
   const existing=events.get(event.eventId);if(existing)assert.equal(existing.raw,raw,'retry content is immutable');
   const receipt=existing?.receipt??{duplicate:false,id:randomUUID(),eventId:event.eventId,service:event.service,observedAt:event.observedAt,acceptedAt:new Date().toISOString()};
   events.set(event.eventId,{raw,receipt});alerts.set(event.key+':'+event.generation,event.intent);
   records.push({raw,event,at:Date.now()});
   if(disposition==='lost'){req.socket.destroy();return}
   if(disposition==='timeout'){await sleep(4000);if(res.destroyed)return}
   if(disposition==='5xx'){res.writeHead(503);res.end('{}');return}
   res.writeHead(existing?200:201,{'content-type':'application/json'});
   res.end(disposition==='missing'?'{}':disposition==='unrouted'?JSON.stringify({...receipt,service:null}):JSON.stringify({...receipt,duplicate:Boolean(existing)}));
  }catch(error){errors.push(error);res.writeHead(422);res.end('{}')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint='https://oncall.example.com/api/ingress/intake:synthetic-uptime-1';
 const transport=loopbackWireTransport(new Map([[endpoint,{port:server.address().port,path:'/api/ingress/intake:synthetic-uptime-1'}]]));
 const ok=async(path,body,method)=>{const r=await f.request(path,{body,...(method?{method}:{})});assert.ok(r.status>=200&&r.status<300,path+': '+r.status+' '+JSON.stringify(r.data));return r.data};
 const rpc=async(_path,body)=>{const r=await f.request('/api/runner/notifications',{body,runner:f.first});assert.equal(r.status,200);return r.data};
 const send=()=>dispatchNotifications(rpc,transport);
 const probe=async runner=>{const task=await f.claim(runner);if(task)assert.equal((await f.submit(runner,task,[await f.evidence(task)])).status,200)};
 const rows=async()=> (await ok('/api/notifications')).deliveries.filter(d=>d.destinationId===destination.id);
 const retry=async()=>{const row=(await rows()).find(d=>d.state==='queued');assert.ok(row,'uncertain handoff retains a retry');const due=row.attemptHistory.findLast(a=>a.started_at===null)?.scheduled_at;assert.ok(due);await sleep(due-Date.now()+30);await send()};
 let destination;
 try{
  console.log('ONCALL_PROOF configuring destination');
  ui=await openConsole(f);
  destination=await createInConsole(ui,f,{name:'synthetic-uptime-1',url:endpoint,source:'intake:synthetic-uptime-1',service:'synthetic-uptime-2',environment:'synthetic-uptime-3',severity:'critical',token:key});
  const stored=(await ok('/api/notifications/destinations')).find(d=>d.id===destination.id);
  assert.equal(stored.name,'synthetic-uptime-1');assert.equal(stored.webhookSigning,true);
  assert.deepEqual(stored.webhookTemplate,{version:1,method:'POST',mode:'oncall',template:{source:'intake:synthetic-uptime-1',service:'synthetic-uptime-2',environment:'synthetic-uptime-3',severity:'critical'},headerNames:['authorization'],timeZone:'America/Chicago'});
  // The row says Oncall and offers Edit; a test event cannot become a handoff, so it has no Send test.
  const destinationRow=ui.page.locator(`[data-key="destination-${destination.id}"]`);await destinationRow.waitFor();
  assert.ok((await destinationRow.locator('small').first().textContent()).startsWith('Oncall'));assert.equal(await destinationRow.getByRole('button',{name:'Edit'}).count(),1);assert.equal(await destinationRow.getByRole('button',{name:'Send test'}).count(),0);
  const same=await ok('/api/runners',{networkLabel:f.first.networkLabel});
  const monitor=await f.monitor({name:'synthetic-uptime-4',runners:[f.first,same,f.second],freshnessMs:5000});
  const input={scope:'monitor',mode:'selected',destinationIds:[destination.id],expectedRevision:0,contactSettings:{[destination.id]:{repeatMinutes:1,maxRepeats:1}}};
  const route='/api/monitors/'+monitor.id+'/alert-route',preview=await ok(route+'/preview',input);
  await ok(route+'/apply',{...input,digest:preview.digest});
  const tasks=[];
  for(const runner of [f.first,same,f.second])tasks.push(await f.claim(runner));
  for(let i=0;i<2;i++)assert.equal((await f.submit([f.first,same][i],tasks[i],[await f.evidence(tasks[i])])).status,200);
  await send();assert.equal((await rows()).length,0,'a repeated network label cannot supply an independent failure confirmation');
  assert.equal((await f.state(monitor.id)).targetState,'Degraded');
  assert.equal((await f.submit(f.second,tasks[2],[await f.evidence(tasks[2])])).status,200);
  await send();
  let delivery=(await rows())[0];assert.equal(delivery.state,'queued');assert.equal(delivery.handoff.acknowledged.state,'unknown');
  assert.equal(alerts.size,1,'Oncall may retain the alert even when its response is lost');
  // Nothing is acknowledged yet: the opened row reads Unknown three times, with no time and no receipt.
  for(const width of process.env.UPTIME_ONCALL_EVIDENCE?WIDTHS:[1440]){
   await ui.width(width);await ui.alerts();const row=await ui.open(delivery.id);
   assert.deepEqual(await ui.facts(row),[['Acknowledged',UNKNOWN_ACK,null],['Received',UNKNOWN_OTHER,null],['Responded',UNKNOWN_OTHER,null]]);assert.equal(await row.locator('.webhook-response').count(),0);
   await ui.audit(row,'oncall-row-unknown',width);
  }
  await ui.width(1440);
  disposition='5xx';await retry();delivery=(await rows())[0];assert.equal(delivery.state,'queued');
  disposition='timeout';await retry();delivery=(await rows())[0];assert.equal(delivery.state,'queued');
  disposition='missing';await retry();delivery=(await rows())[0];assert.equal(delivery.state,'queued','a 2xx without a native receipt is uncertain');
  disposition='unrouted';await retry();delivery=(await rows())[0];assert.equal(delivery.state,'queued','unrouted custody does not acknowledge a service alert');
  disposition='accepted';await retry();delivery=(await rows())[0];assert.equal(delivery.state,'accepted');assert.equal(alerts.size,1);
  assert.equal(new Set(records.map(r=>r.raw)).size,1);assert.equal(new Set(records.map(r=>r.event.eventId)).size,1);
  assert.equal(records[0].event.title.split(f.first.networkLabel).length-1,1,'wire evidence counts a repeated label once');
  assert.ok(records[0].event.title.includes(f.second.networkLabel));
  const ack=delivery.handoff.acknowledged;assert.equal(ack.state,'acknowledged');assert.ok(ack.at);assert.ok(ack.receiptId);assert.ok(ack.receiverAcceptedAt);
  for(const name of ['received','responded'])assert.deepEqual([delivery.handoff[name].state,delivery.handoff[name].source,delivery.handoff[name].at],['unknown',null,null]);
  // The open row on the page that was showing Unknown is patched in place by the overview refresh, and stays open.
  await ui.page.waitForFunction(id=>document.querySelector(`[data-key="delivery-${id}"] dl.drill-lines time`),delivery.id,{timeout:20000});
  assert.equal(await ui.page.locator(`[data-key="delivery-${delivery.id}"] details`).evaluate(d=>d.open),true);
  assert.equal(ack.deliveryId,delivery.id);await expectAcknowledged(ui,delivery,ack);
  const incidentId=delivery.eventId;
  const detail=await ok('/api/incidents/'+incidentId);
  assert.equal(detail.timeline.filter(t=>t.kind==='sibling_handoff').length,1);
  const handoffAttempts=detail.timeline.filter(t=>t.data.deliveryId===delivery.id&&t.kind==='notification_attempt');
  assert.ok(handoffAttempts.length);assert.ok(handoffAttempts.every(t=>t.data.handoff&&t.data.eventKind==='trigger'));
  assert.ok(detail.timeline.some(t=>t.data.deliveryId===delivery.id&&t.kind==='notification_outcome'&&t.data.handoff&&t.data.outcome));
  assert.deepEqual(detail.deliveries.find(d=>d.id===delivery.id).handoff,delivery.handoff);
  await renameInConsole(ui,f,destination,{key,endpoint});
  // Lost probes after confirmed failure neither recover nor claim availability.
  await sleep(5500);
  assert.equal((await f.state(monitor.id)).state,'Unknown');
  assert.equal((await rows()).some(d=>d.event.kind==='recovery'),false);
  await probe(f.first);await probe(same);await probe(f.second);
  // Keep real evidence fresh while the configured one-minute repeat becomes due.
  const repeatDue=delivery.event.observedAt+60000;
  while(Date.now()<repeatDue){await sleep(Math.min(4000,repeatDue-Date.now()));await probe(f.first);await probe(same);await probe(f.second)}
  await send();
  const repeat=(await rows()).find(d=>d.event.kind==='reminder');assert.ok(repeat);assert.equal(repeat.state,'accepted');
  assert.deepEqual(repeat.handoff.acknowledged,ack,'a repeat does not create a second acknowledgement');
  await expectAcknowledged(ui,repeat,ack,WIDTHS,'oncall-row-reminder');
  await (restarted??f.worker).dispose();
  restarted=await startLocalWorker({persist:f.directory,port:Number(new URL(f.origin).port),bindings:f.bindings});await restarted.ready;
  await send();assert.deepEqual((await rows())[0].handoff.acknowledged,ack);
  // The console's page survives the Worker restart: reloaded, it shows the same acknowledgment on the first alert and its reminder.
  await ui.reload();await expectAcknowledged(ui,delivery,ack,[1440],'oncall-row-restarted-first');await expectAcknowledged(ui,repeat,ack,[1440],'oncall-row-restarted-reminder');
  f.modes.target=200;await sleep(5100);await probe(f.first);await probe(same);await probe(f.second);await send();
  const recovered=(await rows()).find(d=>d.event.kind==='recovery');assert.ok(recovered);assert.equal(recovered.state,'accepted');
  const recovery=records.find(r=>r.event.intent==='recover').event,trigger=records[0].event;
  assert.equal(recovery.key,trigger.key);assert.equal(recovery.generation,trigger.generation);assert.notEqual(recovery.eventId,trigger.eventId);
  assert.deepEqual(recovered.handoff.acknowledged,ack);
  await expectAcknowledged(ui,recovered,ack,WIDTHS,'oncall-row-recovery');
  assert.equal((await ok('/api/incidents/'+incidentId)).timeline.filter(t=>t.kind==='sibling_handoff').length,1);
  const archive=await ok('/api/archive');
  for(const row of [delivery,repeat,recovered])await ui.open(row.id);
  const rendered=[await ui.page.locator('body').innerText(),await ui.page.content()];
  for(const value of [archive,await ok('/api/notifications'),await ok('/api/incidents/'+incidentId),rendered]){
   const text=typeof value==='string'?value:JSON.stringify(value);for(const secret of [key,destination.signingSecret,endpoint])assert.ok(!text.includes(secret),'no receiver credential or endpoint enters retained reads or the rendered page');
  }
  const restorePort=(await availablePorts(1))[0],restoredOrigin='http://127.0.0.1:'+restorePort;
  const restoring=ownerAPI(restoredOrigin);
  ({worker:restored}=await migratedWorker({port:restorePort,persist:join(f.directory,'restored-oncall'),bindings:f.bindings}));
  await restoring.signIn(f.bindings);
  const imported=await restoring.api('/api/restore','POST',archive);assert.equal(imported.status,200,JSON.stringify(imported.data));
  const retained=(await restoring.api('/api/notifications')).data.deliveries;
  assert.ok(retained.every(d=>d.state==='imported-inactive'));
  assert.deepEqual(retained.find(d=>d.id===delivery.id).handoff.acknowledged,ack,'inactive history retains its original receipt without new send authority');
  await restored.dispose();restored=null;
  await ok('/api/notifications/destinations/'+destination.id,undefined,'DELETE');
  const erased=await ok('/api/incidents/'+incidentId);assert.equal(erased.deliveries.length,0);assert.equal(erased.timeline.filter(t=>t.kind==='sibling_handoff').length,0,'destination erasure removes receipt evidence');
  await f.pause(monitor);
  assert.deepEqual(errors,[]);
  console.log('BOUNDARY-001 native handoff: configured route, stable key and generation, loss, 5xx, timeout, missing receipt, repeat, recovery, restart, three distinct facts, missing probes and distinct network evidence passed');
 }finally{await ui?.browser.close();await closeServer(server);await restored?.dispose();await restarted?.dispose();await f.close()}
}
