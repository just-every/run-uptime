import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {authRequest,deliveredLink,sessionCookie,finishSetup} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';

// Extends the correlated lifecycle, with native invitation, fresh email sign-in,
// actual second-factor UI and the scoped console. No imported browser sessions.
export async function incidentConsole(){
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 let context,page,member,editor,assignmentEntries;
 const inspect=async({f,monitors,ids,phase,detail})=>{
  const read=async id=>{const r=await f.request('/api/v1/incidents/'+encodeURIComponent(id),{headers:{cookie:member.cookie}});assert.equal(r.status,200);return r.data};
  if(!context){
   await finishSetup(f.origin,f.cookie);
   const invite=async(role,label,scopes=[])=>{
    const email=['synthetic-uptime-'+label,'example.test'].join('@');
    assert.equal((await f.request('/api/access/invitations',{body:{email,displayName:'Synthetic '+label,role,scopes}})).status,202);
    const call=authRequest(f.origin),link=await deliveredLink(call,{email,kind:'invite'});
    const cookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
    const factor=await completeSecondFactor(f.origin,cookie),identity=await f.request('/api/access/self',{headers:{cookie}});
    assert.equal(identity.status,200);return {...identity.data,cookie,email,factor};
   };
   // Team narrowing selects these two correlated monitors and excludes the dependency.
   member=await invite('responder','followup-responder',[{kind:'team',value:'synthetic-uptime-406'}]);
   editor=await invite('editor','followup-editor');
   context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();
   await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort());
   await page.goto(f.origin+'/login');
   await page.getByLabel('Email address',{exact:true}).fill(member.email);
   const sent=page.waitForResponse(r=>r.url()===f.origin+'/auth/magic-link'&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Send sign-in link',exact:true}).click();assert.equal((await sent).status(),303);
   const link=await deliveredLink(authRequest(f.origin),{email:member.email});
   await page.goto(link.href);await page.getByRole('button',{name:'Confirm',exact:true}).click();
   await page.goto(f.origin+'/app');
   await page.getByLabel('Authenticator or recovery code',{exact:true}).fill(member.factor.recoveryCodes.shift());
   await page.getByRole('button',{name:'Verify and continue',exact:true}).click();
   await page.locator('html.signed-in').waitFor();
   await page.getByRole('heading',{name:'Incident follow-up',exact:true}).waitFor();
   const workspace=await context.request.get(f.origin+'/api/response-workspace');assert.equal(workspace.status(),200);
   assert.deepEqual((await workspace.json()).monitors.map(row=>row.id).sort(),monitors.map(row=>row.id).sort(),'scoped console omits unrelated monitors');
   assert.equal((await context.request.get(f.origin+'/api/overview')).status(),403,'workspace overview stays forbidden');
   assert.equal((await context.request.get(f.origin+'/app/settings/people')).status(),403,'workspace settings stay forbidden');
   await page.locator(`[data-incident-work="${ids[0]}"]`).click();
   for(const ownerId of [member.id,editor.id]){
    const dialog=page.locator('#incident-work-dialog');
    await dialog.locator('[name=ownerId]').selectOption(ownerId);
    await dialog.getByRole('button',{name:'Assign owner',exact:true}).click();
    await dialog.locator('[data-incident-status]').filter({hasText:'Incident owner saved.'}).waitFor();
   }
   const assigned=await read(ids[0]);assignmentEntries=assigned.timeline.filter(row=>row.kind==='owner_assigned');
   assert.deepEqual(assignmentEntries.map(row=>row.data.owner.id),[member.id,editor.id]);
   assert.ok(assignmentEntries.every(row=>row.actor.id===member.id&&row.at>0));
   await page.locator('[data-close-incident]').click();
  }
  // Reload through the document gate after every Worker restart, rather than
  // retaining an already-open privileged console.
  await page.goto(f.origin+'/app/monitors');await page.locator('html.signed-in').waitFor();
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   await page.locator(`[data-incident-work="${ids[0]}"]`).click();
   const dialog=page.locator('#incident-work-dialog');await dialog.locator('[data-incident-status]').filter({hasText:'Incident loaded.'}).waitFor();
   const current=await read(ids[0]);
   assert.deepEqual(current.timeline.filter(row=>row.kind==='owner_assigned'),assignmentEntries,'both assignments retain actor, time and order after restart');
   assert.ok(current.timeline.every((row,i,rows)=>row.at>0&&row.actor.displayName&&(!i||rows[i-1].at<=row.at)));
   const due=dialog.locator('.ui-dl > div').filter({has:page.locator('dt',{hasText:'Next scheduled follow-up'})});
   if(current.nextDue!==null){
    assert.equal(await due.locator('time').getAttribute('datetime'),new Date(current.nextDue).toISOString(),'rendered next-due time equals READAPI exact route time');
    const visible=await due.locator('time').textContent();
    assert.equal(visible,await page.evaluate(at=>new Date(at).toLocaleString(),current.nextDue));
    assert.match(await due.textContent(),current.nextDueKind==='escalation'?/Escalation/:/Reminder/);
   }else assert.equal(await due.locator('time').count(),0);
   const timeline=await dialog.locator('.incident-timeline').innerText();
   for(const kind of [...new Set(current.timeline.map(row=>row.kind))])assert.ok(timeline.includes(kind.replaceAll('_',' ')),kind+' is rendered');
   assert.ok(timeline.includes('Synthetic followup-responder'));assert.ok(timeline.includes('Synthetic followup-editor'));
   if(phase!=='escalation')assert.ok(current.timeline.some(row=>row.kind==='acknowledged'&&row.data.channel==='console'&&row.actor.id));
   if(phase==='one-recovered'){
    assert.equal(current.machineState,'recovered');assert.ok(timeline.includes('recovery'));
    const sibling=await read(ids[1]);assert.equal(sibling.machineState,'open');
   }
   const layout=await dialog.evaluate(node=>({overflow:document.documentElement.scrollWidth>innerWidth||node.scrollWidth>node.clientWidth,
    small:[...node.querySelectorAll('*')].filter(el=>el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).filter(el=>parseFloat(getComputedStyle(el).fontSize)<13).length}));
   assert.equal(layout.overflow,false);assert.equal(layout.small,0);
   if(process.env.UPTIME_FOLLOWUP_SHOTS){await mkdir(process.env.UPTIME_FOLLOWUP_SHOTS,{recursive:true});await page.screenshot({path:join(process.env.UPTIME_FOLLOWUP_SHOTS,phase+'-'+width+'.png')})}
   await page.locator('[data-close-incident]').click();
  }
  console.log('PROBE FOLLOWUP-001 2: native responder sign-in, MFA, scoped console and READAPI -> assignments retained; '+phase+' exact next-due and timeline at 1440 and 390');
 };
 return {inspect,async close(){await browser.close()}};
}
