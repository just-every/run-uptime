import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),origin=process.argv[2],output=resolve(process.argv[3]);
const require=createRequire(join(root,'package.json')),{chromium}=require('playwright');
const {openGate,readCheckoutKey}=await import(pathToFileURL(join(root,'tests/auth-test-support.mjs')));
const {completeBrowserSecondFactor}=await import(pathToFileURL(join(root,'tests/mfa-auth-support.mjs')));
const {ownerProfileJourney,ownerAlertEmailJourney}=await import(pathToFileURL(join(root,'tests/owner-profile-browser-support.mjs')));
await mkdir(output,{recursive:true});
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const records=[];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 await openGate(context,origin,await readCheckoutKey(root));
 await page.goto(origin+'/auth/dev/enter?as=owner&returnTo=%2Fsetup');
 await page.waitForURL(url=>url.pathname==='/setup');
 await completeBrowserSecondFactor(page,origin);
 const shot=async(name,target=page)=>{
  await target.setViewportSize({width:1440,height:1000});
  assert.equal(await target.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' fits 1440');
  for(const width of [1440,390]){
   await target.setViewportSize({width,height:1000});await target.evaluate(()=>document.fonts.ready);
   await target.screenshot({path:join(output,name+'-'+width+'.png'),fullPage:true});
   records.push({name,width,overflow:await target.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  }
  await target.setViewportSize({width:1440,height:1000});
 };
 await page.getByLabel('Your name',{exact:true}).fill('Synthetic proof owner');
 await page.getByLabel('Your email',{exact:true}).fill('synthetic-uptime-proof@example.test');
 await page.getByLabel('What should we call this?',{exact:true}).fill('Synthetic workspace');
 await shot('setup');
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(url=>url.pathname.startsWith('/app'));
 const account=(await (await page.request.get(origin+'/auth/session')).json()).operator;
 assert.equal(account.displayName,'Synthetic proof owner');assert.equal(account.email,'synthetic-uptime-proof@example.test');
 await ownerProfileJourney(page,origin,output);
 await completeBrowserSecondFactor(page,origin);
 await ownerAlertEmailJourney(page,origin);await shot('alerts');
 const created=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'Synthetic proof monitor',type:'heartbeat',enabled:false,canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000}}});
 assert.equal(created.status(),201);
 await page.goto(origin+'/app/monitors');await page.getByText('Synthetic proof monitor',{exact:true}).first().waitFor();
 await page.getByText(/This copy runs only on this computer/).waitFor();await shot('monitors');
 const unsigned=await browser.newContext({viewport:{width:1440,height:1000}}),visitor=await unsigned.newPage();
 for(const [path,name] of [['/','lobby'],['/login','login']]){await visitor.goto(origin+path);await shot(name,visitor)}
 const marketing=await browser.newPage({viewport:{width:1440,height:1000}});await marketing.goto(process.argv[4]);await shot('front-page',marketing);await marketing.close();
 await unsigned.close();await context.close();
 await writeFile(join(output,'browser-receipt.json'),JSON.stringify({head,assertionWidth:1440,proofWidths:[1440,390],nativeSetup:true,ownerProfileAndInstallationPersistence:true,realSignInChoices:true,destinationRecipientRefresh:true,localOnlyNote:true,records},null,2)+'\n');
 console.log('FINAL-CANDIDATE-BROWSER PASS head='+head);
}finally{await browser.close()}
