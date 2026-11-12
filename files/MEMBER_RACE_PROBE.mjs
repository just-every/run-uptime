import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '/workspace/run-uptime/node_modules/playwright/index.mjs';
import {migratedWorker} from '/workspace/run-uptime/tests/notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,finishSetup} from '/workspace/run-uptime/tests/auth-test-support.mjs';
import {completeSecondFactor} from '/workspace/run-uptime/tests/mfa-auth-support.mjs';
const directory=await mkdtemp(join(tmpdir(),'u-race-')),origin='http://127.0.0.1:15517',bindings={...testAuthBindings,UPTIME_ORIGIN:origin};let worker,browser,release;
try{
 ({worker}=await migratedWorker({port:15517,persist:directory,bindings}));const call=authRequest(origin),cookie=sessionCookie(await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'synthetic-uptime-race'}));await finishSetup(origin,cookie);await completeSecondFactor(origin,cookie);
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1440,height:1000}}),[name,...parts]=cookie.split('=');await context.addCookies([{name,value:parts.join('='),url:origin}]);const page=await context.newPage();
 let held;const blocked=new Promise(resolve=>held=resolve),gate=new Promise(resolve=>release=resolve);
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/api/credentials'&&route.request().method()==='GET'){held();await gate}await route.continue()});
 await page.goto(origin+'/app/settings/people');const security=page.locator('#access-member-controls #security-controls');await security.locator('[data-factor-state]').getByText(/Second factors/).waitFor();await blocked;await security.getByText('Manage second factors',{exact:true}).click();
 let rotations=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/access/mfa/recovery/rotate')rotations++});
 await security.getByRole('button',{name:'Replace recovery codes',exact:true}).click();
 release();await page.waitForResponse(r=>new URL(r.url()).pathname==='/api/credentials'&&r.request().method()==='GET');
 // Drain the completed browser task, with no timer or repeat action.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 if(process.argv.includes('--expect-fix')){await security.locator('[data-secret-once] pre').waitFor();assert.equal(rotations,1);await security.getByRole('button',{name:'I saved this',exact:true}).click();assert.equal(await security.locator('[data-secret-once] pre').count(),0);
 if(process.env.UPTIME_SCREENSHOTS){const {mkdir}=await import('node:fs/promises');await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});await page.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,'member-controls-'+width+'.png'),fullPage:true})}}
 console.log('PASS: one click during pending key-list read rotates recovery codes once, displays them, and clears the saved codes.')}else{assert.equal(rotations,0);assert.equal(await security.locator('[data-secret-once] pre').count(),0);console.log('REPRODUCED: recovery click discarded while initial key-list read holds busy; no rotation request or shown secret.');}
}finally{release?.();await browser?.close();await worker?.dispose();await rm(directory,{recursive:true,force:true})}
