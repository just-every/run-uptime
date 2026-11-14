import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {completeSecondFactor,completeBrowserSecondFactor} from './mfa-auth-support.mjs';
import {deliveredLink} from './auth-test-support.mjs';
import {chromium} from 'playwright';
export async function proveMemberControls({origin,cookie,accept,call,DB}){
 const browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),[name,...parts]=cookie.split('=');await context.addCookies([{name,value:parts.join('='),url:origin}]);const page=await context.newPage();
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const factor=await completeSecondFactor(origin,cookie);
  for(const width of [1440]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/settings/people');
   const panel=page.locator('#access-member-controls');
   const stepup=async(action,method,path,body={role:'read-only',scopes:[]})=>{await DB.prepare('UPDATE uptime_mfa_proofs SET verified_at=?').bind(Date.now()-300001).run();const direct=await fetch(origin+path,{method,headers:{origin,cookie,'content-type':'application/json'},...(method==='DELETE'?{}:{body:JSON.stringify(body)})});assert.equal(direct.status,403);assert.equal((await direct.json()).code,'fresh_second_factor_required');let writes=0;const count=response=>{if(response.url()===origin+path&&response.request().method()===method&&response.ok())writes++};page.on('response',count);await action();const verify=panel.locator('[data-stepup]'),field=verify.getByLabel('Authenticator or recovery code',{exact:true});await field.waitFor();assert.equal(await field.evaluate(e=>e===document.activeElement),true);const reason=panel.locator('[data-security-status]');assert.ok((await reason.textContent()).trim());for(const node of [reason,field]){const box=await node.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=page.viewportSize().height)}await field.fill('000000');await verify.getByRole('button',{name:'Verify code',exact:true}).click();await verify.getByText(/code didn't match/).waitFor();assert.equal(await field.inputValue(),'000000');assert.equal(writes,0);await shot(path.endsWith('/invitations')?'invitation-verify':method==='DELETE'?'removal-verify':'assignment-verify');await field.fill(factor.recoveryCodes.shift());await verify.getByRole('button',{name:'Verify code',exact:true}).click();return ()=>{page.off('response',count);assert.equal(writes,1,'pending member write completes exactly once')}};
   const shot=async step=>{if(process.env.UPTIME_SCREENSHOTS){const out=join(process.env.UPTIME_SCREENSHOTS,'G2');await mkdir(out,{recursive:true});await page.screenshot({path:join(out,step+'-'+width+'.png')})}};
   const security=panel.locator('#security-controls');await security.locator('[data-factor-state]').getByText(/Second factors/).waitFor();await security.getByText('Manage second factors',{exact:true}).click();await security.getByRole('button',{name:'Replace recovery codes',exact:true}).click();const shown=security.locator('[data-secret-once] pre');await shown.waitFor();factor.recoveryCodes=(await shown.textContent()).trim().split('\n');await security.getByRole('button',{name:'I saved this',exact:true}).click();assert.equal(await security.locator('[data-security-status]').count(),1);assert.equal(await security.locator('[data-security-status]').evaluate(e=>e.isConnected),true);
   const invite=panel.locator('[data-member-invite]');
   const self=await(await call('/api/access/self',undefined,{cookie})).json(),own=panel.locator(`[data-member-id="${self.id}"]`);
   await own.locator('summary').click();await own.getByLabel('Role',{exact:true}).selectOption('admin');
   const denied=page.waitForResponse(r=>r.url().endsWith(`/api/access/members/${self.id}`)&&r.request().method()==='POST');await own.getByRole('button',{name:'Save assignment',exact:true}).click();assert.equal((await denied).status(),409);
   await panel.getByRole('status').filter({hasText:'Another administrator'}).waitFor();assert.equal((await call(`/api/access/members/${self.id}`,{role:'admin',scopes:[]},{cookie})).status,409,'same self-assignment refused at direct route');
   await own.locator('summary').click();
   let reader,fixtureNumber=width===1440?100:200;
   for(const role of ['admin','editor','responder','read-only']){
    const fixtureName=`synthetic-uptime-${++fixtureNumber}`,email=fixtureName+'@example.test';
    await invite.getByLabel('Name',{exact:true}).fill(fixtureName);await invite.getByLabel('Email',{exact:true}).fill(email);await invite.getByLabel('Role',{exact:true}).selectOption(role);
    const sent=page.waitForResponse(r=>r.url().endsWith('/api/access/invitations')&&r.request().method()==='POST'&&r.status()===202);let sentOnce;if(role==='admin')sentOnce=await stepup(()=>invite.getByRole('button',{name:'Send invite',exact:true}).click(),'POST','/api/access/invitations',{email,displayName:fixtureName,role,scopes:[],returnTo:'/app'});else await invite.getByRole('button',{name:'Send invite',exact:true}).click();assert.equal((await sent).status(),202);if(sentOnce)sentOnce();
    await panel.getByRole('status').filter({hasText:`Invitation sent to ${email}.`}).waitFor();const person=await accept(email);
    const self=await call('/api/access/self',undefined,{cookie:person.cookie});assert.equal((await self.json()).role,role);
    if(role==='read-only'){
     reader=person;
     const created=await call('/api/monitors',{name:'synthetic-uptime-reader-monitor',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000}},{cookie});
     assert.equal(created.status,201);const monitor=await created.json();
     assert.equal((await call('/api/monitors/'+monitor.id+'/run',{},{cookie})).status,200);
     const fresh=await browser.newContext({viewport:{width:1440,height:1000}});
     try{
      assert.equal((await call('/auth/magic-link',{email,returnTo:'/app/monitors'})).status,202);
      const link=await deliveredLink(call,{email});
      const readerPage=await fresh.newPage();await readerPage.goto(link.href);
      await readerPage.getByRole('button',{name:/confirm|sign in/i}).click();
      await readerPage.waitForURL(url=>url.pathname.startsWith('/app'));
      await completeBrowserSecondFactor(readerPage,origin);
      await proveReadOnlyConsole({page:readerPage,origin,monitorId:monitor.id});
     }finally{await fresh.close()}
    }
   }
   // Reload reads the accepted Base lifecycle, then assign and narrow both scope kinds.
   await page.reload();const row=panel.locator(`[data-member-id="${reader.id}"]`);await row.locator('summary').click();
   const form=row.locator('form');await form.getByLabel('Service scope (blank = all)',{exact:true}).fill('synthetic-service-a');await form.getByLabel('Team scope (blank = all)',{exact:true}).fill('synthetic-team-a');
   if(process.env.UPTIME_SCREENSHOTS){await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});await panel.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`member-scopes-${width}.png`)})}
   await form.getByLabel('Role',{exact:true}).selectOption('responder');const saved=await stepup(()=>form.getByRole('button',{name:'Save assignment',exact:true}).click(),'POST','/api/access/members/'+reader.id);await panel.getByRole('status').filter({hasText:'Assignment saved.'}).waitFor();saved();const line=panel.getByRole('status').filter({hasText:'Assignment saved.'});assert.equal(await line.evaluate((e,id)=>e.previousElementSibling?.dataset.memberId===id,reader.id),true);await shot('assignment-complete');
   const narrowed=await call('/api/access/self',undefined,{cookie:reader.cookie});assert.deepEqual((await narrowed.json()).scopes,[{kind:'service',value:'synthetic-service-a'},{kind:'team',value:'synthetic-team-a'}]);
   await row.locator('summary').click();const before=(await DB.prepare('SELECT * FROM uptime_member_roles WHERE operator_id=?').bind(reader.id).first());
   await row.getByRole('button',{name:'Save assignment',exact:true}).click();await panel.getByRole('status').filter({hasText:'Assignment unchanged.'}).waitFor();assert.deepEqual(await DB.prepare('SELECT * FROM uptime_member_roles WHERE operator_id=?').bind(reader.id).first(),before);
   await row.locator('summary').click();const removed=await stepup(()=>row.getByRole('button',{name:'Remove member',exact:true}).click(),'DELETE','/api/access/members/'+reader.id);await panel.getByRole('status').filter({hasText:'Member removed.'}).waitFor();removed();await shot('removal-complete');assert.equal((await call('/api/access/self',undefined,{cookie:reader.cookie})).status,401);
   await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.UPTIME_SCREENSHOTS){await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});await panel.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`member-lifecycle-${width}.png`)})}
  }
 }finally{await browser.close()}
 console.log('ACCESS-001 Settings PASS: Base email-link invitations for all four roles, live service/team scope narrowing, no-op save and removal at 1440 with axe/reflow.');
}


