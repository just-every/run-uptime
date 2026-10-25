import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {migratedWorker} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie} from './auth-test-support.mjs';
import {authenticatorCode} from './mfa-auth-support.mjs';
import {inviteDoorMember} from './access-door-support.mjs';

// Folded into operator-security's existing factor registration. The authenticator
// is a CDP CTAP2 edge; every enrollment/challenge/key action uses the real console.
export async function proveSecurityControls(){
 for(const width of [1440,390]){
  const directory=await mkdtemp(join(tmpdir(),'uptime-security-console-')),origin='http://localhost:15503',bindings={...testAuthBindings,UPTIME_ORIGIN:origin};let worker,browser;
  try{
   ({worker}=await migratedWorker({port:15503,persist:directory,bindings}));let DB=await worker.getD1Database('DB');const call=authRequest(origin);
   const cookie=sessionCookie(await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'synthetic-uptime-601'}));
   assert.equal((await fetch(origin+'/setup',{method:'POST',redirect:'manual',headers:{origin,cookie}})).status,303);
   const monitorResponse=await call('/api/monitors',{name:'synthetic-uptime-602',url:'https://example.com/',enabled:false,tags:['synthetic-uptime-603']},{cookie});assert.equal(monitorResponse.status,201);const monitor=await monitorResponse.json();
   browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext(),[name,...parts]=cookie.split('=');await context.addCookies([{name,value:parts.join('='),url:origin}]);const page=await context.newPage();await page.setViewportSize({width,height:1000});
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
   await page.goto(origin+'/app/settings');const panel=page.locator('#security-controls');await panel.locator('[data-factor-state]').getByText(/Second factors: 0/).waitFor();
   const enroll=async()=>{
    const manage=panel.getByText('Manage second factors',{exact:true});if(!await manage.evaluate(e=>e.parentElement.open))await manage.click();
    await panel.getByRole('button',{name:'Enroll authenticator',exact:true}).click();const secret=await panel.locator('[data-totp-secret]').textContent();assert.ok(secret);
    await panel.getByLabel('Confirm authenticator code',{exact:true}).fill(authenticatorCode(secret));await panel.getByRole('button',{name:'Confirm authenticator',exact:true}).click();await panel.getByText('Authenticator enrolled.',{exact:true}).waitFor();
    const recovery=(await panel.locator('[data-secret-once] pre').textContent()).split('\n');assert.equal(new Set(recovery).size,10);await panel.getByRole('button',{name:'I saved this',exact:true}).click();assert.equal(await panel.locator('[data-totp-secret]').count(),0);assert.ok(!await panel.textContent().then(text=>text.includes(secret)||recovery.some(code=>text.includes(code))));return {secret,recovery};
   };
   const owner=await enroll();await panel.getByRole('button',{name:'Enroll passkey',exact:true}).click();await panel.getByText('Passkey enrolled.',{exact:true}).waitFor();
   const state=await(await call('/api/access/mfa/status',undefined,{cookie})).json();assert.deepEqual(state.factors.map(f=>f.kind).sort(),['totp','webauthn']);
   await DB.prepare('UPDATE uptime_mfa_proofs SET verified_at=?').bind(Date.now()-300001).run();
   const denied=await call('/api/access/mfa/policy',{required:true},{cookie});assert.equal(denied.status,403);const reason=(await denied.json()).error;
   await panel.getByLabel('Require second factors for all members',{exact:true}).check();await panel.getByRole('button',{name:'Save factor policy',exact:true}).click();await panel.getByText(reason,{exact:true}).waitFor();
   const verify=panel.locator('[data-stepup]');await verify.getByLabel('Authenticator or recovery code',{exact:true}).fill(owner.recovery.shift());await verify.getByRole('button',{name:'Verify code',exact:true}).click();await panel.getByText('Factor policy saved.',{exact:true}).waitFor();assert.equal((await(await call('/api/access/mfa/status',undefined,{cookie})).json()).required,true);
   const createSummary=panel.getByText('Create a monitoring or CI key',{exact:true});await createSummary.click();const form=panel.locator('[data-key-create]');
   await form.getByLabel('Name',{exact:true}).fill('synthetic-uptime-604');await form.getByLabel('Monitor IDs (one per line)',{exact:true}).fill(monitor.id);await form.getByLabel('Tags (one per line)',{exact:true}).fill('synthetic-uptime-603');await form.getByLabel('Expires at (local time)',{exact:true}).fill(new Date(Date.now()+3600000).toISOString().slice(0,16));
   await DB.prepare('UPDATE uptime_mfa_proofs SET verified_at=?').bind(Date.now()-300001).run();
   const direct=await call('/api/credentials',{name:'synthetic-uptime-605',scopes:['monitoring:read'],expiresAt:Date.now()+3600000,resources:{mode:'workspace',monitorIds:[],tags:[]}},{cookie});assert.equal(direct.status,403);assert.equal((await direct.json()).error,reason);
   await form.getByRole('button',{name:'Create key',exact:true}).click();await panel.getByText(reason,{exact:true}).waitFor();await verify.getByLabel('Authenticator or recovery code',{exact:true}).fill(owner.recovery.shift());await verify.getByRole('button',{name:'Verify code',exact:true}).click();await panel.getByText('Copy this key once',{exact:true}).waitFor();
   const token=await panel.locator('[data-secret-once] pre').textContent();await panel.getByRole('button',{name:'I saved this',exact:true}).click();
   assert.equal((await fetch(origin+'/api/v1/monitors/'+monitor.id,{headers:{authorization:'Bearer '+token}})).status,200);
   let keys=await(await call('/api/credentials',undefined,{cookie})).json(),key=keys.find(k=>k.name==='synthetic-uptime-604');assert.ok(key.lastUsedAt);assert.ok(!JSON.stringify(keys).includes(token));assert.ok(!await panel.textContent().then(text=>text.includes(token)));
   await form.getByLabel('Name',{exact:true}).fill('synthetic-uptime-606');await form.getByLabel('Key scope',{exact:true}).selectOption('ci-apply');await form.getByLabel('Monitor IDs (one per line)',{exact:true}).fill('');await form.getByLabel('CI environment',{exact:true}).fill('synthetic-uptime-607');await form.getByRole('button',{name:'Create key',exact:true}).click();await panel.getByText('Copy this key once',{exact:true}).waitFor();const ciToken=await panel.locator('[data-secret-once] pre').textContent();await panel.getByRole('button',{name:'I saved this',exact:true}).click();assert.ok(!JSON.stringify(await(await call('/api/credentials',undefined,{cookie})).json()).includes(ciToken));
   await page.reload();await panel.locator(`[data-credential-id="${key.id}"]`).waitFor();const row=panel.locator(`[data-credential-id="${key.id}"]`);await row.locator('summary').click();assert.match(await row.textContent(),/Last use/);assert.ok(!(await row.textContent()).includes('Never'));
   await row.getByRole('button',{name:'Revoke key',exact:true}).click();await panel.getByText('Key revoked. Further operations are refused.',{exact:true}).waitFor();assert.equal((await fetch(origin+'/api/v1/monitors/'+monitor.id,{headers:{authorization:'Bearer '+token}})).status,401);assert.match(await panel.locator(`[data-credential-id="${key.id}"]`).textContent(),/Revoked/);
   if(process.env.UPTIME_SCREENSHOTS){await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});await panel.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`security-keys-${width}.png`)})}
   await panel.getByLabel('Require second factors for all members',{exact:true}).uncheck();await panel.getByRole('button',{name:'Save factor policy',exact:true}).click();await panel.getByText('Factor policy saved.',{exact:true}).waitFor();
   // The CI key created above starts a real 21-record definitions job. Revoke
   // it after the native 20-record transaction, then inspect that exact job.
   const ciCall=(path,body,source)=>fetch(origin+path,{method:'POST',headers:{origin,authorization:'Bearer '+ciToken,'content-type':'application/json','x-uptime-environment':'synthetic-uptime-607',...(source?{'x-import-source':source}:{})},body:typeof body==='string'?body:JSON.stringify(body)});
   const document={format:'uptime.monitors',version:1,monitors:Array.from({length:21},(_,i)=>({name:`synthetic-uptime-${800+i}`,url:'https://example.com/',enabled:false,environment:'synthetic-uptime-607',tags:['synthetic-uptime-603']}))};
   const recognised=await ciCall('/api/definitions/recognise',JSON.stringify(document));assert.equal(recognised.status,200);const source=await recognised.json(),bytes=Buffer.from(JSON.stringify(source.text)+'\n'),hash=value=>createHash('sha256').update(value).digest('hex');
   const uploaded=await ciCall('/api/operator/import/uploads',{name:'definitions.ndjson',bundleSha256:hash(bytes),totalBytes:bytes.length,totalChunks:1,index:0,chunkSha256:hash(bytes),base64:bytes.toString('base64')},source.namespace);assert.equal(uploaded.status,200);const upload=await uploaded.json();
   const planned=await ciCall('/api/operator/import/plan',{uploadId:upload.uploadId},source.namespace);assert.equal(planned.status,200);const plan=await planned.json(),applyBody={planId:plan.planId,reviewedFingerprint:plan.fingerprint};assert.equal((await ciCall('/api/operator/import/apply',applyBody,source.namespace)).status,200);
   const ciKey=(await(await call('/api/credentials',undefined,{cookie})).json()).find(key=>key.name==='synthetic-uptime-606');let ciRow=panel.locator(`[data-credential-id="${ciKey.id}"]`);await ciRow.locator('summary').click();await ciRow.getByRole('button',{name:'Show definition jobs',exact:true}).click();await ciRow.getByText(/Authorized 20\/21/).waitFor();
   await ciRow.getByRole('button',{name:'Revoke key',exact:true}).click();await panel.getByText('Key revoked. Further operations are refused.',{exact:true}).waitFor();await ciRow.locator('summary').click();await ciRow.getByRole('button',{name:'Show definition jobs',exact:true}).click();const jobText=ciRow.getByText(/Key revoked/);await jobText.waitFor();const stoppedText=await jobText.textContent();assert.match(stoppedText,/stopped.*Authorized 20\/21.*Next operation: refused/);
   assert.equal((await ciCall('/api/operator/import/apply',applyBody,source.namespace)).status,401);
   await worker.dispose();({worker,DB}=await migratedWorker({port:15503,persist:directory,bindings}));await page.reload();ciRow=panel.locator(`[data-credential-id="${ciKey.id}"]`);await ciRow.locator('summary').click();await ciRow.getByRole('button',{name:'Show definition jobs',exact:true}).click();await ciRow.getByText(stoppedText,{exact:true}).waitFor();
   if(process.env.UPTIME_SCREENSHOTS)await panel.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`security-job-stopped-${width}.png`)});
   const manage=panel.getByText('Manage second factors',{exact:true});if(!await manage.evaluate(e=>e.parentElement.open))await manage.click();const ownerFactor=panel.locator('[data-factors] p').filter({hasText:'Authenticator'});await ownerFactor.getByRole('button',{name:'Remove factor',exact:true}).click();await panel.getByText('Factor removed.',{exact:true}).waitFor();assert.equal((await(await call('/api/access/mfa/status',undefined,{cookie})).json()).factors.length,1);
   const member=await inviteDoorMember(origin,cookie,'responder',`uptime-${width+610}`);const [mn,...mv]=member.cookie.split('=');await context.addCookies([{name:mn,value:mv.join('='),url:origin}]);const memberFactor=await enroll();
   const before=(await DB.prepare('SELECT COUNT(*) n FROM uptime_credential_grants').first()).n;
   // Native authority is rechecked even in an already-open Settings document.
   const create=panel.getByText('Create a monitoring or CI key',{exact:true});if(!await create.evaluate(e=>e.parentElement.open))await create.click();await form.getByLabel('Name',{exact:true}).fill('synthetic-uptime-608');await form.getByLabel('Key scope',{exact:true}).selectOption('monitoring:read');await form.getByLabel('Resource selection',{exact:true}).selectOption('workspace');await form.getByLabel('Tags (one per line)',{exact:true}).fill('');await form.getByLabel('Expires at (local time)',{exact:true}).fill(new Date(Date.now()+3600000).toISOString().slice(0,16));assert.equal(await form.evaluate(e=>e.checkValidity()),true);await form.getByRole('button',{name:'Create key',exact:true}).click();await panel.getByText('Product permission required',{exact:true}).waitFor();assert.equal((await call('/api/credentials',{name:'synthetic-uptime-609'},{cookie:member.cookie})).status,403);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM uptime_credential_grants').first()).n,before);
   await panel.locator('[data-factors]').getByRole('button',{name:'Remove factor',exact:true}).click();await panel.getByText('Factor removed.',{exact:true}).waitFor();assert.equal((await(await call('/api/access/mfa/status',undefined,{cookie:member.cookie})).json()).factors.length,0);assert.ok(!await panel.textContent().then(text=>text.includes(memberFactor.secret)));
   await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});assert.deepEqual((await page.evaluate(()=>axe.run(document.querySelector('#security-controls')))).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.UPTIME_SCREENSHOTS)await panel.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`security-member-${width}.png`)});
   console.log(`ACCESS-003/READAPI-001 Settings ${width} PASS: owner/member TOTP, recovery once, CDP passkey, stale policy/key step-up, hash-only restricted monitoring/CI issuance, usage and immediate revocation, live member refusal, factor removal, axe/reflow. Existing-document member proof; initial narrowed-role shell entry remains held.`);
  }finally{await browser?.close();await worker?.dispose();await rm(directory,{recursive:true,force:true})}
 }
}
