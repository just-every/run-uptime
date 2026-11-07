import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {inviteDoorMember} from './access-door-support.mjs';
// ROUTING-001 owner journey through the console and the API: two teams are made in Settings, a production route
// (US business hours) and a staging route (daily quiet window) are configured in the route editor, a console edit keeps
// every saved field, real outages reach only the matching team, a rotated contact stops counting, and the route check and
// route drill show selected, excluded and held recipients. The recipient edge and mail sender are the only fakes; both
// are never reached because queued jobs are inspected, not delivered.
const clock=offset=>new Date(Date.now()+offset).toISOString().slice(11,16);
export async function proveRoutingConsole(f,ok,screens){
 const owner=await ok('/api/access/self');
 const member=await inviteDoorMember(f.origin,f.cookie,'read-only','uptime-console-member',[{kind:'service',value:'Console payments'}]);
 const memberCall=(path,body)=>f.request(path,{body,headers:{cookie:member.cookie}});
 const memberEmail=await ok('/api/notifications/destinations',{name:'Synthetic console member mail',kind:'email',address:'synthetic-uptime-console-member@example.test',enabled:true});
 const ownerEmail=await ok('/api/notifications/destinations',{name:'Synthetic console owner mail',kind:'email',address:f.bindings.OWNER_EMAIL,enabled:true});
 assert.equal((await memberCall('/api/routing/recipient',{destinationId:memberEmail.id,enabled:true})).status,200);
 const prod=await f.monitor({name:'Console production',enabled:false,runners:[f.first],canary:true,service:'Console payments',environment:'production'});
 const stage=await f.monitor({name:'Console staging',enabled:false,runners:[f.first],canary:true,service:'Console payments',environment:'staging'});
 const route=id=>`/api/monitors/${id}/alert-route`,policy=async id=>(await ok(route(id))).policies.find(p=>p.scope==='monitor');
 const browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();await browserSignIn(page,f.origin);
  // 1. Two teams and the owner's own opt-in, in Settings › Alerts.
  await page.goto(f.origin+'/app/settings/alerts');
  page.on('console',m=>console.log('BROWSER',m.type(),m.text()));page.on('pageerror',e=>console.log('PAGEERROR',e.message));
  const teams=page.locator('#alert-teams');await teams.getByRole('button',{name:'Add team',exact:true}).click();
  await teams.locator('#alert-team-name').fill('Production responders');await teams.getByLabel(/Synthetic uptime-console-member/).check();await teams.getByRole('button',{name:'Save team',exact:true}).click();
  await teams.locator('[data-team]',{hasText:'Production responders'}).waitFor();
  await teams.getByRole('button',{name:'Add team',exact:true}).click();
  await teams.locator('#alert-team-name').fill('Staging responders');await teams.getByLabel(/Test owner/).check();await teams.getByRole('button',{name:'Save team',exact:true}).click();
  await teams.locator('[data-team]',{hasText:'Staging responders'}).waitFor();
  await teams.getByLabel(/Tell me at Synthetic console owner mail/).check();await page.waitForFunction(()=>document.querySelector('#alert-teams-status')?.textContent.includes('Saved'));
  await teams.scrollIntoViewIfNeeded();await page.screenshot({path:`${screens}/routing-teams-1440.png`});
  const saved=(await ok('/api/routing/teams')).teams,prodTeam=saved.find(t=>t.name==='Production responders'),stageTeam=saved.find(t=>t.name==='Staging responders');
  assert.deepEqual(prodTeam.members.map(m=>m.operatorId),[member.id]);assert.deepEqual(stageTeam.members.map(m=>m.operatorId),[owner.id]);
  assert.equal((await ok('/api/routing/recipient')).destinations.find(d=>d.id===ownerEmail.id).optedIn,true,'owner opt-in saved from the console');
  // 2. Production and staging routes in the route editor.
  const openRoute=async monitor=>{await page.goto(f.origin+`/app/monitors/${monitor.id}#alerts`);await page.getByRole('button',{name:'Edit alert route',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('#route-mode').waitFor();await dialog.locator('#route-mode').selectOption('selected');return dialog};
  const reviewAndApply=async dialog=>{await dialog.getByRole('button',{name:'Preview route',exact:true}).click();await dialog.locator('#route-preview').getByText('Review recipients').waitFor();await dialog.getByRole('button',{name:'Apply reviewed route',exact:true}).click();await dialog.waitFor({state:'detached'})};
  let dialog=await openRoute(prod);
  await dialog.locator('#route-targeting-fields').getByLabel('Production responders').check();
  await dialog.locator('#route-limit-environments').check();await dialog.locator('#route-environments').fill('production');
  await dialog.locator('#route-limit-severities').check();await dialog.locator('#route-severities-0').check();await dialog.locator('#route-severities-1').check();
  await dialog.locator('#route-limit-regions').check();await dialog.locator('#route-targeting-fields [data-filter=regions] input[data-filter-value]').first().check();
  await dialog.locator('#route-limit-origins').check();await dialog.locator('#route-origins-0').check();await dialog.locator('#route-origins-1').check();
  await dialog.locator('#route-quiet-kind').selectOption('business');await dialog.locator('#route-quiet-zone').fill('America/New_York');
  assert.equal(await dialog.locator('#route-quiet-start').inputValue(),'09:00');assert.equal(await dialog.locator('#route-quiet-end').inputValue(),'17:00');
  await dialog.locator('#route-targeting-fields').scrollIntoViewIfNeeded();await page.screenshot({path:`${screens}/routing-targeting-1440.png`});
  await reviewAndApply(dialog);
  let p=await policy(prod.id);
  assert.deepEqual(p.teamIds,[prodTeam.id]);assert.deepEqual(p.filters.environments,['production']);assert.deepEqual(p.filters.severities,['critical','warning']);assert.deepEqual(p.filters.origins,['monitor','slow']);assert.deepEqual(p.filters.regions,['local-a']);
  assert.deepEqual(p.quietHours,{timeZone:'America/New_York',start:'09:00',end:'17:00',openDays:[1,2,3,4,5]});
  // Staging: a daily window that is open now, edited in the console.
  const open={start:clock(2*3600000),end:clock(3*3600000)},quiet={start:clock(-3600000),end:clock(3600000)};
  dialog=await openRoute(stage);await dialog.locator('#route-targeting-fields').getByLabel('Staging responders').check();await dialog.locator('#route-limit-environments').check();await dialog.locator('#route-environments').fill('staging');
  await dialog.locator('#route-quiet-kind').selectOption('daily');await dialog.locator('#route-quiet-zone').fill('UTC');await dialog.locator('#route-quiet-start').fill(open.start);await dialog.locator('#route-quiet-end').fill(open.end);
  await reviewAndApply(dialog);
  p=await policy(stage.id);assert.deepEqual(p.teamIds,[stageTeam.id]);assert.deepEqual(p.filters,{environments:['staging']});assert.deepEqual(p.quietHours,{timeZone:'UTC',...open});
  // 3. A console edit that touches one dimension keeps teams, every other filter and the quiet policy; omission through the API does too.
  dialog=await openRoute(prod);await dialog.locator('#route-severities-1').uncheck();await reviewAndApply(dialog);
  const edited=await policy(prod.id);assert.deepEqual(edited.teamIds,[prodTeam.id]);assert.deepEqual(edited.filters.severities,['critical']);assert.deepEqual(edited.filters.regions,['local-a']);assert.deepEqual(edited.filters.origins,['monitor','slow']);assert.deepEqual(edited.quietHours.openDays,[1,2,3,4,5]);
  const bare={scope:'monitor',mode:'selected',destinationIds:[],expectedRevision:edited.revision},bareReview=await ok(route(prod.id)+'/preview',bare);await ok(route(prod.id)+'/apply',{...bare,digest:bareReview.digest});
  assert.deepEqual((await policy(prod.id)).teamIds,[prodTeam.id],'an API save that omits teams keeps them');
  // 4. US business hours across the week and a daylight-saving change, every alert class.
  const sample=(id,body)=>ok(route(id)+'/sample',body),outcome=async(id,destination,body)=>(await sample(id,body)).recipients.find(r=>r.id===destination).outcome;
  const base={kind:'trigger',regions:['local-a']};
  const at=iso=>({at:Date.parse(iso)});
  assert.equal(await outcome(prod.id,memberEmail.id,{...base,...at('2026-01-14T15:00:00Z')}),'ready','Wednesday 10:00 in New York is business hours');
  assert.equal(await outcome(prod.id,memberEmail.id,{...base,...at('2026-01-15T01:30:00Z')}),'held_quiet','Wednesday evening is held');
  assert.equal(await outcome(prod.id,memberEmail.id,{...base,...at('2026-01-10T15:00:00Z')}),'held_quiet','Saturday is held');
  const monday=await sample(prod.id,{...base,...at('2026-01-10T15:00:00Z')});assert.equal(monday.recipients.find(r=>r.id===memberEmail.id).quietUntil,Date.parse('2026-01-12T14:00:00Z'),'a weekend hold ends Monday 09:00 New York');
  assert.equal(await outcome(prod.id,memberEmail.id,{...base,...at('2026-03-06T13:30:00Z')}),'held_quiet','before the clock change 13:30 UTC is 08:30 in New York');
  assert.equal(await outcome(prod.id,memberEmail.id,{...base,...at('2026-03-09T13:30:00Z')}),'ready','after the clock change the same UTC time is 09:30 in New York');
  for(const kind of ['slow','dependency'])assert.equal(await outcome(prod.id,memberEmail.id,{...base,kind,...at('2026-01-14T15:00:00Z')}),'excluded',`${kind} is outside the production severity and origin filters or its class`);
  assert.equal(await outcome(prod.id,memberEmail.id,{kind:'trigger',regions:['local-b'],...at('2026-01-14T15:00:00Z')}),'excluded','an outage seen from another location is excluded');
  // 5. Real outages reach only the team whose route matches.
  const jobs=async id=>(await ok('/api/notifications')).deliveries.filter(j=>j.event.monitorId===id);
  f.modes.target=503;
  for(const m of [prod,stage]){await ok('/api/monitors/'+m.id,{...m.definition,enabled:true},{method:'PATCH'});const task=await f.claim(f.first);assert.equal(task.monitorId,m.id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);assert.equal((await f.state(m.id)).targetState,'Failing');await f.pause(m)}
  assert.deepEqual((await jobs(prod.id)).map(j=>j.destinationId),[memberEmail.id],'production outage reaches the production team only');
  assert.deepEqual((await jobs(stage.id)).map(j=>j.destinationId),[ownerEmail.id],'staging outage reaches the staging team only');
  // 6. The route check and drill in the console: staging, open window, then quiet window.
  const drills=async()=>(await ok('/api/notifications')).deliveries.filter(j=>j.destinationId===ownerEmail.id&&j.event.kind==='test').length;
  const check=async(monitor,{drill})=>{
   await page.goto(f.origin+`/app/monitors/${monitor.id}#alerts`);await page.getByRole('button',{name:'Edit alert route',exact:true}).click();const d=page.getByRole('dialog');await d.locator('#route-check').waitFor();
   await d.locator('#route-check').scrollIntoViewIfNeeded();await d.getByRole('button',{name:drill?'Send route drill':'Show who would be told',exact:true}).click();
   const result=d.locator('#route-check-result');await result.locator('.route-outcome').first().waitFor();const text=await result.innerText();await page.screenshot({path:`${screens}/routing-check-${drill?'drill':'sample'}-1440.png`});await d.getByRole('button',{name:'Close',exact:true}).click();return text;
  };
  const before=await drills();
  assert.match(await check(stage,{drill:false}),/Synthetic console owner mail[\s\S]*Would be told now/);
  assert.match(await check(stage,{drill:true}),/Drill queued/);assert.equal(await drills(),before+1,'the drill went to the staging team member');
  dialog=await openRoute(stage);await dialog.locator('#route-quiet-start').fill(quiet.start);await dialog.locator('#route-quiet-end').fill(quiet.end);await reviewAndApply(dialog);
  assert.match(await check(stage,{drill:true}),/Held for quiet hours/);assert.equal(await drills(),before+1,'a quiet-held contact is not drilled');
  // 7. Rotating the production member's destination removes them from the route until they opt in again.
  await ok(`/api/notifications/destinations/${memberEmail.id}`,{name:memberEmail.name,enabled:true,address:'synthetic-uptime-console-rotated@example.test'},{method:'PATCH'});
  const rotated=await sample(prod.id,{...base,...at('2026-01-14T15:00:00Z')});assert.equal(rotated.readyCount,0);assert.equal(rotated.recipients.find(r=>r.id===memberEmail.id).reason,'team_recipient_ineligible');
  await page.goto(f.origin+`/app/monitors/${prod.id}#alerts`);await page.getByRole('button',{name:'Edit alert route',exact:true}).click();dialog=page.getByRole('dialog');await dialog.locator('#route-check').waitFor();
  await dialog.locator('#route-check-at').fill('2026-01-14T10:00');await dialog.getByRole('button',{name:'Show who would be told',exact:true}).click();
  await dialog.locator('#route-check-result').getByText(/Team member not opted in/).waitFor();
  const before2=(await ok('/api/notifications')).deliveries.length;await dialog.getByRole('button',{name:'Send route drill',exact:true}).click();await dialog.locator('#route-check-result').getByText('0 drills queued').waitFor();
  assert.equal((await ok('/api/notifications')).deliveries.length,before2,'an excluded recipient is never drilled');await dialog.getByRole('button',{name:'Close',exact:true}).click();
  // 8. The phone layout of the editor.
  await page.setViewportSize({width:390,height:900});dialog=await openRoute(prod);
  assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth),'the route editor does not scroll sideways at 390');
  await dialog.locator('#route-targeting-fields').scrollIntoViewIfNeeded();await page.screenshot({path:`${screens}/routing-targeting-390.png`});await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.goto(f.origin+'/app/settings/alerts');await page.locator('#alert-teams').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'Settings alerts does not scroll sideways at 390');await page.screenshot({path:`${screens}/routing-teams-390.png`});
 }finally{await browser.close()}
 console.log('ROUTING-001 console journey: two teams, production business hours and staging quiet routes, preserved edits, real outages per team, rotation, check and drill');
}
