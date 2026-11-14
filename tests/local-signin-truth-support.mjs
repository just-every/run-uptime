import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openGate} from './auth-test-support.mjs';
import {proveReadOnlyConsole} from './access-member-controls-browser-support.mjs';
import {completeBrowserSecondFactor} from './mfa-auth-support.mjs';

// Part of COMMAND-JOURNEY's real local installation, with its actual
// development mail adapter. Do not use the mail-provider test fixture here.
export async function proveLocalSignInTruth({browser,page,origin,key,runRer,output}){
 const checks=[];
 if(output)await mkdir(output,{recursive:true});
 const unsigned=await browser.newContext({viewport:{width:1440,height:1000}});
 try{
  const visitor=await unsigned.newPage();
  await visitor.goto(origin+'/');
  const lobby=await visitor.locator('main').innerText();
  assert.doesNotMatch(lobby,/persona|choose (?:a |an |your )?(?:local )?account/i,'fresh Lobby does not promise an unavailable account picker');
  assert.match(lobby,/RER_OPEN/,'Lobby explains the private terminal handoff');
  await visitor.getByRole('link',{name:'Sign in',exact:true}).click();
  // Follow the gate's displayed CLI guidance instead of pinning its wording.
  const command=(await visitor.locator('code').allTextContents()).map(text=>text.trim().split(/\s+/)).filter(([program,verb])=>program==='rer'&&verb==='dev').at(-1);
  assert.ok(command,'the sign-in gate supplies an executable local launch command');
  assert.equal(await visitor.locator('input[type=email]').count(),0,'the gated page does not promise an email form');
  assert.equal((await unsigned.request.get(origin+'/api/overview')).status(),401);
  const launched=await runRer(command.slice(1)),link=launched.match(/^RER_OPEN (http:\/\/\S+)$/m)?.[1];
  assert.ok(link,'the displayed command returns a private sign-in handoff');
  assert.equal(new URL(link).origin,origin,'the handoff belongs to this installation');
  const handoff=await browser.newContext({viewport:{width:1440,height:1000}});
  try{
   const opened=await handoff.newPage();await opened.goto(link);
   await opened.waitForURL(url=>!['/__dev/key','/signin','/login'].includes(url.pathname));
   const pending=await handoff.request.get(origin+'/auth/session');assert.equal(pending.status(),403,'the terminal handoff preserves the owner\'s second-factor gate');
   assert.equal((await pending.json()).code,'second_factor_required');
   await completeBrowserSecondFactor(opened,origin);
   const actual=await handoff.request.get(origin+'/auth/session');assert.equal(actual.status(),200,'the displayed command opens a native session after the enrolled factor');
   const expected=await(await page.request.get(origin+'/auth/session')).json();
   assert.equal((await actual.json()).operator.id,expected.operator.id,'the handoff signs in as this installation\'s owner');
  }finally{await handoff.close()}
  checks.push({screen:'signed-out',width:1440,matchingHandoff:true,privateAPI:401});
  // One-width behavioral journey; optional screenshots are the separate
  // candidate proof, once per changed screen at desktop and phone widths.
  if(output)for(const width of [1440,390]){
   await visitor.setViewportSize({width,height:1000});
   for(const [path,name] of [['/','lobby'],['/login','login']]){
    await visitor.goto(origin+path);await visitor.screenshot({path:join(output,`after-${name}-${width}.png`),fullPage:true});
    checks.push({screen:name,width,overflow:await visitor.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
   }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/app/settings/people');
  const card=page.locator('#people-accounts'),form=card.locator('[data-member-invite]');
  for(const [index,role] of ['member','responder','read-only'].entries()){
   const email=`synthetic-uptime-${811+index}@example.test`,name=`Synthetic local ${role}`;
   await form.getByLabel('Email',{exact:true}).fill(email);await form.getByLabel('Name',{exact:true}).fill(name);await form.getByLabel('Role',{exact:true}).selectOption(role);
   const path=role==='member'?'/auth/invite':'/api/access/invitations';
   const pending=page.waitForResponse(r=>r.url()===origin+path&&r.request().method()==='POST');
   await form.getByRole('button',{name:'Send invite',exact:true}).click();const result=await pending;
   assert.equal(result.status(),202,'existing invitation door still records the account');
   const response=await result.json();
   await card.getByRole('status').filter({hasText:/recorded/i}).waitFor();
   const notice=await card.getByRole('status').textContent();
   assert.match(notice,/no (?:email|mail) was sent|not delivered/i,'development success is not delivery');
   assert.doesNotMatch(notice,/invitation sent/i,'no success claim without mail handoff');
   assert.match(notice,/RER_OPEN/,'explains the existing installation handoff');
   assert.match(notice,/\/signin/,'names the existing account picker behind that handoff');
   assert.doesNotMatch(notice,/[?&#](?:token|code|rer-dev)=|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i,'feedback exposes no invitation credential or opaque account ID');
   assert.equal('token' in response||'code' in response||'id' in response,false,'invitation response discloses no authority');
   const people=await(await page.request.get(origin+'/auth/operators')).json();
   assert.equal(people.find(person=>person.email===email)?.status,'invited','account remains pending until existing sign-in accepts it');
   assert.equal((await unsigned.request.get(origin+'/api/overview')).status(),401,'recording an invitation grants no session to a fresh browser');
   checks.push({screen:'people',role,width:1440,HTTP:result.status(),recorded:true,delivered:false,pending:true});
   if(output&&role==='responder')for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await card.screenshot({path:join(output,`after-people-${width}.png`)});
    checks.push({screen:'people-proof',width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
   }
  }
  // Follow the advertised path using only the test installation's own gate.
  // It does not send email or invent a new invitation/session mechanism.
  const invited=await browser.newContext({viewport:{width:1440,height:1000}});
  try{
   await openGate(invited,origin,key);const p=await invited.newPage();await p.goto(origin+'/signin');
   await p.getByRole('link',{name:/Synthetic local responder/}).click();
   await p.waitForURL(url=>url.pathname.startsWith('/app'));
   const session=await invited.request.get(origin+'/auth/session');assert.equal(session.status(),200);
   assert.equal((await session.json()).operator.email,'synthetic-uptime-812@example.test','existing local sign-in selects the invited account');
   const people=await(await page.request.get(origin+'/auth/operators')).json();assert.equal(people.find(person=>person.email==='synthetic-uptime-812@example.test')?.status,'active');
   checks.push({screen:'local-picker',existingDoor:true,invitedAccountAccepted:true});
   // Reuse the documented picker for the role that promises monitoring reads.
   await p.goto(origin+'/signin');
   await p.getByRole('link',{name:/Synthetic local read-only/}).click();
   await p.waitForURL(url=>url.pathname.startsWith('/app'));
   const created=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'synthetic-uptime-local-reader',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000}}});
   assert.equal(created.status(),201);const monitor=await created.json();
   assert.equal((await page.request.post(origin+'/api/monitors/'+monitor.id+'/run',{headers:{origin},data:{}})).status(),200);
   checks.push(await proveReadOnlyConsole({page:p,origin,monitorId:monitor.id,output}));
  }finally{await invited.close()}
  if(output)await writeFile(join(output,'browser-receipt.json'),JSON.stringify({journey:'COMMAND-JOURNEY local invitation and sign-in truth',checks},null,2)+'\n');
  console.log('LOCAL-SIGNIN-TRUTH PASS: both local invitation doors disclose non-delivery, pending accounts and private handoff; fresh Lobby/login agree; existing gated picker admits invited account.');
 }finally{await unsigned.close();await page.setViewportSize({width:1440,height:1000})}
}
