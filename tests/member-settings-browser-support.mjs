import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {inviteDoorMember} from './access-door-support.mjs';
import {finishSetup} from './auth-test-support.mjs';

// Extends the existing routing-console registration: native invited people can
// manage only their own email consent, and settings never offer forbidden tools.
export async function proveMemberSettings(f,ok,output){
 await finishSetup(f.origin,f.cookie);
 await f.monitor({name:'synthetic-uptime-member-settings',enabled:false});
 const other=await ok('/api/notifications/destinations',{name:'Synthetic other email',kind:'email',address:'synthetic-uptime-other@example.test',enabled:true});
 const browser=await chromium.launch({headless:true,...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 const receipts=[];
 try{
  for(const role of ['responder','editor','read-only','admin']){
   const label='uptime-settings-'+role,member=await inviteDoorMember(f.origin,f.cookie,role,label);
   const contact=await ok('/api/notifications/destinations',{name:'Synthetic '+role+' email',kind:'email',address:`synthetic-${label}@example.test`,enabled:true});
   const team=await ok('/api/routing/teams',{name:'Synthetic '+role+' team',enabled:true,memberIds:[member.id],expectedRevision:0});
   const context=await browser.newContext({viewport:{width:1440,height:1000}}),[name,...parts]=member.cookie.split('=');
   await context.addCookies([{name,value:parts.join('='),url:f.origin}]);const page=await context.newPage(),errors=[],denials=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('response',response=>{if(response.status()===403&&new URL(response.url()).pathname.startsWith('/api/'))denials.push(new URL(response.url()).pathname)});
   const screen=async path=>{await page.goto(f.origin+path);await page.locator('html.signed-in').waitFor();await page.locator('.console-identity').waitFor();const identity=await page.locator('.console-identity').innerText();assert.ok(identity.includes('Synthetic '+label),'shell shows the native invited name');assert.ok(identity.toLowerCase().includes(role),'shell shows the effective product role')};
   try{
    await screen('/app/settings/alerts');const consent=page.locator(`[data-consent="${contact.id}"]`);await consent.waitFor();
    await page.locator(`[data-team="${team.id}"]`).waitFor();
    if(role!=='admin')assert.equal(await page.locator('#add-destination,#alert-team-add,[data-edit-team],#default-route,#root-cause-categories,#sent-alerts').count(),0,'members see their own settings without workspace administration');
    const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/routing/recipient'&&r.request().method()==='POST');await consent.check();assert.equal((await saved).status(),200);
    await page.reload();await page.locator('html.signed-in').waitFor();await consent.waitFor();assert.equal(await consent.isChecked(),true,'personal consent survives a full reload');
    const own=await(await context.request.get(f.origin+'/api/routing/recipient')).json();assert.equal(own.destinations.find(d=>d.id===contact.id).optedIn,true);
    const forbidden=await context.request.post(f.origin+'/api/routing/recipient',{headers:{origin:f.origin},data:{destinationId:other.id,enabled:true}});assert.equal(forbidden.status(),403,'one person cannot consent to another email');
    await screen('/app/settings/integrations');assert.equal(await page.locator('#metrics-key-open,#business-import-enabled').count(),0);
    await screen('/app/settings/backup');
    if(role==='admin'){
     await page.locator('#export').waitFor();assert.equal(await page.locator('#monitor-files input').count(),0,'administrator sees no owner-only monitor import');
     const downloading=page.waitForEvent('download');await page.locator('#definition-export').click();const download=await downloading;
     const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.ok(exported.monitors.some(m=>m.name==='synthetic-uptime-member-settings'),'administrator can still export saved monitors');
    }
    else assert.equal(await page.locator('#export,#restore,#monitor-files input,#monitor-files button').count(),0,'members see no backup or import controls');
    if(role!=='admin')for(const area of ['general','people']){await screen('/app/settings/'+area);assert.equal(await page.locator('#content-area input,#content-area select,#content-area button').count(),0)}
    await screen('/app/monitors');
    assert.deepEqual(errors,[],'member settings have no page errors');assert.deepEqual(denials,[],'navigation never requests forbidden settings');
    receipts.push({role,nameShown:true,roleShown:true,ownConsentPersists:true,foreignConsentRefused:true,pageErrors:errors,automaticForbiddenRequests:denials});
    // Assertions run once at 1440; optional evidence captures the changed screens
    // once at each width, including the Responder's complete Settings menu.
    if(output&&['responder','admin'].includes(role))for(const width of [1440,390]){
     await page.setViewportSize({width,height:1000});
     for(const area of role==='admin'?['alerts','integrations','backup']:['monitors','alerts','general','people','integrations','backup']){
      await page.goto(f.origin+(area==='monitors'?'/app/monitors':'/app/settings/'+area));await page.locator('html.signed-in').waitFor();
      if(area==='alerts')await page.locator('[data-consent]').waitFor();
      await mkdir(output,{recursive:true});await page.screenshot({path:join(output,`after-${role==='admin'?'admin-':''}${area}-${width}.png`),fullPage:true});
     }
    }
   }finally{await context.close()}
  }
 }finally{await browser.close()}
 if(output)await writeFile(join(output,'member-settings-receipt.json'),JSON.stringify({assertionWidth:1440,roles:receipts,externalNetwork:false},null,2)+'\n');
 console.log('Member settings passed: native identity, personal consent persistence, foreign-email refusal and role-gated settings for four roles.');
}
