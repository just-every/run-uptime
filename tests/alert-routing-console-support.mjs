import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {inviteDoorMember} from './access-door-support.mjs';
// ROUTING-001 console journey: two teams and production and staging routes are configured through the console (Settings ›
// Alerts and the monitor's route dialog) at 1440 and 390, then read back through the API and exercised through the
// sample and drill doors. Every browser date is pinned: the context runs in America/New_York and the samples name dates.
export async function proveRoutingConsole(f,ok){
 const member=await inviteDoorMember(f.origin,f.cookie,'read-only','uptime-console-member',[{kind:'service',value:'Console routing'}]);
 const memberCall=(path,body)=>f.request(path,{body,headers:{cookie:member.cookie}});
 const memberMail=await ok('/api/notifications/destinations',{name:'Console member mail',kind:'email',address:'synthetic-uptime-console-member@example.test',enabled:true});
 const ownerMail=await ok('/api/notifications/destinations',{name:'Console owner mail',kind:'email',address:f.bindings.OWNER_EMAIL,enabled:true});
 assert.equal((await memberCall('/api/routing/recipient',{destinationId:memberMail.id,enabled:true})).status,200);
 const browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 const screens=process.env.UPTIME_SCREENSHOTS??join(f.directory,'screens');await mkdir(screens,{recursive:true});
 try{
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'America/New_York'}),page=await context.newPage();
   try{
    await browserSignIn(page,f.origin);
    const fits=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`${name} fits at ${width}`);await page.screenshot({path:join(screens,`routing-${name}-${width}.png`)})};
    // Teams and the owner's own opt-in are made in Settings › Alerts.
    await page.goto(f.origin+'/app/settings/alerts');
    const card=page.locator('#alert-teams');await card.getByRole('heading',{name:'Alert teams'}).waitFor();
    const makeTeam=async(name,person)=>{
     await card.getByRole('button',{name:'New team',exact:true}).click();const dialog=page.getByRole('dialog');
     await dialog.getByLabel('Team name').fill(name);await dialog.getByLabel(person).check();
     await dialog.getByRole('button',{name:'Save team',exact:true}).click();await dialog.waitFor({state:'detached'});
     await card.locator('.team-row',{hasText:name}).waitFor();
    };
    await makeTeam(`Production responders ${width}`,'Synthetic uptime-console-member');
    await makeTeam(`Staging responders ${width}`,'Test owner');
    await card.getByLabel(/Send me team alerts at Console owner mail/).check();
    await page.waitForFunction(async()=>(await (await fetch('/api/routing/recipient')).json()).destinations.some(d=>d.optedIn));
    await fits('teams');
    const teams=(await ok('/api/routing/teams')).teams;
    const prod=teams.find(t=>t.name===`Production responders ${width}`),stage=teams.find(t=>t.name===`Staging responders ${width}`);
    assert.deepEqual(prod.members.map(m=>m.operatorId),[member.id]);assert.equal(stage.members.length,1);
    // Production and staging routes are configured in each monitor's route dialog.
    const prodMonitor=await f.monitor({name:`Console production ${width}`,enabled:false,runners:[f.first],canary:true,service:'Console routing',environment:'production'});
    const stageMonitor=await f.monitor({name:`Console staging ${width}`,enabled:false,runners:[f.first],canary:true,service:'Console routing',environment:'staging'});
    const open=async monitor=>{await page.goto(f.origin+`/app/monitors/${monitor.id}#alerts`);const edit=page.getByRole('button',{name:'Edit alert route',exact:true});await edit.waitFor();await page.waitForFunction(()=>!document.querySelector('#edit-alert-route').disabled);await edit.click();const dialog=page.getByRole('dialog');await dialog.locator('#route-mode').waitFor();await dialog.locator('#route-mode').selectOption('selected');return dialog};
    const save=async dialog=>{await dialog.locator('#route-preview-button').click();await dialog.locator('#route-preview h3',{hasText:'Review recipients'}).waitFor();await fits('route-preview');await dialog.locator('#route-apply').click();await dialog.waitFor({state:'detached'})};
    let dialog=await open(prodMonitor);
    await dialog.getByLabel(`Production responders ${width}`).check();
    await dialog.locator('#route-limit-environments').check();await dialog.locator('#route-environments').fill('production');
    await dialog.locator('#route-limit-severities').check();await dialog.getByLabel('Critical (outage)').check();
    await dialog.locator('#route-hours-kind').selectOption('business');await dialog.locator('#route-hours-start').fill('09:00');await dialog.locator('#route-hours-end').fill('17:00');await dialog.locator('#route-hours-zone').fill('America/New_York');
    await fits('route-dialog');
    await save(dialog);
    const policy=async monitor=>(await ok(`/api/monitors/${monitor.id}/alert-route`)).policies.find(p=>p.scope==='monitor');
    let saved=await policy(prodMonitor);
    assert.deepEqual(saved.teamIds,[prod.id]);assert.deepEqual(saved.filters,{environments:['production'],severities:['critical']});assert.deepEqual(saved.quietHours,{timeZone:'America/New_York',start:'09:00',end:'17:00',businessDays:[1,2,3,4,5]});
    dialog=await open(stageMonitor);
    await dialog.getByLabel(`Staging responders ${width}`).check();
    await dialog.locator('#route-limit-environments').check();await dialog.locator('#route-environments').fill('staging');
    await save(dialog);
    saved=await policy(stageMonitor);assert.deepEqual(saved.teamIds,[stage.id]);assert.deepEqual(saved.filters,{environments:['staging']});assert.equal(saved.quietHours,null);
    // Reopening shows what the API holds, and an edit of another field keeps every other saved field.
    dialog=await open(prodMonitor);
    assert.equal(await dialog.getByLabel(`Production responders ${width}`).isChecked(),true);assert.equal(await dialog.locator('#route-hours-kind').inputValue(),'business');assert.equal(await dialog.locator('#route-environments').inputValue(),'production');
    await dialog.locator('#route-limit-severities').check();await dialog.getByLabel('Warning (Slow)').check();
    await save(dialog);
    saved=await policy(prodMonitor);assert.deepEqual(saved.filters,{environments:['production'],severities:['critical','warning']});assert.deepEqual(saved.teamIds,[prod.id]);assert.deepEqual(saved.quietHours.businessDays,[1,2,3,4,5]);
    // A directory that fails to load never empties what is saved: teams on a route and members of a team survive an unrelated edit.
    const unavailable=pattern=>page.route(pattern,r=>r.request().method()==='GET'?r.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'}):r.continue());
    const teamsRead=/\/api\/routing\/teams$/,directory=/\/api\/access\/members$/;
    await unavailable(teamsRead);
    dialog=await open(prodMonitor);
    await dialog.locator('#route-limit-origins').check();await dialog.getByLabel('Monitor check').check();
    await save(dialog);await page.unroute(teamsRead);
    saved=await policy(prodMonitor);assert.deepEqual(saved.teamIds,[prod.id],'a failed team read keeps the route teams');assert.deepEqual(saved.filters.origins,['monitor']);
    await unavailable(directory);
    await page.goto(f.origin+'/app/settings/alerts');const editProd=card.getByRole('button',{name:`Edit Production responders ${width}`,exact:true});await editProd.click();dialog=page.getByRole('dialog');
    await dialog.getByLabel('Team name').fill(`Production responders ${width}`);
    await dialog.getByRole('button',{name:'Save team',exact:true}).click();await dialog.waitFor({state:'detached'});await page.unroute(directory);
    assert.deepEqual((await ok('/api/routing/teams')).teams.find(t=>t.id===prod.id).members.map(m=>m.operatorId),[member.id],'a failed member directory keeps the team members');
    // The dialog's sample reads the saved business hours at pinned New York dates; its drill sends only to ready contacts.
    dialog=await open(prodMonitor);await dialog.getByText('Try this route',{exact:true}).click();
    const sample=async at=>{await dialog.locator('#route-try-at').fill(at);await dialog.locator('#route-try-sample').click();const row=dialog.locator('#route-try-result li',{hasText:'Console member mail'});await row.waitFor();return row.textContent()};
    assert.match(await sample('2027-01-11T10:00'),/Would be told now/);
    assert.match(await sample('2027-01-16T10:00'),/Held until quiet hours end/);
    await fits('route-try');
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    dialog=await open(stageMonitor);await dialog.getByText('Try this route',{exact:true}).click();
    const before=(await ok('/api/notifications')).deliveries.filter(j=>j.destinationId===ownerMail.id).length;
    await dialog.locator('#route-try-drill').click();await dialog.locator('#route-try-result li',{hasText:'Console owner mail'}).filter({hasText:'Drill queued'}).waitFor();
    assert.equal((await ok('/api/notifications')).deliveries.filter(j=>j.destinationId===ownerMail.id).length,before+1,'the drill reached only the team member who opted in');
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    // An API edit that omits the extended fields keeps them too.
    const input={scope:'monitor',mode:'selected',destinationIds:[],expectedRevision:(await policy(prodMonitor)).revision};
    const reviewed=await ok(`/api/monitors/${prodMonitor.id}/alert-route/preview`,input);await ok(`/api/monitors/${prodMonitor.id}/alert-route/apply`,{...input,digest:reviewed.digest});
    saved=await policy(prodMonitor);assert.deepEqual(saved.teamIds,[prod.id]);assert.deepEqual(saved.filters.severities,['critical','warning']);assert.equal(saved.quietHours.businessDays.length,5);
    await f.pause(prodMonitor);await f.pause(stageMonitor);
   }finally{await context.close()}
  }
 }finally{await browser.close()}
 // Every alert class, inside and outside each team's hours, through the saved routes at pinned instants: production's
 // team follows New York business hours, staging's a daily quiet window, and neither reaches the other's environment.
 const teams=(await ok('/api/routing/teams')).teams,prodTeam=teams.find(t=>t.name==='Production responders 390'),stageTeam=teams.find(t=>t.name==='Staging responders 390');
 const route=async(m,fields)=>{const path=`/api/monitors/${m.id}/alert-route`,input={scope:'monitor',mode:'selected',destinationIds:[],expectedRevision:(await ok(path)).policies[0].revision,...fields},p=await ok(path+'/preview',input);return ok(path+'/apply',{...input,digest:p.digest})};
 const prodAll=await f.monitor({name:'Console production classes',enabled:false,runners:[f.first],canary:true,service:'Console routing',environment:'production'});
 const stageAll=await f.monitor({name:'Console staging classes',enabled:false,runners:[f.first],canary:true,service:'Console routing',environment:'staging'});
 await route(prodAll,{teamIds:[prodTeam.id],filters:{environments:['production']},quietHours:{timeZone:'America/New_York',start:'09:00',end:'17:00',businessDays:[1,2,3,4,5]}});
 await route(stageAll,{teamIds:[stageTeam.id],filters:{environments:['staging']},quietHours:{timeZone:'America/New_York',start:'22:00',end:'07:00'}});
 const outcome=async(m,kind,at,id)=>(await ok(`/api/monitors/${m.id}/alert-route/sample`,{kind,regions:['local-a'],at:Date.parse(at)})).recipients.find(r=>r.id===id).outcome;
 for(const kind of ['trigger','slow','dependency']){
  assert.equal(await outcome(prodAll,kind,'2027-01-11T15:00:00Z',memberMail.id),'ready',`${kind}: Monday 10:00 New York`);
  assert.equal(await outcome(prodAll,kind,'2027-01-16T15:00:00Z',memberMail.id),'held_quiet',`${kind}: Saturday`);
  assert.equal(await outcome(prodAll,kind,'2027-01-12T03:00:00Z',memberMail.id),'held_quiet',`${kind}: Monday 22:00 New York`);
  assert.equal(await outcome(stageAll,kind,'2027-01-11T15:00:00Z',ownerMail.id),'ready',`${kind}: staging outside its quiet window`);
  assert.equal(await outcome(stageAll,kind,'2027-01-12T05:00:00Z',ownerMail.id),'held_quiet',`${kind}: staging inside its quiet window`);
 }
 assert.equal((await ok(`/api/monitors/${stageAll.id}/alert-route/sample`,{kind:'trigger',regions:['local-a'],at:Date.parse('2027-01-11T15:00:00Z')})).recipients.find(r=>r.id===memberMail.id).selected,false,'the production team is not told about staging');
 // A drill sends only to contacts the route reads as ready: held, filtered and unauthorised drills send nothing.
 const deliveries=async id=>(await ok('/api/notifications')).deliveries.filter(j=>j.destinationId===id).length;
 const sent=await deliveries(memberMail.id);
 const day=new Date().getUTCDay(),closed=await f.monitor({name:'Console closed drill',enabled:false,runners:[f.first],canary:true,service:'Console routing',environment:'production'});
 await route(closed,{teamIds:[prodTeam.id],filters:{},quietHours:{timeZone:'UTC',start:'00:00',end:'23:59',businessDays:[(day+1)%7]}});
 const held=await ok(`/api/monitors/${closed.id}/alert-route/drill`,{kind:'trigger'});
 assert.equal(held.results.find(r=>r.destinationId===memberMail.id).outcome,'held_quiet');
 const wrongEnvironment=await ok(`/api/monitors/${stageAll.id}/alert-route/drill`,{kind:'trigger',regions:['local-a']});
 assert.ok(!wrongEnvironment.results.some(r=>r.destinationId===memberMail.id),'a team outside the route is never drilled');
 assert.equal((await memberCall(`/api/monitors/${closed.id}/alert-route/drill`,{kind:'trigger'})).status,403,'a read-only member cannot send a drill');
 assert.equal(await deliveries(memberMail.id),sent,'held and unauthorised drills queued nothing for the production team');
 // A drill queued for a team member follows the member's live opt-in like a real team alert: revoking it before the send stops the drill.
 const open24=await f.monitor({name:'Console revoked drill',enabled:false,runners:[f.first],canary:true,service:'Console routing',environment:'production'});
 await route(open24,{teamIds:[prodTeam.id],filters:{},quietHours:null});
 const queued=await ok(`/api/monitors/${open24.id}/alert-route/drill`,{kind:'trigger'}),drilled=queued.results.find(r=>r.destinationId===memberMail.id);
 assert.equal(drilled.outcome,'queued');
 const stateOf=async id=>(await ok('/api/notifications')).deliveries.find(j=>j.id===id);
 assert.notEqual((await stateOf(drilled.deliveryId)).code,'team_recipient_ineligible','the drill waits while the opt-in is live');
 assert.equal((await memberCall('/api/routing/recipient',{destinationId:memberMail.id,enabled:false})).status,200);
 assert.deepEqual([(await stateOf(drilled.deliveryId)).state,(await stateOf(drilled.deliveryId)).code],['rejected','team_recipient_ineligible'],'a drill queued before the opt-in was revoked is never sent');
 for(const m of [prodAll,stageAll,closed,open24])await f.pause(m);
 console.log('ROUTING-001 console: two teams, production and staging routes, filters, business hours, sample and drill at 1440 and 390');
}
