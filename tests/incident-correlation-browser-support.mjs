import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {inviteDoorMember} from './access-door-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {finishSetup} from './auth-test-support.mjs';

// Invoked unconditionally by the existing browser-enabled contact-schedules journey.
export async function proveOwnIncidentCorrelationConsole({f,monitors,link}){
 await finishSetup(f.origin,f.cookie);
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
  const context=await browser.newContext();
  const [name,...value]=f.cookie.split('=');await context.addCookies([{name,value:value.join('='),url:f.origin}]);
  const responder=await inviteDoorMember(f.origin,f.cookie,'responder',`uptime-${link}-ownership`);await completeSecondFactor(f.origin,responder.cookie);
  const page=await context.newPage();
  await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort());
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(f.origin+`/app/monitors/${monitors[0].id}`);await page.locator('html.signed-in').waitFor();
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
   await dialog.getByRole('button',{name:'Close incident notes',exact:true}).click();await dialog.waitFor({state:'detached'});await context.addCookies([{name,value:value.join('='),url:f.origin}]);
  }
 }finally{await browser?.close()}
 console.log('FOLLOWUP-001 console PASS correlation group and next-due notification at 1440/390, axe and reflow.');
}
