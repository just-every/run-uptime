import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
export async function proveMemberControls({origin,cookie,accept,call,DB}){
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext(),[name,...parts]=cookie.split('=');await context.addCookies([{name,value:parts.join('='),url:origin}]);const page=await context.newPage();
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/settings');
   const panel=page.locator('#access-member-controls');await panel.getByText('Invite a member',{exact:true}).click();const invite=panel.locator('[data-member-invite]');
   const self=await(await call('/api/access/self',undefined,{cookie})).json(),own=panel.locator(`[data-member-id="${self.id}"]`);
   await own.locator('summary').click();await own.getByLabel('Role',{exact:true}).selectOption('admin');
   const denied=page.waitForResponse(r=>r.url().endsWith(`/api/access/members/${self.id}`)&&r.request().method()==='POST');await own.getByRole('button',{name:'Save assignment',exact:true}).click();assert.equal((await denied).status(),409);
   await panel.getByRole('status').filter({hasText:'Another administrator'}).waitFor();assert.equal((await call(`/api/access/members/${self.id}`,{role:'admin',scopes:[]},{cookie})).status,409,'same self-assignment refused at direct route');
   await own.locator('summary').click();
   let reader,fixtureNumber=width===1440?100:200;
   for(const role of ['admin','editor','responder','read-only']){
    const fixtureName=`synthetic-uptime-${++fixtureNumber}`,email=fixtureName+'@example.test';
    await invite.getByLabel('Name',{exact:true}).fill(fixtureName);await invite.getByLabel('Email',{exact:true}).fill(email);await invite.getByLabel('Role',{exact:true}).selectOption(role);
    const sent=page.waitForResponse(r=>r.url().endsWith('/api/access/invitations')&&r.request().method()==='POST');await invite.getByRole('button',{name:'Send invitation',exact:true}).click();assert.equal((await sent).status(),202);
    await panel.getByRole('status').filter({hasText:'Invitation sent.'}).waitFor();const person=await accept(email);
    const self=await call('/api/access/self',undefined,{cookie:person.cookie});assert.equal((await self.json()).role,role);
    if(role==='read-only')reader=person;
   }
   // Reload reads the accepted Base lifecycle, then assign and narrow both scope kinds.
   await page.reload();const row=panel.locator(`[data-member-id="${reader.id}"]`);await row.locator('summary').click();
   const form=row.locator('form');await form.getByLabel('Service scope (blank = all)',{exact:true}).fill('synthetic-service-a');await form.getByLabel('Team scope (blank = all)',{exact:true}).fill('synthetic-team-a');
   if(process.env.UPTIME_SCREENSHOTS){await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});await panel.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`member-scopes-${width}.png`)})}
   await form.getByRole('button',{name:'Save assignment',exact:true}).click();await panel.getByRole('status').filter({hasText:'Assignment saved.'}).waitFor();
   const narrowed=await call('/api/access/self',undefined,{cookie:reader.cookie});assert.deepEqual((await narrowed.json()).scopes,[{kind:'service',value:'synthetic-service-a'},{kind:'team',value:'synthetic-team-a'}]);
   await row.locator('summary').click();const before=(await DB.prepare('SELECT * FROM uptime_member_roles WHERE operator_id=?').bind(reader.id).first());
   await row.getByRole('button',{name:'Save assignment',exact:true}).click();await panel.getByRole('status').filter({hasText:'Assignment unchanged.'}).waitFor();assert.deepEqual(await DB.prepare('SELECT * FROM uptime_member_roles WHERE operator_id=?').bind(reader.id).first(),before);
   await row.locator('summary').click();await row.getByRole('button',{name:'Remove member',exact:true}).click();await panel.getByRole('status').filter({hasText:'Member removed.'}).waitFor();assert.equal((await call('/api/access/self',undefined,{cookie:reader.cookie})).status,401);
   await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.UPTIME_SCREENSHOTS){await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});await panel.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`member-lifecycle-${width}.png`)})}
  }
 }finally{await browser.close()}
 console.log('ACCESS-001 Settings PASS: Base email-link invitations for all four roles, live service/team scope narrowing, no-op save and removal at 1440/390 with axe/reflow.');
}
