import assert from 'node:assert/strict';
import {auditNotificationView,assertTabsFit} from './notify-browser-audit.mjs';
import {notificationWireFake} from './notify-browser-wire.mjs';

export async function notificationJourney({page,origin,runnerKey,mailFake,evidence,pageErrors,grantPath}){
 const wire=await notificationWireFake(),checks=[];let scenarioWidth=1440;
 const overview=async()=>{const response=await page.request.get(origin+'/api/notifications',{maxRetries:3});assert.equal(response.status(),200);return response.json()};
 const card=name=>page.locator('.destination-card').filter({has:page.getByRole('heading',{name,exact:true})});
 async function snapshot(label){for(const width of [1440,390,320])checks.push(await auditNotificationView({page,label,width,evidence,pageErrors,grantPath}));await page.setViewportSize({width:scenarioWidth,height:900})}
 async function retainActionFocus(destination){
  const identities=await page.locator('.destination-controls button').evaluateAll(buttons=>buttons.map(button=>button.id));
  assert.ok(identities.every(Boolean),'every destination action has a stable identity');assert.equal(new Set(identities).size,identities.length,'destination action identities are unique');
  for(const [action,name] of [['edit','Edit'],['toggle','Disable'],['test','Send test'],['rotate','Rotate secret'],['delete','Delete']]){
   const button=card(destination.name).getByRole('button',{name,exact:true}),identity=`notification-${action}-${destination.id}`;
   assert.equal(await button.getAttribute('id'),identity);
   const previous=await button.evaluateHandle(element=>{element.focus();return element});
   // Wait for the application's real five-second refresh and DOM replacement;
   // no manual refresh, request interception or clock substitution is involved.
   const response=await page.waitForResponse(response=>response.url()===origin+'/api/overview'&&response.request().method()==='GET',{timeout:10000});
   assert.equal(response.status(),200);await response.finished();
   await page.waitForFunction(element=>!element.isConnected,previous,{timeout:5000});
   assert.equal(await page.evaluate(()=>document.activeElement?.id),identity,`${name} retains focus across a real poll at ${scenarioWidth}px`);
   await previous.dispose();
   checks.push({state:'notification-action-focus',width:scenarioWidth,action,identity,realPoll:true});
  }
 }
 async function dismissSecret(){
  const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:/Save the signing secret for/})});
  await dialog.waitFor();const secret=await dialog.locator('.one-time-secret').textContent();
  assert.ok(secret&&secret.length>=32,'one-time signing secret exists');
  await dialog.getByRole('button',{name:'I saved it — close'}).click();
  assert.equal(await page.locator('.one-time-secret').count(),0,'dismissed secret is removed from DOM');
  assert.equal(await page.evaluate(value=>document.body.textContent.includes(value),secret),false,'secret is absent after dismissal');
  return secret;
 }
 async function create(name,kind,address){
  await page.getByRole('button',{name:'Add destination',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Name',{exact:true}).fill(name);
  await dialog.getByLabel('Type',{exact:true}).selectOption(kind);
  await dialog.getByLabel(kind==='email'?'Email address':'Destination URL',{exact:true}).fill(address);
  await dialog.getByRole('button',{name:'Create destination',exact:true}).click();
  if(kind==='webhook')wire.setSecret(await dismissSecret());
  await card(name).waitFor();const state=await overview(),destination=state.destinations.find(item=>item.name===name);
  assert.ok(destination,'native UI persists a destination');assert.equal(destination.kind,kind);assert.equal(destination.enabled,true);
  assert.equal('url' in destination,false,'API safe list omits URL');assert.equal('signingSecret' in destination,false,'API safe list omits signing secret');
  if(kind==='slack'){assert.equal(await page.locator('.one-time-secret').count(),0,'Slack has no signing dialog');assert.equal(await card(name).getByRole('button',{name:'Rotate secret',exact:true}).count(),0,'Slack has no rotate control');const refused=await page.request.post(`${origin}/api/notifications/destinations/${destination.id}/rotate`,{data:{},maxRetries:3});assert.equal(refused.status(),400,'direct Slack rotation is rejected')}
  return destination;
 }
 async function send(destination){
  const responsePromise=page.waitForResponse(response=>response.url()===`${origin}/api/notifications/destinations/${destination.id}/test`&&response.request().method()==='POST');
  await card(destination.name).getByRole('button',{name:'Send test',exact:true}).click();
  const response=await responsePromise;assert.equal(response.status(),202);const queued=await response.json();
  const state=await overview(),delivery=state.deliveries.find(item=>item.id===queued.deliveryId);
  assert.ok(delivery);assert.equal(delivery.state,'queued');assert.equal(delivery.event.kind,'test');
  await page.locator('#action-notice').filter({hasText:'Test queued.'}).waitFor();
  const queuedCard=page.locator('.delivery-card').filter({hasText:destination.name}).filter({hasText:'queued'}).first();await queuedCard.waitFor();
  assert.match(await queuedCard.locator('.delivery-reason').textContent(),/waiting for the Uptime runner on your server.*last seen/i);
  assert.match(await page.locator('.notification-intro').textContent(),/Last contact:/);
  assert.ok(state.runnerContact.lastContactAt,'authenticated runner contact is persisted');
  return queued.deliveryId;
 }
 async function outcome(id,state){
  const current=await overview(),delivery=current.deliveries.find(item=>item.id===id);
  assert.equal(delivery.state,state,'real provider result is persisted');assert.ok(delivery.code,'bounded outcome reason code is retained');
  const historyCard=page.locator('.delivery-card').filter({hasText:delivery.destinationName}).filter({has:page.locator('.delivery-state').filter({hasText:new RegExp('^'+state.charAt(0).toUpperCase()+state.slice(1)+'$')})}).first();await historyCard.waitFor({timeout:12000});
  const reason=await historyCard.locator('.delivery-reason').textContent();
  assert.match(reason,state==='accepted'?/Provider accepted/:state==='uncertain'?/delivery is uncertain.*not be automatically resent/:/not accepted.*not be automatically resent/);
  await page.locator('.notification-intro strong').filter({hasText:'Fresh contact'}).waitFor();
 }
 try{
  await page.locator('[data-view=notifications]').click();
  for(scenarioWidth of [1440,390]){
  await page.setViewportSize({width:scenarioWidth,height:900});
  const mailBefore=mailFake.records.length,wireBefore=wire.records.length;wire.setMode('accepted');
  await page.getByRole('heading',{name:'Notification history',exact:true}).waitFor();
  const email=await create('Review email '+scenarioWidth,'email','qa-inbox@example.test');
  const webhook=await create('Signed JSON receiver '+scenarioWidth,'webhook',wire.webhook);
  const slack=await create('Slack receiver '+scenarioWidth,'slack',wire.slack);
  await retainActionFocus(webhook);
  await card(slack.name).getByRole('button',{name:'Disable',exact:true}).click();
  await card(slack.name).getByText('Slack incoming webhook · Disabled',{exact:true}).waitFor();
  assert.equal((await overview()).destinations.find(item=>item.id===slack.id).enabled,false);
  await card(slack.name).getByRole('button',{name:'Enable',exact:true}).click();
  await card(slack.name).getByText('Slack incoming webhook · Enabled',{exact:true}).waitFor();
  await card(email.name).getByRole('button',{name:'Edit',exact:true}).click();
  const edit=page.getByRole('dialog');for(const width of [1440,390,320])checks.push(await auditNotificationView({page,label:'edit-email-'+scenarioWidth,width,evidence,pageErrors}));await page.setViewportSize({width:scenarioWidth,height:900});await edit.getByLabel('Name',{exact:true}).fill('Review email updated '+scenarioWidth);
  await edit.getByRole('button',{name:'Save destination',exact:true}).click();email.name='Review email updated '+scenarioWidth;await card(email.name).waitFor();
  await card(webhook.name).getByRole('button',{name:'Rotate secret',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Rotate signing secret',exact:true}).click();wire.setSecret(await dismissSecret());
  await page.reload({waitUntil:'networkidle'});await page.locator('html.signed-in').waitFor();await page.locator('[data-view=notifications]').click();
  assert.equal(await page.locator('.one-time-secret').count(),0,'one-time secret does not reappear after reload');
  const safeText=await page.locator('body').innerText();assert.equal(safeText.includes(wire.slack),false,'Slack capability URL is not listed');assert.equal(safeText.includes(wire.webhook),false,'webhook URL is not listed');
  await snapshot('destinations-flow-'+scenarioWidth);
  const acceptedIds=[await send(email),await send(webhook),await send(slack)];
  await snapshot('notification-queued-flow-'+scenarioWidth);
  await wire.dispatch(origin,runnerKey,grantPath);for(const id of acceptedIds)await outcome(id,'accepted');
  assert.equal(mailFake.records.length,mailBefore+1,'actual Base SendGrid adapter made one outbound submission');
  assert.equal(wire.records.length,wireBefore+2,'real signed JSON and Slack request bytes reached owned receivers');
  assert.ok(wire.records.some(record=>record.eventType==='uptime.notification.test'));
  // Background refresh must preserve the durable native action feedback.
  assert.match(await page.locator('#action-notice').textContent(),/Test queued/);
  wire.setMode('rejected');const rejected=await send(webhook);await wire.dispatch(origin,runnerKey,grantPath);await outcome(rejected,'rejected');
  wire.setMode('uncertain');const uncertain=await send(slack);await wire.dispatch(origin,runnerKey,grantPath);await outcome(uncertain,'uncertain');
  await snapshot('notification-history-flow-'+scenarioWidth);
  const sent=wire.records.length;await wire.dispatch(origin,runnerKey,grantPath);assert.equal(wire.records.length,sent,'uncertain deliveries are never replayed');
  await card(slack.name).getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete destination',exact:true}).click();await card(slack.name).waitFor({state:'detached'});
  assert.ok(!(await overview()).destinations.some(item=>item.id===slack.id),'native deletion removes the active destination');
  assert.ok((await overview()).deliveries.some(item=>item.id===uncertain&&item.state==='uncertain'),'deletion retains historical delivery');
  }
  await snapshot('destinations');await snapshot('notification-history');
  for(const width of [390,320]){await page.setViewportSize({width,height:900});await assertTabsFit(page,width)}
  await page.setViewportSize({width:1440,height:900});
  return checks;
 }finally{await wire.close()}
}
