import {proveImportEraseStepUp} from './monitor-stepup-support.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import jsQR from 'jsqr';
import {authenticatorCode} from './mfa-auth-support.mjs';
// Extends the existing operator-security registration through Settings and native APIs.
export async function proveDestinationStepUp({page,origin,call,cookie,DB}){
 const shot=async name=>{
  if(!process.env.UPTIME_SCREENSHOTS)return;
  await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});await page.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`${name}-${width}.png`),mask:[page.locator('[data-totp-qr]'),page.locator('[data-totp-uri]'),page.locator('[data-totp-secret]'),page.locator('[data-recovery-codes]')]})}
  await page.setViewportSize({width:1440,height:1000});
 };
 await page.goto(origin+'/app/settings/alerts');await page.locator('.alerts-area').waitFor();
 await page.getByRole('button',{name:'Add destination',exact:true}).click();const destination=page.locator('.destination-dialog');
 const email='synthetic-uptime-stepup@example.test';await destination.getByLabel('Email address',{exact:true}).fill(email);
 const refused=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/notifications/destinations'&&response.request().method()==='POST');
 await destination.getByRole('button',{name:'Create destination',exact:true}).click();const response=await refused;assert.equal(response.status(),403);const refusal=await response.json();assert.equal(refusal.code,'fresh_second_factor_required');assert.equal(refusal.stepUp.hasFactors,false);
 const prompt=page.locator('[data-stepup-dialog]');await prompt.waitFor();assert.equal(await prompt.locator('[data-stepup-guidance]').textContent(),refusal.stepUp.message);
 const link=prompt.getByRole('link',{name:'Add an authenticator',exact:true});assert.equal(await link.getAttribute('href'),refusal.stepUp.enrollmentUrl);
 // The link is a real public enrollment deep link, and the same link starts
 // enrollment within this pending action rather than abandoning its typed fields.
 const enrollmentPage=await page.context().newPage();await enrollmentPage.goto(new URL(refusal.stepUp.enrollmentUrl,origin).href);await enrollmentPage.locator('#security-controls [data-totp-secret]').waitFor();assert.equal(await enrollmentPage.getByLabel('Confirm authenticator code',{exact:true}).isVisible(),true);await enrollmentPage.close();
 await shot('destination-needs-enrollment');await link.click();const secret=await prompt.locator('[data-totp-secret]').textContent(),uri=await prompt.locator('[data-totp-uri]').getAttribute('href');const parsed=new URL(uri);assert.equal(parsed.protocol,'otpauth:');assert.equal(parsed.searchParams.get('secret'),secret);
 const pixels=await prompt.locator('[data-totp-qr]').evaluate(async image=>{await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=448;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,448,448);return Array.from(ctx.getImageData(0,0,448,448).data)});
 assert.equal(jsQR(new Uint8ClampedArray(pixels),448,448)?.data,uri,'QR scan yields exactly the authenticator URI');await shot('destination-enrollment');
 const code=prompt.getByLabel('Confirm authenticator code',{exact:true});await code.fill('wrong-code');await prompt.getByRole('button',{name:'Confirm authenticator',exact:true}).click();await prompt.getByRole('status').filter({hasText:/code didn't match/}).waitFor();assert.equal(await code.inputValue(),'wrong-code');
 await code.fill(authenticatorCode(secret));await prompt.getByRole('button',{name:'Confirm authenticator',exact:true}).click();await prompt.locator('[data-recovery-codes]').waitFor();const recovery=(await prompt.locator('[data-recovery-codes]').textContent()).split('\n');assert.equal(new Set(recovery).size,10);await prompt.getByRole('button',{name:'I saved this',exact:true}).click();await destination.waitFor({state:'detached'});
 const destinations=await (await call('/api/notifications/destinations',undefined,{cookie})).json();const saved=destinations.find(d=>d.address===email);assert.ok(saved,'enrollment resumes the original destination creation');
 await DB.prepare('UPDATE uptime_mfa_proofs SET verified_at=?').bind(Date.now()-300001).run();
 const direct=await call('/api/notifications/destinations',{kind:'email',name:'Synthetic stale refusal',address:email},{cookie});assert.equal(direct.status,403);const stale=await direct.json();assert.equal(stale.stepUp.hasFactors,true);
 await page.getByRole('button',{name:'Add destination',exact:true}).click();await destination.getByLabel('Email address',{exact:true}).fill('synthetic-uptime-resumed@example.test');await destination.getByRole('button',{name:'Create destination',exact:true}).click();await prompt.waitFor();assert.equal(await prompt.locator('[data-stepup-guidance]').textContent(),stale.stepUp.message);await prompt.getByLabel('Authenticator or recovery code',{exact:true}).fill('wrong-code');await prompt.getByRole('button',{name:'Verify code',exact:true}).click();await prompt.getByRole('status').filter({hasText:/code didn't match/}).waitFor();await shot('destination-needs-verification');
 await prompt.getByRole('button',{name:'Cancel',exact:true}).click();await prompt.waitFor({state:'detached'});await destination.getByRole('alert').filter({hasText:/cancelled/}).waitFor();assert.equal(await destination.getByLabel('Email address',{exact:true}).inputValue(),'synthetic-uptime-resumed@example.test');
 await destination.getByRole('button',{name:'Create destination',exact:true}).click();await prompt.waitFor();await prompt.getByLabel('Authenticator or recovery code',{exact:true}).fill(recovery.shift());await prompt.getByRole('button',{name:'Verify code',exact:true}).click();await destination.waitFor({state:'detached'});const all=await (await call('/api/notifications/destinations',undefined,{cookie})).json();assert.equal(all.filter(d=>d.address==='synthetic-uptime-resumed@example.test').length,1,'one destination created from the retained request');await shot('destination-created');
 await proveImportEraseStepUp({page,origin,call,cookie,DB,recovery});
 // Return to the existing suite's factorless baseline through the ordinary doors.
 for(const item of all)assert.equal((await fetch(origin+'/api/notifications/destinations/'+item.id,{method:'DELETE',headers:{origin,cookie}})).status,200);
 const state=await (await call('/api/access/mfa/status',undefined,{cookie})).json();for(const factor of state.factors)assert.equal((await fetch(origin+'/api/access/mfa/factors/'+factor.id,{method:'DELETE',headers:{origin,cookie}})).status,200);
 await page.goto(origin+'/app/settings/people');await page.locator('[data-factor-state]').getByText(/Second factors: 0/).waitFor();
 console.log('Destination step-up PASS: public refusal guidance/deep link, QR scan, enrollment, stale proof, wrong code, cancellation and one retained-request creation.');
}