// The same invitation-to-monitor journey runs through emitted email-link sign-in
// and through the real dev account picker. Only the network mail edge is faked.
export async function proveReadOnlyConsole({page,origin,monitorId,output}){
 const request=page.context().request;
 const self=await request.get(origin+'/api/access/self');assert.equal(self.status(),200);
 const actor=await self.json();assert.equal(actor.role,'read-only');assert.deepEqual(actor.scopes,[]);
 const response=await request.get(origin+'/api/overview');assert.equal(response.status(),200);
 const overview=await response.json();
 assert.deepEqual(overview.access,{role:actor.role,scopes:actor.scopes,revision:actor.revision,monitoringOnly:true},'console and self use the live assignment');
 assert.equal('notifications' in overview,false,'monitoring reads disclose no destination configuration');
 assert.equal('grants' in overview.runner,false,'monitoring reads disclose no runner grants');
 const monitor=overview.monitors.find(m=>!monitorId||m.id===monitorId);assert.ok(monitor,'the invited person can read a workspace monitor');
 const id=monitor.id,key=encodeURIComponent(id);
 // A dev module graph and repeated proof captures can spend the public asset
 // bucket. Honor an observed Retry-After once, rather than disabling its limiter.
 const screen=async(path,selector,{reload=false}={})=>{
  let retryAt=0;
  const rate=response=>{if(response.status()===429&&/\.(?:js|css|svg|woff2)$/.test(new URL(response.url()).pathname)){
   const seconds=Number(response.headers()['retry-after']);if(Number.isFinite(seconds)&&seconds>=0)retryAt=Math.max(retryAt,Date.now()+seconds*1000);
  }};
  page.on('response',rate);
  const ready=()=>page.locator(selector).first().waitFor();
  try{
   if(reload)await page.reload();else await page.goto(origin+path);
   try{await ready()}catch(error){if(!retryAt)throw error;await page.waitForTimeout(Math.max(0,retryAt-Date.now())+100);await page.reload();await ready()}
  }finally{page.off('response',rate)}
 };
 await screen('/app/monitors','.monitor-link');
 await page.locator('.monitor-link').filter({hasText:monitor.definition.name}).first().waitFor();
 await screen('/app/monitors','.monitor-link',{reload:true});
 await page.locator('.monitor-link').filter({hasText:monitor.definition.name}).first().waitFor();
 await page.locator('.monitor-link').filter({hasText:monitor.definition.name}).first().click();
 await page.locator('#monitor-page').waitFor();
 const reads={};
 for(const suffix of ['history','revisions','incidents','heartbeat-runs']){
  const result=await request.get(origin+'/api/monitors/'+key+'/'+suffix);assert.equal(result.status(),200,suffix+' remains a monitoring read');reads[suffix]=await result.json();
 }
 assert.ok(reads.revisions.length,'immutable history is readable');
 assert.ok(reads.history.length,'the queued or completed check remains readable');
 await page.locator('#all-checks > summary').click();
 await page.locator('#raw-history .check-list, #raw-history .history-empty').first().waitFor();
 const before=await request.get(origin+'/api/monitors/'+key+'/revisions'),revisions=await before.json();
 const denied=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/monitors/'+key+'/run'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Run now',exact:true}).click();assert.equal((await denied).status(),403,'console cannot queue a check');
 for(const [method,path,data] of [
  ['POST','/api/monitors',{...monitor.definition,name:'synthetic-uptime-refused'}],
  ['PATCH','/api/monitors/'+key,{...monitor.definition,enabled:!monitor.definition.enabled}],
  ['POST','/api/monitors/'+key+'/run',{}],
  ['POST','/api/monitors/'+key+'/heartbeat-key',{}],
  ['POST','/api/monitors/'+key+'/erase',{name:monitor.definition.name}],
  ['DELETE','/api/monitors/'+key+'/report-schedules/synthetic-refused',undefined],
 ]){
  const result=await request.fetch(origin+path,{method,headers:{origin},...(data===undefined?{}:{data})});assert.equal(result.status(),403,method+' '+path+' refused');
 }
 assert.deepEqual(await(await request.get(origin+'/api/monitors/'+key+'/revisions')).json(),revisions,'refused console/API writes create no revision');
 const shot=async name=>{if(output){await mkdir(output,{recursive:true});await page.screenshot({path:join(output,name),fullPage:true})}};
 // Behavior is asserted at 1440. Optional proof captures each changed screen
 // once at desktop and phone width without running a second assertion journey.
 if(output)for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  await screen('/app/monitors','.monitor-link');await shot('after-readonly-list-'+width+'.png');
  await screen('/app/monitors/'+key,'#monitor-page');await shot('after-readonly-checks-'+width+'.png');
  await screen('/app/monitors/'+key+'?view=report&period=24h','#report-results .report-snapshot');await shot('after-readonly-report-'+width+'.png');
 }
 await page.setViewportSize({width:1440,height:1000});
 await screen('/app/monitors/'+key+'?view=report&period=24h','#report-results .report-snapshot');
 assert.equal(await page.locator('#report-error').isVisible(),false,'report does not require configuration authority');
 const report=await request.get(origin+'/api/v1/monitors/'+key+'/report?period=24h');assert.equal(report.status(),200);
 const receipt={screen:'read-only-console',role:actor.role,scopes:actor.scopes,revision:actor.revision,monitorVisible:true,reloadVisible:true,checkHistoryReadable:true,checkRows:reads.history.length,observations:reads.history.reduce((n,row)=>n+row.observations.length,0),reportReadable:true,consoleWrite:403,apiWrites:403,revisionsUnchanged:true};
 if(output)await writeFile(join(output,'readonly-console-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 return receipt;
}
