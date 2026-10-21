// SLOW-001: scheduled real response delays, independent notices and unchanged uptime.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './resilience/support.mjs';
import {browserSignIn} from './auth-test-support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';

test('Slow has its own contacts and report spans; recovery, percentile location windows and latency failures keep separate meanings',{timeout:240000},async()=>{
 const f=await fixture();let restarted,browser;
 try{
  const ok=async(path,body,options={})=>{const r=await f.request(path,{...options,...(body===undefined?{}:{body})});assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
  const down=await ok('/api/notifications/destinations',{name:'Outage response',kind:'webhook',url:'https://alerts.example.com/down'}),slow=await ok('/api/notifications/destinations',{name:'Performance operations',kind:'webhook',url:'https://alerts.example.com/slow'});
  const policy={thresholdMs:2000,mode:'consecutive',slots:3,percentile:95,locations:'all',destinationIds:[slow.id],contactSettings:{[slow.id]:{repeatMinutes:1,maxRepeats:1,stopOnAck:true}}};
  const m=await f.monitor({name:'Checkout API',runners:[f.first],canary:true,timeoutMs:10000,slow:policy});
  const route=`/api/monitors/${m.id}/alert-route`,selection={scope:'monitor',mode:'selected',destinationIds:[down.id],expectedRevision:0};
  await ok(route+'/apply',{...selection,digest:(await ok(route+'/preview',selection)).digest});
  const rpc=async(_path,body)=>ok('/api/runner/notifications',body,{runner:f.first}),received=[];
  const transport={async send(wire,beforeRequest){await beforeRequest();received.push({url:wire.url,event:JSON.parse(wire.body)});return {status:202,headers:{},body:''}}};
  const check=async()=>{const task=await f.claim(f.first);assert.ok(task);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);return task};
  const next=async()=>{await new Promise(r=>setTimeout(r,5200));return check()};
  f.modes.target=200;f.modes.delayMs=3000;
  await check();await dispatchNotifications(rpc,transport);assert.ok(!received.some(r=>r.event.kind==='slow'));
  await next();await dispatchNotifications(rpc,transport);assert.ok(!received.some(r=>r.event.kind==='slow'));
  await next();await dispatchNotifications(rpc,transport);
  const trigger=received.find(r=>r.event.kind==='slow');assert.ok(trigger);assert.equal(trigger.url,'https://alerts.example.com/slow');assert.equal((await f.state(m.id)).targetState,'Healthy');
  assert.equal((await ok(`/api/monitors/${m.id}/incidents`)).length,0);
  const report=await ok(`/api/v1/monitors/${m.id}/report?period=24h`);assert.ok(report.slow.slowMs>0);assert.equal(report.availability.notPassingMs,0);assert.equal(report.incidentSummary.count,0);
  // Browser reads the same persisted Slow event and period report, not synthetic UI data.
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
  const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,f.origin);
  const uiMonitor=await f.monitor({name:'Staging checkout',runners:[f.first],canary:true,timeoutMs:10000,enabled:false});
  const screens=process.env.UPTIME_SCREENSHOTS??join(f.directory,'screens');await mkdir(screens,{recursive:true});
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(f.origin+`/app/monitors/${m.id}`);await page.locator('#slow-policy-summary').getByText('Slow is open',{exact:false}).waitFor();await page.locator('#slow-policy-summary').scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-open-${width}.png`)});
   await page.getByRole('button',{name:'Edit slow-response policy',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('#slow-threshold').waitFor();await page.screenshot({path:join(screens,`slow-policy-${width}.png`)});assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth));await dialog.getByRole('button',{name:'Close',exact:true}).click();
   await page.goto(f.origin+`/app/monitors/${uiMonitor.id}`);await page.getByRole('button',{name:'Edit slow-response policy',exact:true}).click();const editor=page.getByRole('dialog');await editor.locator('#slow-enabled').check();await editor.locator('#slow-threshold').fill('2000');await editor.locator('#slow-slots').fill('3');await editor.locator('#slow-mode').selectOption(width===390?'percentile':'consecutive');await editor.locator('#slow-route-mode').selectOption('selected');await editor.locator(`[name=destination][value="${slow.id}"]`).check();await editor.locator('#slow-threshold').scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-editor-${width}.png`)});const contact=editor.locator(`[name=destination][value="${slow.id}"]`).locator('xpath=ancestor::*[@data-slow-contact][1]');await contact.locator('[data-slow-setting=delayMinutes]').fill('10');await contact.locator('[data-slow-setting=repeatMinutes]').fill('30');await contact.locator('[data-slow-setting=maxRepeats]').fill('3');await contact.locator('[data-slow-setting=stopOnAck]').check();await contact.scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-contacts-${width}.png`)});await editor.getByRole('button',{name:'Save slow-response policy',exact:true}).click();await editor.waitFor({state:'detached'});await page.reload();const saved=await ok(`/api/monitors/${uiMonitor.id}/slow-policy`);assert.equal(saved.slow.thresholdMs,2000);assert.equal(saved.slow.mode,width===390?'percentile':'consecutive');assert.deepEqual(saved.slow.destinationIds,[slow.id]);assert.equal(saved.slow.contactSettings[slow.id].delayMinutes,10);assert.equal(saved.slow.contactSettings[slow.id].repeatMinutes,30);assert.equal(saved.slow.contactSettings[slow.id].maxRepeats,3);assert.equal(saved.slow.contactSettings[slow.id].stopOnAck,true);
   await page.getByRole('button',{name:'Edit slow-response policy',exact:true}).click();const importer=page.getByRole('dialog');await importer.getByText('Import Site24x7 threshold profile',{exact:true}).click();await importer.locator('#slow-import-document').fill(JSON.stringify({code:0,data:{type:'URL',profile_type:1,response_time_threshold:{primary:[{severity:2,comparison_operator:1,value:1500,strategy:1,polls_check:2}]}}}));await importer.locator('#slow-import-scope').selectOption('primary');await importer.locator('#slow-import-severity').selectOption('2');await importer.locator('#preview-slow-import').scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-import-${width}.png`)});await importer.getByRole('button',{name:'Preview imported Slow policy',exact:true}).click();await importer.locator('#slow-import-status').getByText('Imported Slow policy is ready to review.',{exact:false}).waitFor();assert.equal((await ok(`/api/monitors/${uiMonitor.id}/slow-policy`)).revision,saved.revision);await importer.locator('#slow-threshold').scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-import-preview-${width}.png`)});await importer.getByRole('button',{name:'Close',exact:true}).click();
  }
  await page.goto(f.origin+`/app/monitors/${m.id}`);await page.getByRole('button',{name:'Acknowledge Slow',exact:true}).click();await page.getByRole('button',{name:'Slow acknowledged',exact:true}).waitFor();
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.locator('#slow-policy-summary').scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-acknowledged-${width}.png`)});}
  assert.ok((await ok(`/api/monitors/${m.id}/slow-policy`)).status.acknowledgedAt);assert.equal((await f.state(m.id)).targetState,'Healthy');
  await new Promise(r=>setTimeout(r,Math.max(0,trigger.event.observedAt+60500-Date.now())));await dispatchNotifications(rpc,transport);assert.ok(!received.some(r=>r.event.kind==='slow_reminder'),'selected Slow acknowledgement stops the due repeat');
  await f.worker.dispose();restarted=await startLocalWorker({persist:f.directory,port:Number(new URL(f.origin).port),bindings:f.bindings});await restarted.ready;
  f.modes.delayMs=0;
  const manualJob=await ok(`/api/monitors/${m.id}/run`,{});const manual=await check();assert.equal(manual.id,manualJob.slotId);await dispatchNotifications(rpc,transport);assert.ok(!received.some(r=>r.event.kind==='slow_recovery'),'manual pass cannot close Slow');
  await next();await dispatchNotifications(rpc,transport);assert.ok(!received.some(r=>r.event.kind==='slow_recovery'),'a missed scheduled window cannot resolve Slow');
  await next();await next();await next();await dispatchNotifications(rpc,transport);const recovery=received.find(r=>r.event.kind==='slow_recovery');assert.ok(recovery);assert.equal(recovery.event.incidentKey,trigger.event.incidentKey);assert.equal(recovery.url,trigger.url);assert.equal((await f.state(m.id)).targetState,'Healthy');
  const recovered=await ok(`/api/v1/monitors/${m.id}/report?period=24h`);assert.ok(recovered.slow.slowMs>0);assert.ok(recovered.slow.episodes[0].endedAt);assert.equal(recovered.availability.notPassingMs,0);
  const csvResponse=await page.request.get(f.origin+`/api/v1/monitors/${m.id}/report?period=24h&format=csv`);assert.equal(csvResponse.status(),200);assert.ok((await csvResponse.text()).includes(`slowMs,${recovered.slow.slowMs},ms`));
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(f.origin+`/app/monitors/${m.id}`);await page.locator('#slow-policy-summary').getByText('Slow recovered',{exact:false}).waitFor();await page.locator('#slow-policy-summary').scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-recovered-${width}.png`)});await page.getByRole('button',{name:'Generate report',exact:true}).click();await page.locator('#report-slow-time').waitFor();await page.locator('#report-slow-time').scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-report-${width}.png`)});await page.getByText('Slow episodes in this period',{exact:true}).click();await page.getByRole('heading',{name:'Recovered in period',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-episode-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(f.origin+'/docs/slow-responses');await page.getByRole('heading',{name:'Slow-response alerts',exact:true}).waitFor();await page.getByRole('heading',{name:'Slow-response alerts',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-guide-${width}.png`)});await page.getByRole('heading',{name:'Bring a saved response-time threshold',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-guide-import-${width}.png`)});await page.getByRole('heading',{name:'Read slow time in a period report',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`slow-guide-report-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await browser.close();browser=null;
  // Finish with public-door archive validation; no dispatch schedule travels as authority.
  assert.equal((await f.request('/api/archive')).status,200);
  await f.pause(m);
  const latency=await f.monitor({name:'Checkout latency is downtime',runners:[f.first],canary:true,timeoutMs:10000,assertions:{status:200,latencyMs:2000}});
  f.modes.delayMs=3000;await check();assert.equal((await f.state(latency.id)).targetState,'Failing');await f.pause(latency);
  // Per-location percentile ignores a slow unselected location, then detects that
  // same location after an explicit revision. Both probes are real signed results.
  const percentile=await f.monitor({name:'Regional checkout performance',runners:[f.first,f.second],timeoutMs:10000,slow:{...policy,mode:'percentile',slots:2,locations:['local-a']}});
  const regional=async()=>{const a=await f.claim(f.first),b=await f.claim(f.second);assert.ok(a&&b);assert.equal(a.id,b.id);f.modes.delayMs=0;const oa=await f.evidence(a);f.modes.delayMs=3000;const ob=await f.evidence(b);assert.equal((await f.submit(f.first,a,[oa])).status,200);assert.equal((await f.submit(f.second,b,[ob])).status,200)};
  await regional();await new Promise(r=>setTimeout(r,5200));await regional();await dispatchNotifications(rpc,transport);assert.ok(!received.some(r=>r.event.monitorId===percentile.id&&r.event.kind==='slow'));
  const config=await ok(`/api/monitors/${percentile.id}/slow-policy`);await ok(`/api/monitors/${percentile.id}/slow-policy`,{expectedRevision:config.revision,slow:{...config.slow,locations:['local-b']}});
  await new Promise(r=>setTimeout(r,5200));await regional();await new Promise(r=>setTimeout(r,5200));await regional();await dispatchNotifications(rpc,transport);assert.ok(received.some(r=>r.event.monitorId===percentile.id&&r.event.kind==='slow'));
  const portable=await ok('/api/archive');await restarted.dispose();restarted=null;await f.close();
  const restored=await fixture();
  try{
   const imported=await restored.request('/api/restore',{body:{archive:portable}});assert.equal(imported.status,200,JSON.stringify(imported.data));
   const importedReport=await restored.request(`/api/v1/monitors/${m.id}/report?period=24h`);assert.equal(importedReport.status,200);assert.equal(importedReport.data.slow.slowMs,recovered.slow.slowMs);assert.ok(importedReport.data.slow.episodes.every(e=>e.imported));
   assert.ok((await restored.request('/api/overview')).data.monitors.every(m=>m.definition.enabled===false));assert.equal((await restored.request(`/api/monitors/${m.id}/slow-policy`)).data.status,null);
   let sent=0;await dispatchNotifications(async(_path,body)=>{const r=await restored.request('/api/runner/notifications',{runner:restored.first,body});assert.equal(r.status,200);return r.data},{async send(){sent++;throw Error('Restored history must not send')}});assert.equal(sent,0);assert.equal((await restored.request('/api/archive')).status,200);
  }finally{await restored.close()}
  console.log(`SLOW-001 real-delay and console journeys passed; screenshots: ${screens}`);
 }finally{await browser?.close();await restarted?.dispose();await f.close()}
});
