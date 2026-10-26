import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {inviteDoorMember} from './access-door-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {finishSetup} from './auth-test-support.mjs';

// Invoked unconditionally by the existing browser-enabled contact-schedules journey.
export async function proveOwnIncidentCorrelationConsole({f,monitors,link,restart}){
 await finishSetup(f.origin,f.cookie);
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
  const context=await browser.newContext();
  const [name,...value]=f.cookie.split('=');await context.addCookies([{name,value:value.join('='),url:f.origin}]);
  const responder=await inviteDoorMember(f.origin,f.cookie,'responder',`uptime-${{service:701,dependency:702,group:703}[link]}`);await completeSecondFactor(f.origin,responder.cookie);
  const page=await context.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort());
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});const navigation=await page.goto(f.origin+`/app/monitors/${monitors[0].id}`);assert.equal(navigation.status(),200,`${link}/${width} owner document`);await page.locator('html.signed-in').waitFor();assert.deepEqual(pageErrors,[]);
   await page.getByRole('button',{name:'Notes and follow-up',exact:true}).click();
   const dialog=page.locator('#incident-work-dialog');await dialog.locator('[data-correlation-group]').waitFor();
   assert.match(await dialog.locator('[data-correlation-group]').textContent(),/synthetic-uptime-2/);await dialog.getByText(/^Notification · /).waitFor();
   await dialog.getByText('maintenance applied',{exact:true}).waitFor();await dialog.getByText('pause applied',{exact:true}).waitFor();
   // A live responder uses the already-open console; requests recheck Base,
   // rather than trusting the authority that rendered its document.
   const [rn,...rv]=responder.cookie.split('=');await context.addCookies([{name:rn,value:rv.join('='),url:f.origin}]);
   await dialog.locator('[data-assignment] select').selectOption(responder.id);await dialog.getByRole('button',{name:'Assign owner',exact:true}).click();await dialog.getByText('Incident owner saved.',{exact:true}).waitFor();
   const own=(await f.request('/api/access/self')).data;await dialog.locator('[data-assignment] select').selectOption(own.id);await dialog.getByRole('button',{name:'Assign owner',exact:true}).click();await dialog.getByText('Incident owner saved.',{exact:true}).waitFor();
   const detail=(await f.request('/api/v1/incidents/'+encodeURIComponent((await f.request('/api/monitors/'+monitors[0].id+'/incidents')).data[0].id))).data;
   assert.deepEqual(detail.timeline.filter(row=>row.kind==='owner_assigned').slice(-2).map(row=>[row.actor.id,row.data.owner.id]),[[responder.id,responder.id],[responder.id,own.id]]);
   assert.ok(!(await dialog.locator('[data-correlation-group]').textContent()).includes('synthetic-uptime-3'));
   await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});
   assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.UPTIME_SCREENSHOTS){await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});await dialog.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`correlation-${link}-${width}.png`)})}
   await context.addCookies([{name,value:value.join('='),url:f.origin}]);
   if(link==='service'){await dialog.getByRole('button',{name:'Close incident notes',exact:true}).click();await dialog.waitFor({state:'detached'});await page.getByRole('button',{name:'Notes and follow-up',exact:true}).click();await dialog.getByText('Incident loaded.',{exact:true}).waitFor();await dialog.getByText('Manage root-cause categories',{exact:true}).click();await dialog.getByRole('button',{name:'Add category',exact:true}).click();const category=dialog.locator('[data-category-id]').last(),label='synthetic-uptime-'+width;await category.getByLabel('Category label',{exact:true}).fill(label);await dialog.getByRole('button',{name:'Save category list',exact:true}).click();await dialog.getByText('Root-cause categories saved.',{exact:true}).waitFor();await dialog.getByText('Manage root-cause categories',{exact:true}).click();const row=dialog.locator('[data-category-id]').filter({has:page.locator('input[value="'+label+'"]')});
    assert.equal(await dialog.locator('[data-category-rows] input:not([type=checkbox])').evaluateAll(inputs=>inputs.filter(input=>{for(let e=input.parentElement;e&&!e.matches('form');e=e.parentElement){const s=getComputedStyle(e);if(parseFloat(s.borderTopWidth)||parseFloat(s.borderRightWidth)||parseFloat(s.borderBottomWidth)||parseFloat(s.borderLeftWidth))return true}return false}).length),0);
    assert.equal(await dialog.locator('.incident-category-remove').evaluateAll(labels=>labels.every(label=>{const box=label.getBoundingClientRect(),check=label.querySelector('input').getBoundingClientRect();return getComputedStyle(label).display==='flex'&&box.height>=44&&Math.abs(check.y+check.height/2-box.y-box.height/2)<1})),true);await dialog.getByText('Manage root-cause categories',{exact:true}).evaluate(e=>e.scrollIntoView({block:'start'}));
    if(process.env.UPTIME_SCREENSHOTS){const out=join(process.env.UPTIME_SCREENSHOTS,'G5');await mkdir(out,{recursive:true});await dialog.screenshot({path:join(out,'categories-'+width+'.png')})}await row.getByLabel('Remove from future choices',{exact:true}).check();await dialog.getByRole('button',{name:'Save category list',exact:true}).click();await dialog.getByText('Root-cause categories saved.',{exact:true}).waitFor();assert.ok(!(await f.request('/api/incident-settings')).data.categories.some(c=>c.label===label));}
   await dialog.getByRole('button',{name:'Close incident notes',exact:true}).click();await dialog.waitFor({state:'detached'});
  }
  const incidentId=(await f.request('/api/monitors/'+monitors[0].id+'/incidents')).data[0].id,endpoint='/api/v1/incidents/'+encodeURIComponent(incidentId),before=(await f.request(endpoint)).data.timeline;
  assert.ok(restart,'the existing console registration supplies a real Worker restart');await restart();const after=(await f.request(endpoint)).data.timeline;assert.deepEqual(after,before,'owner changes and applied timeline kinds retain their actor/time/data after restart');
  const assignments=after.filter(entry=>entry.kind==='owner_assigned');assert.equal(assignments.length,4,'both changes at each width remain in order');
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(f.origin+`/app/monitors/${monitors[0].id}`);await page.locator('html.signed-in').waitFor();await page.getByRole('button',{name:'Notes and follow-up',exact:true}).click();const dialog=page.locator('#incident-work-dialog');await dialog.getByText('Incident loaded.',{exact:true}).waitFor();
   const rows=dialog.locator('.incident-timeline li').filter({has:page.getByText('owner assigned',{exact:true})});assert.equal(await rows.count(),assignments.length);const clocks=await page.evaluate(values=>values.map(value=>new Date(value).toLocaleString()),assignments.map(entry=>entry.at));
   for(let i=0;i<assignments.length;i++){const text=await rows.nth(i).textContent();assert.ok(text.includes(assignments[i].actor.displayName));assert.ok(text.includes(assignments[i].data.owner.displayName));assert.ok(text.includes(clocks[i]))}
   await dialog.getByText('maintenance applied',{exact:true}).waitFor();await dialog.getByText('pause applied',{exact:true}).waitFor();await rows.last().scrollIntoViewIfNeeded();await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   if(process.env.UPTIME_SCREENSHOTS)await dialog.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`ownership-restart-${link}-${width}.png`)});await dialog.getByRole('button',{name:'Close incident notes',exact:true}).click();await dialog.waitFor({state:'detached'});
  }
 }finally{await browser?.close()}
 console.log('FOLLOWUP-001 console PASS correlation group and next-due notification at 1440/390, axe and reflow.');
}

