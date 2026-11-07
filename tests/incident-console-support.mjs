import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn,authRequest,deliveredLink} from './auth-test-support.mjs';
import {completeBrowserSecondFactor} from './mfa-auth-support.mjs';

// FOLLOWUP-001 through the signed-in console: the owner and a service-scoped responder
// each open the incident dialog of the combined-incident journey (tests/incident-combined-support.mjs),
// change its owner there, and every rendered follow-up line and timeline row is compared with READAPI-003.
const KIND={reminder:'Reminder',escalation:'Escalation',notification:'Notification'};
const wall=(page,ms)=>page.evaluate(value=>new Date(value).toLocaleString(),ms);
const axe=async page=>{
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
 await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
 assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[],'no serious accessibility findings');
};
export function incidentConsole({evidence=process.env.UPTIME_INCIDENT_EVIDENCE}={}){
 let browser,owner,responder,ownerPage,responderPage,ownerId,assigned=0;
 const api=(f,id,cookie=f.cookie)=>fetch(f.origin+'/api/v1/incidents/'+encodeURIComponent(id),{headers:{cookie}}).then(async r=>{assert.equal(r.status,200);return r.json()});
 async function page(f,viewport=1440){
  browser??=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--disable-gpu','--use-mock-keychain','--password-store=basic']});
  return (await browser.newContext({viewport:{width:viewport,height:900}})).newPage();
 }
 async function open(p,f,monitor,incident){
  await p.goto(f.origin+'/app/monitors/'+encodeURIComponent(monitor.id));await p.evaluate(()=>{location.hash='incidents'});
  await p.locator(`button[data-incident-work="${incident}"]`).click();
  const dialog=p.locator('#incident-work-dialog');await dialog.locator('[data-incident-status]').getByText('Incident loaded.').waitFor();return dialog;
 }
 // Rendered owner, response state, next-due kind and time, and every timeline row equal the API's account, in order.
 async function parity(p,dialog,detail){
  const line=name=>dialog.locator('.ui-dl > div').filter({has:p.locator('dt',{hasText:new RegExp('^'+name+'$')})}).locator('dd');
  assert.equal(await line('Owner').innerText(),detail.owner?.displayName??'Unassigned');
  assert.equal(await line('Response state').innerText(),detail.status);
  assert.equal(await line('Next scheduled follow-up').innerText(),detail.nextDue===null?detail.nextDueReason:KIND[detail.nextDueKind]+' · '+await wall(p,detail.nextDue));
  const rows=await dialog.locator('.incident-timeline li > p:first-child').allInnerTexts();
  const expected=await Promise.all(detail.timeline.map(async e=>`${e.kind.replaceAll('_',' ')} · ${e.actor.displayName} · ${await wall(p,e.at)}`));
  assert.deepEqual(rows,expected,'console timeline equals READAPI-003 timeline in order');
 }
 async function assignThroughConsole(p,dialog,f,incident,member){
  const before=(await api(f,incident)).timeline.filter(e=>e.kind==='owner_assigned').length;
  await dialog.getByLabel('Incident owner').selectOption({label:member.displayName});await dialog.getByRole('button',{name:'Assign owner'}).click();
  await dialog.locator('[data-incident-status]').getByText('Incident owner saved.').waitFor();
  const detail=await api(f,incident),changes=detail.timeline.filter(e=>e.kind==='owner_assigned');
  assert.equal(changes.length,before+1);assert.equal(changes.at(-1).data.owner.id,member.id);assert.equal(detail.owner.id,member.id);
  await parity(p,dialog,detail);assigned++;return changes.at(-1);
 }
 async function enroll(f,monitor){
  const label="incident-console-responder",email=`${label}@example.test`,call=authRequest(f.origin);
  const invited=await f.request('/api/access/invitations',{body:{email,displayName:'Console Responder',role:'responder',scopes:[{kind:'service',value:monitor.definition.service}]}});assert.equal(invited.status,202,JSON.stringify(invited.data));
  const link=await deliveredLink(call,{email,kind:'invite'}),p=await page(f);
  await p.goto(link.href);await p.getByRole('button',{name:/confirm|sign in/i}).click();await completeBrowserSecondFactor(p,f.origin);
  const identity=await (await fetch(f.origin+'/api/access/self',{headers:{cookie:(await p.context().cookies(f.origin)).map(c=>c.name+'='+c.value).join('; ')}})).json();
  responder={id:identity.id,displayName:'Console Responder',cookie:(await p.context().cookies(f.origin)).map(c=>c.name+'='+c.value).join('; ')};responderPage=p;
 }
 async function inspect({f,monitors,ids,phase,detail}){
  const monitor=monitors[0],incident=ids[0];
  if(!ownerPage){ownerPage=await page(f);await browserSignIn(ownerPage,f.origin,{bindings:f.bindings,bootstrap:false});owner=await (await fetch(f.origin+'/api/access/self',{headers:{cookie:f.cookie}})).json()}
  if(phase==='escalation'){
   await enroll(f,monitor);
   const dialog=await open(ownerPage,f,monitor,incident);await parity(ownerPage,dialog,await api(f,incident));
   const change=await assignThroughConsole(ownerPage,dialog,f,incident,responder);assert.equal(change.actor.id,owner.id);
   await dialog.locator('[data-close-incident]').click();
  }else if(phase==='reminder'){
   // After the Worker restart: the owner's session still reads the incident, and the narrowed responder reaches it from a fresh sign-in.
   const dialog=await open(ownerPage,f,monitor,incident);await parity(ownerPage,dialog,await api(f,incident));await dialog.locator('[data-close-incident]').click();
   // Console entry is owner-only (default adopted for FOLLOWUP-001): the responder's own browser sign-in, with its second factor,
   // is refused at the shell without exposing any incident, while the same session takes ownership through the API door.
   await responderPage.goto(f.origin+'/app');await responderPage.getByText('Only an owner can access the Uptime console and setup.').waitFor();
   assert.equal(await responderPage.locator(`[data-incident-work]`).count(),0,'the refused shell exposes no incident');
   const read=await fetch(f.origin+'/api/incidents/'+encodeURIComponent(incident),{headers:{cookie:responder.cookie}});assert.equal(read.status,200,'responder reads the in-scope incident through the API door');
   const seen=await read.json();assert.equal(seen.owner.id,responder.id);assert.equal(seen.status,'acknowledged');
   assert.ok(seen.assignmentMembers.find(person=>person.id===owner.id),'responders can hand ownership to an eligible member');
   const moved=await fetch(f.origin+'/api/incidents/'+encodeURIComponent(incident)+'/actions',{method:'POST',headers:{cookie:responder.cookie,origin:f.origin,'content-type':'application/json'},body:JSON.stringify({kind:'assign',ownerId:owner.id,version:seen.version})});assert.equal(moved.status,200);
   const changes=(await api(f,incident)).timeline.filter(e=>e.kind==='owner_assigned');assert.equal(changes.at(-1).actor.id,responder.id);assert.equal(changes.at(-1).data.owner.id,owner.id);assigned++;
  }else if(phase==='final'){
   const dialog=await open(ownerPage,f,monitor,incident),final=await api(f,incident);await parity(ownerPage,dialog,final);
   const kinds=final.timeline.map(e=>e.kind),at=kind=>kinds.indexOf(kind);
   assert.equal(final.timeline.filter(e=>e.kind==='owner_assigned').length>=2,true,'both owner changes');
   assert.ok(final.timeline.every((e,i)=>e.at>0&&e.actor.displayName&&(!i||e.at>=final.timeline[i-1].at)),'every row has an actor and an ordered time');
   const ack=final.timeline.find(e=>e.kind==='acknowledged');assert.equal(ack.data.channel,'console');assert.ok(ack.actor.id);
   assert.ok(at('confirmation')===0&&at('confirmation')<at('owner_assigned')&&at('owner_assigned')<at('escalation_attempt')&&at('escalation_attempt')<at('escalation_outcome')&&at('escalation_outcome')<at('recovery'),'confirmation, owner change, attempts with outcomes, then recovery');
   assert.ok(final.timeline.filter(e=>e.kind==='owner_assigned').map(e=>e.actor.id).join()===[owner.id,responder.id].join(),'owner changes in order with their actors');
   const second=kinds.lastIndexOf('owner_assigned'),reminder=kinds.indexOf('notification_queued',second);
   assert.ok(at('escalation_outcome')<second&&reminder>second&&reminder<at('recovery'),'the due reminder follows the second owner change and precedes recovery');
   await axe(ownerPage);
   if(evidence){await mkdir(evidence,{recursive:true});await dialog.screenshot({path:join(evidence,'followup-incident-1440.png')})}
   await ownerPage.setViewportSize({width:390,height:844});await axe(ownerPage);await parity(ownerPage,dialog,final);
   if(evidence)await dialog.screenshot({path:join(evidence,'followup-incident-390.png')});
   await dialog.locator('[data-close-incident]').click();
  }
 }
 return {inspect,close:async()=>{await browser?.close()},assigned:()=>assigned};
}
