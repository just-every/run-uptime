import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {finishSetup} from './auth-test-support.mjs';

// Part of the existing incident-work public-door journey, not a new registration.
export async function proveOwnIncidentCorrelation(f){
 const ok=async(path,options={})=>{const r=await f.request(path,options);assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
 const monitors=[];
 for(const [n,service] of [[1,'synthetic-uptime-shared'],[2,'synthetic-uptime-shared'],[3,'synthetic-uptime-unrelated']])monitors.push(await f.monitor({name:`synthetic-uptime-${n}`,service,runners:[f.first],canary:true,enabled:false}));
 const contact=await ok('/api/notifications/destinations',{body:{name:'synthetic-uptime-followup',kind:'email',address:'synthetic-uptime-followup@example.test'}});
 const route={scope:'monitor',mode:'selected',destinationIds:[contact.id],expectedRevision:0,contactSettings:{[contact.id]:{delayMinutes:1,repeatMinutes:1,maxRepeats:1,stopOnAck:true}}};
 const reviewed=await ok(`/api/monitors/${monitors[0].id}/alert-route/preview`,{body:route});await ok(`/api/monitors/${monitors[0].id}/alert-route/apply`,{body:{...route,digest:reviewed.digest}});
 for(const m of monitors)await ok('/api/monitors/'+m.id,{method:'PATCH',body:{...m.definition,enabled:true}});
 f.modes.target=503;
 for(let i=0;i<monitors.length;i++){const task=await f.claim(f.first);assert.ok(task);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200)}
 const incidents=await Promise.all(monitors.map(async m=>(await ok(`/api/monitors/${m.id}/incidents`))[0]));
 const path=i=>'/api/incidents/'+encodeURIComponent(incidents[i].id);
 let first=await ok(path(0)),second=await ok(path(1));
 assert.equal(first.nextDueKind,'notification');assert.equal(first.nextDue,first.trigger.observedAt+60000,'next-due time follows the exact route delay');
 assert.deepEqual(first.dependencies.group.map(g=>g.incidentId),[incidents[1].id],'own simultaneous outages group without any provider notice');
 assert.deepEqual(second.dependencies.group.map(g=>g.incidentId),[incidents[0].id]);
 assert.deepEqual((await ok(path(2))).dependencies.group,[],'unrelated simultaneous failure never joins');
 const evidence=async()=> (await f.DB.prepare('SELECT * FROM observations ORDER BY id').all()).results;
 const before=await evidence();
 await finishSetup(f.origin,f.cookie);
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
  const context=await browser.newContext();
  const [name,...value]=f.cookie.split('=');await context.addCookies([{name,value:value.join('='),url:f.origin}]);
  const page=await context.newPage();
  await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort());
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(f.origin+`/app/monitors/${monitors[0].id}`);await page.locator('html.signed-in').waitFor();
   await page.getByRole('button',{name:'Notes and follow-up',exact:true}).click();
   const dialog=page.locator('#incident-work-dialog');await dialog.locator('[data-correlation-group]').waitFor();
   assert.match(await dialog.locator('[data-correlation-group]').textContent(),/synthetic-uptime-2/);await dialog.getByText(/^Notification · /).waitFor();
   assert.ok(!(await dialog.locator('[data-correlation-group]').textContent()).includes('synthetic-uptime-3'));
   await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});
   assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.UPTIME_SCREENSHOTS){await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});await dialog.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`correlation-${width}.png`)})}
   await dialog.getByRole('button',{name:'Close incident notes',exact:true}).click();await dialog.waitFor({state:'detached'});
  }
 }finally{await browser?.close()}
 await ok(path(0)+'/actions',{body:{kind:'acknowledge',version:first.version}});
 second=await ok('/api/v1/incidents/'+encodeURIComponent(incidents[1].id));
 assert.equal(second.status,'acknowledged');assert.equal((await ok(path(2))).status,'open');
 const acknowledgment=second.timeline.find(e=>e.kind==='acknowledged');assert.equal(acknowledgment.data.channel,'group');assert.ok(acknowledgment.actor.id);assert.ok(acknowledgment.at);
 assert.deepEqual(await evidence(),before,'group acknowledgment preserves every monitor observation');
 // A later same-service outage falls outside the five-second confirmation window.
 await new Promise(resolve=>setTimeout(resolve,5200));
 const late=await f.monitor({name:'synthetic-uptime-4',service:'synthetic-uptime-shared',runners:[f.first],canary:true});
 for(const m of monitors)await f.pause(m);
 let task=await f.claim(f.first);assert.equal(task.monitorId,late.id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
 const lateIncident=(await ok(`/api/monitors/${late.id}/incidents`))[0];assert.deepEqual((await ok('/api/incidents/'+encodeURIComponent(lateIncident.id))).dependencies.group,[],'same label outside confirmation window never joins');
 await f.pause(late);
 await ok('/api/monitors/'+monitors[0].id,{method:'PATCH',body:{...monitors[0].definition,enabled:true}});
 f.modes.target=200;task=await f.claim(f.first);assert.equal(task.monitorId,monitors[0].id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
 first=await ok(path(0));second=await ok(path(1));assert.equal(first.machineState,'recovered');assert.equal(second.machineState,'open','one recovery closes only its own child');
 await f.pause(monitors[0]);
 console.log('FOLLOWUP-001 own incident correlation PASS: shared service within confirmation window, unrelated/late isolation, grouped actor acknowledgment without evidence changes, one-child recovery; console axe/reflow at 1440/390.');
}
