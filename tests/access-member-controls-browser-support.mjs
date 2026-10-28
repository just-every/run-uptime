import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {chromium} from 'playwright';
export async function proveMemberControls({origin,cookie,accept,call,DB}){
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext(),[name,...parts]=cookie.split('=');await context.addCookies([{name,value:parts.join('='),url:origin}]);const page=await context.newPage();
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const factor=await completeSecondFactor(origin,cookie);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/settings/people');
   const panel=page.locator('#access-member-controls');
   const stepup=async(action,method,path,body={role:'read-only',scopes:[]})=>{await DB.prepare('UPDATE uptime_mfa_proofs SET verified_at=?').bind(Date.now()-300001).run();const direct=await fetch(origin+path,{method,headers:{origin,cookie,'content-type':'application/json'},...(method==='DELETE'?{}:{body:JSON.stringify(body)})});assert.equal(direct.status,403);assert.equal((await direct.json()).code,'fresh_second_factor_required');let writes=0;const count=response=>{if(response.url()===origin+path&&response.request().method()===method&&response.ok())writes++};page.on('response',count);await action();const verify=panel.locator('[data-stepup]'),field=verify.getByLabel('Authenticator or recovery code',{exact:true});await field.waitFor();assert.equal(await field.evaluate(e=>e===document.activeElement),true);const reason=panel.locator('[data-security-status]');assert.ok((await reason.textContent()).trim());for(const node of [reason,field]){const box=await node.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=page.viewportSize().height)}await field.fill('000000');await verify.getByRole('button',{name:'Verify code',exact:true}).click();await verify.getByText(/code didn't match/).waitFor();assert.equal(await field.inputValue(),'000000');assert.equal(writes,0);await shot(path.endsWith('/invitations')?'invitation-verify':method==='DELETE'?'removal-verify':'assignment-verify');await field.fill(factor.recoveryCodes.shift());await verify.getByRole('button',{name:'Verify code',exact:true}).click();return ()=>{page.off('response',count);assert.equal(writes,1,'pending member write completes exactly once')}};
   const shot=async step=>{if(process.env.UPTIME_SCREENSHOTS){const out=join(process.env.UPTIME_SCREENSHOTS,'G2');await mkdir(out,{recursive:true});await page.screenshot({path:join(out,step+'-'+width+'.png')})}};
   const security=panel.locator('#security-controls');await security.locator('[data-factor-state]').getByText(/Second factors/).waitFor();await security.getByText('Manage second factors',{exact:true}).click();await security.getByRole('button',{name:'Replace recovery codes',exact:true}).click();const shown=security.locator('[data-secret-once] pre');await shown.waitFor();factor.recoveryCodes=(await shown.textContent()).trim().split('\n');await security.getByRole('button',{name:'I saved this',exact:true}).click();assert.equal(await security.locator('[data-security-status]').count(),1);assert.equal(await security.locator('[data-security-status]').evaluate(e=>e.isConnected),true);
   await panel.getByText('Invite a member',{exact:true}).click();const invite=panel.locator('[data-member-invite]');
   const self=await(await call('/api/access/self',undefined,{cookie})).json(),own=panel.locator(`[data-member-id="${self.id}"]`);
   await own.locator('summary').click();await own.getByLabel('Role',{exact:true}).selectOption('admin');
   const denied=page.waitForResponse(r=>r.url().endsWith(`/api/access/members/${self.id}`)&&r.request().method()==='POST');await own.getByRole('button',{name:'Save assignment',exact:true}).click();assert.equal((await denied).status(),409);
   await panel.getByRole('status').filter({hasText:'Another administrator'}).waitFor();assert.equal((await call(`/api/access/members/${self.id}`,{role:'admin',scopes:[]},{cookie})).status,409,'same self-assignment refused at direct route');
   await own.locator('summary').click();
   let reader,fixtureNumber=width===1440?100:200;
   for(const role of ['admin','editor','responder','read-only']){
    const fixtureName=`synthetic-uptime-${++fixtureNumber}`,email=fixtureName+'@example.test';
    await invite.getByLabel('Name',{exact:true}).fill(fixtureName);await invite.getByLabel('Email',{exact:true}).fill(email);await invite.getByLabel('Role',{exact:true}).selectOption(role);
    const sent=page.waitForResponse(r=>r.url().endsWith('/api/access/invitations')&&r.request().method()==='POST'&&r.status()===202);let sentOnce;if(role==='admin')sentOnce=await stepup(()=>invite.getByRole('button',{name:'Send invitation',exact:true}).click(),'POST','/api/access/invitations',{email,displayName:fixtureName,role,scopes:[],returnTo:'/app'});else await invite.getByRole('button',{name:'Send invitation',exact:true}).click();assert.equal((await sent).status(),202);if(sentOnce)sentOnce();
    await panel.getByRole('status').filter({hasText:'Invitation sent.'}).waitFor();const person=await accept(email);
    const self=await call('/api/access/self',undefined,{cookie:person.cookie});assert.equal((await self.json()).role,role);
    if(role==='read-only')reader=person;
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
 console.log('ACCESS-001 Settings PASS: Base email-link invitations for all four roles, live service/team scope narrowing, no-op save and removal at 1440/390 with axe/reflow.');
}