export async function proveCombinedIncidentConsole({f,monitors,ids,phase,detail}){
 await finishSetup(f.origin,f.cookie);
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext(),[name,...parts]=f.cookie.split('=');await context.addCookies([{name,value:parts.join('='),url:f.origin}]);const page=await context.newPage();
  await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort());
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(f.origin+'/app/monitors/'+monitors[0].id);await page.locator('html.signed-in').waitFor();
   // The Incidents fold opens itself only while the monitor's incident is open (public/monitor-reads.js); once it has recovered, the owner opens the fold by its summary.
   if(phase==='one-recovered'){const fold=page.locator('details.fold#incidents');await fold.locator('.incident-record').first().waitFor({state:'attached'});assert.equal(await fold.evaluate(e=>e.open),false,'a recovered incident leaves the Incidents fold closed');await fold.locator(':scope > summary').click()}
   await page.getByRole('button',{name:'Notes and follow-up',exact:true}).click();const dialog=page.locator('#incident-work-dialog');await dialog.getByText('Incident loaded.',{exact:true}).waitFor();
   if(phase==='escalation'||phase==='reminder'){
    await dialog.getByText(new RegExp('^'+(phase==='escalation'?'Escalation':'Reminder')+' · ')).waitFor();
    const live=await page.request.get(f.origin+'/api/v1/incidents/'+encodeURIComponent(ids[0]));const read=await live.json();assert.equal(read.nextDue,detail.nextDue);assert.equal(read.nextDueKind,phase);
   }
   if(phase==='reminder'){await dialog.getByText('escalation attempt',{exact:true}).waitFor();await dialog.getByText('escalation outcome',{exact:true}).waitFor()}
   if(phase==='one-recovered'){assert.match(await dialog.textContent(),/Recovered/);assert.equal((await(await page.request.get(f.origin+'/api/v1/incidents/'+encodeURIComponent(ids[1]))).json()).machineState,'open')}
   await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);
   assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.UPTIME_SCREENSHOTS){await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});await dialog.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`combined-${phase}-${width}.png`)})}
   await dialog.getByRole('button',{name:'Close incident notes',exact:true}).click();await dialog.waitFor({state:'detached'});
  }
 }finally{await browser.close()}
 console.log(`FOLLOWUP-001 combined console ${phase} PASS at 1440/390 with shared READAPI next-due, axe and reflow.`);
}
