import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {createInstallerModel} from '@runeditrun/rer/internal/onboarding/setup-manifest.mjs';
import {requireProductionAuth} from '@runeditrun/rer/internal/cli/production-auth.mjs';
import {inspectOperations} from '@runeditrun/rer/internal/operations/operations.mjs';
import {inspectDeployment} from '../scripts/deployment/ops-config.mjs';
import {validateConfiguration} from '../src/domain/startup-config.mjs';
import {selectMailDeclaration} from '../scripts/deployment/mail-config.mjs';
import {deploymentPlan} from '../scripts/deployment/plan.mjs';
import {commandAdapter,lifecycle} from '../scripts/installer/local.mjs';
import {hostedBrowserRuntime} from './hosted-browser-runtime.mjs';
import {splitSql} from './migration-support.mjs';
import {completeBrowserSecondFactor} from './mfa-auth-support.mjs';
import {testAuthBindings} from './auth-test-support.mjs';

// The actual installer model supplies the values the fresh hosted runtime sees;
// no product, settings, monitor, invitation or incident rows are seeded directly.
export async function proveMailOff() {
 const manifest=JSON.parse(await readFile('rer-setup.json','utf8'));
 const model=createInstallerModel(manifest,{},{});
 const answers=model.validateInput({OWNER_EMAIL:'synthetic-uptime-610@example.test',MAIL_PROVIDER:'none'});
 const bindings={...testAuthBindings,...answers,UPTIME_LOCAL_REVIEW:'false'};
 delete bindings.MAIL_FROM;delete bindings.RER_DEV_KEY;
 const declaration=JSON.parse(await readFile('deploy.json','utf8'));
 const env={...bindings,CLOUDFLARE_ACCOUNT_ID:'1'.repeat(32),CLOUDFLARE_API_TOKEN:'synthetic-uptime-611',UPTIME_WORKER_NAME:'synthetic-uptime-612',UPTIME_ORIGIN:'https://uptime.example.test'};
 validateConfiguration(env,{scope:'deploy'});
 const operationsProviders={};
 // Public provider selection uses deploy secret transport; each selected provider
 // must pass the ordinary doors; an omitted selector now uses declared none.
 for(const [provider,credentials] of [
  ['sendgrid',{SENDGRID_API_KEY:'synthetic-uptime-622'}],
  ['resend',{MAIL_PROVIDER_API_KEY:'synthetic-uptime-623'}],
  ['cloudflare',{CLOUDFLARE_MAIL_API_KEY:'synthetic-uptime-624',MAIL_ACCOUNT_ID:'c'.repeat(32)}],
  ['rer',{MAIL_API_KEY:'synthetic-uptime-626',MAIL_RELAY_URL:'https://synthetic-uptime-627.example.test/'}],
 ]) {
  const enabled={...env,MAIL_FROM:'sender@synthetic-uptime.dev',...credentials};
  enabled.MAIL_PROVIDER=provider;
  validateConfiguration(enabled,{scope:'deploy'});
  const declarationForProvider=selectMailDeclaration(declaration,enabled);
  const planForProvider=deploymentPlan({migrations:[]},enabled);
  for(const name of Object.keys(credentials)) {
   assert.ok(declarationForProvider.secrets.some(secret=>secret.binding===name));
   assert.ok(planForProvider.secrets.some(secret=>secret.binding===name));
  }
  // Base preflight takes the shared key input for Cloudflare; the native
  // deployment binds that input under CLOUDFLARE_MAIL_API_KEY.
  const inspected=await inspectDeployment(process.cwd(),{...Object.fromEntries(JSON.parse(await readFile('OPERATIONS.json','utf8')).requiredEnvironment.map(n=>[n,'synthetic-uptime-613'])),...enabled});
  if(provider!=='rer'){assert.equal(inspected.ok,true,`operations accepts ${provider??'default SendGrid'}`);operationsProviders[provider??'default SendGrid']=inspected.loops.find(loop=>loop.id==='operator-sign-in-mail').status;}
  const preflight=provider==='cloudflare'?{...enabled,MAIL_API_KEY:credentials.CLOUDFLARE_MAIL_API_KEY}:enabled;
  await requireProductionAuth({root:process.cwd(),declaration:declarationForProvider,env:preflight,setupManifest:manifest,adapter:commandAdapter,options:{dryRun:false}});
 }
 const selected=selectMailDeclaration(declaration,env);
 const plan=deploymentPlan({migrations:[]},env);
 assert.ok(plan.secrets.some(s=>s.binding==='MAIL_PROVIDER'));
 assert.ok(!plan.secrets.some(s=>s.binding==='MAIL_FROM'||s.binding.includes('API_KEY')));
 const auth=await requireProductionAuth({root:process.cwd(),declaration,env,setupManifest:manifest,adapter:commandAdapter,options:{dryRun:true}});
 assert.ok(auth.mailOff?.signIn);
 assert.equal(lifecycle.mailOffSignIn,commandAdapter.mailOffSignIn);
 const operations=JSON.parse(await readFile('OPERATIONS.json','utf8'));
 const opsEnv={...Object.fromEntries(operations.requiredEnvironment.map(n=>[n,'synthetic-uptime-613'])),...env};
 const offInspection=await inspectOperations(process.cwd(),opsEnv);assert.equal(offInspection.ok,true);operationsProviders.none=offInspection.loops.find(loop=>loop.id==='operator-sign-in-mail').status;
 for(const key of ['SENDGRID_API_KEY','MAIL_API_KEY','MAIL_PROVIDER_API_KEY','CLOUDFLARE_MAIL_API_KEY','MAIL_ACCOUNT_ID','MAIL_RELAY_URL']) {
  const conflict={...env,[key]:'synthetic-uptime-614'};
  assert.throws(()=>validateConfiguration(conflict,{scope:'deploy'}));
  assert.throws(()=>selectMailDeclaration(declaration,conflict));
  assert.equal((await inspectOperations(process.cwd(),{...opsEnv,...conflict})).ok,false);
  // Base recognizes the common sending bindings; the native guard additionally
  // covers Uptime's Cloudflare-specific credential name.
  if(key!=='CLOUDFLARE_MAIL_API_KEY')await assert.rejects(requireProductionAuth({root:process.cwd(),declaration,env:conflict,setupManifest:manifest,adapter:commandAdapter,options:{dryRun:true}}));
 }
 for(const provider of ['sendgrid','resend','cloudflare','rer']) {
  assert.throws(()=>model.validateInput({OWNER_EMAIL:answers.OWNER_EMAIL,MAIL_PROVIDER:provider}));
  assert.throws(()=>validateConfiguration({...env,MAIL_PROVIDER:provider},{scope:'deploy'}));
  await assert.rejects(requireProductionAuth({root:process.cwd(),declaration,env:{...env,MAIL_PROVIDER:provider},setupManifest:manifest,adapter:commandAdapter,options:{dryRun:false}}));
 }
 // The public declaration, rather than a legacy native-key inference, sets
 // the omitted selector's default. Invalid explicit selectors still refuse.
 const unset={...env};delete unset.MAIL_PROVIDER;
 const unsetAuth=await requireProductionAuth({root:process.cwd(),declaration,env:unset,setupManifest:manifest,adapter:commandAdapter,options:{dryRun:false}});
 assert.ok(unsetAuth.mailOff?.signIn,'omitted selector uses the declared mail-off default');
 const unsetInspection=await inspectDeployment(process.cwd(),{...opsEnv,...unset,MAIL_PROVIDER:undefined});
 assert.equal(unsetInspection.ok,true,'unset selector is ready with optional mail off');
 operationsProviders.unset=unsetInspection.loops.find(loop=>loop.id==='operator-sign-in-mail').status;
 for(const provider of ['later','']) {
  assert.throws(()=>validateConfiguration({...env,MAIL_PROVIDER:provider},{scope:'deploy'}));
  assert.throws(()=>selectMailDeclaration(declaration,{...env,MAIL_PROVIDER:provider}));
 }
 console.log('MAIL-OFF configuration checks passed');
 const directory=await mkdtemp(join(tmpdir(),'uptime-mail-off-'));let runtime,browser;let fail=true,mailRequests=0;
 try {
  runtime=await hostedBrowserRuntime(directory,bindings,async request=>{
   const url=new URL(request.url);
   if(/sendgrid|resend|mail/.test(url.hostname)){mailRequests++;throw Error('Mail-off runtime attempted delivery')}
   if(url.hostname==='cloudflare-dns.com')return Response.json({Status:0,Answer:[{type:url.searchParams.get('type')==='A'?1:28,data:url.searchParams.get('type')==='A'?'93.184.215.14':'2606:2800:21f:cb07:6820:80da:af6b:8b2c'}]});
   const down=fail&&url.hostname==='synthetic-uptime-617.example.test';
   return new Response(down?'unavailable':'healthy',{status:down?503:200});
  });
  console.log('MAIL-OFF runtime ready');
  const db=await runtime.worker.getD1Database('DB');
  console.log('MAIL-OFF database ready');
  for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  console.log('MAIL-OFF schema ready');
  browser=await chromium.launch({executablePath:process.env.UPTIME_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
  const page=await context.newPage(),origin=runtime.origin;
  const post=(path,data)=>context.request.post(origin+path,{headers:{origin},data,maxRedirects:0});
  // The ordinary installation claim, with its actual generated setup authority,
  // creates the fresh owner through Base; no sign-in or invite token is exposed.
  const claimed=await post('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Mail-off owner',returnTo:'/setup'});assert.equal(claimed.status(),303);
  await completeBrowserSecondFactor(page,origin);
  await page.goto(origin+'/setup');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(url=>url.pathname.startsWith('/app'));
  assert.equal((await context.request.get(origin+'/api/overview')).status(),200);
  assert.equal((await post('/api/external-check',{url:'https://synthetic-uptime-615.example.test/'})).status(),200,'Settings saves from native fresh setup');
  const counts=async()=>({operators:(await db.prepare('SELECT count(*) n FROM oa_operators').first()).n,tokens:(await db.prepare('SELECT count(*) n FROM oa_tokens').first()).n,assignments:(await db.prepare('SELECT count(*) n FROM uptime_member_roles').first()).n});
  const beforeInvites=await counts();
  for(const role of ['admin','editor','responder','read-only'])for(const email of [answers.OWNER_EMAIL,'synthetic-uptime-616@example.test']){
   const invite=await post('/api/access/invitations',{email,displayName:'Synthetic colleague',role});assert.equal(invite.status(),503);assert.equal((await invite.json()).error,'mail_unavailable');
   assert.deepEqual(await counts(),beforeInvites,'mail-off refusal preserves operators, tokens and assignments');
  }
  for(const email of [answers.OWNER_EMAIL,'synthetic-uptime-616@example.test']) {
   const invite=await post('/auth/invite',{email,displayName:'Synthetic colleague',role:'member'});assert.equal(invite.status(),503);assert.equal((await invite.json()).error,'mail_unavailable');
  }
  assert.equal((await context.request.post(origin+'/auth/invite',{headers:{origin:'https://foreign.example.test'},data:{email:'synthetic-uptime-619@example.test',displayName:'Foreign'},maxRedirects:0})).status(),403,'mail-off invitations keep their origin guard');
  assert.deepEqual(await counts(),beforeInvites);
  await page.goto(origin+'/app/settings/people');
  const accounts=page.locator('#people-accounts');await accounts.getByText(/Email is off.*Invitations need email/).waitFor();
  assert.equal(await accounts.getByRole('button',{name:'Send invite',exact:true}).count(),0);
  assert.equal(await accounts.locator('.operator-row').count(),beforeInvites.operators);
  const capture=async name=>{if(process.env.UPTIME_AUTH_SHOTS){await mkdir(process.env.UPTIME_AUTH_SHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:join(process.env.UPTIME_AUTH_SHOTS,`mail-off-${name}-${width}.png`),fullPage:true})}await page.setViewportSize({width:1440,height:1000})}};
  await capture('people');
  const destination=await post('/api/notifications/destinations',{name:'Mail-off destination',kind:'email',address:answers.OWNER_EMAIL});assert.equal(destination.status(),201);
  const monitor=await post('/api/monitors',{name:'Mail-off monitor',url:'https://synthetic-uptime-617.example.test/',retries:0,confirmSlots:1,recoverSlots:1,intervalMs:60000});assert.equal(monitor.status(),201,await monitor.text());const saved=await monitor.json();
  const scheduled=async()=>{const r=await runtime.worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(r.status,204,await r.text())};
  await scheduled();
  let incidents=[];
  for(let n=0;n<100;n++){incidents=await (await context.request.get(origin+`/api/monitors/${saved.id}/incidents`)).json();if(incidents.length)break;await new Promise(r=>setTimeout(r,50))}
  assert.ok(incidents.length&&incidents.every(i=>i.endedAt===null),'mail-off monitoring opens an incident');
  const notes=await (await context.request.get(origin+'/api/notifications')).json();assert.equal(notes.mailConfigured,false);
  assert.ok(notes.deliveries.length);assert.ok(notes.deliveries.every(d=>d.state!=='accepted'&&d.code==='mail_unavailable'));
  assert.equal(notes.mailOff,true);
  await page.goto(origin+'/app/settings/alerts');await page.locator('.alert-clauses').getByText(/Email is off.*cannot send/).waitFor();
  assert.equal(await page.getByRole('link',{name:'Set up email',exact:true}).count(),0);
  assert.match(await page.locator('.sent-row').first().innerText(),/Failed|Not sent/);
  await capture('alerts');
  fail=false;await new Promise(r=>setTimeout(r,61000));await scheduled();
  for(let n=0;n<100;n++){incidents=await (await context.request.get(origin+`/api/monitors/${saved.id}/incidents`)).json();if(incidents.every(i=>typeof i.endedAt==='number'))break;await new Promise(r=>setTimeout(r,50))}
  assert.ok(incidents.length&&incidents.every(i=>typeof i.endedAt==='number'&&i.recovery?.kind==='recovery'),'mail-off monitoring recovers');
  await post('/auth/signout',{});
  for(const path of ['/api/overview','/api/notifications'])assert.equal((await context.request.get(origin+path)).status(),401);
  for(const path of ['/app/settings','/app/monitors'])assert.equal((await context.request.get(origin+path,{maxRedirects:0})).status(),303);
  for(const email of [answers.OWNER_EMAIL,'synthetic-uptime-616@example.test']){const r=await post('/auth/magic-link',{email});assert.equal(r.status(),503);assert.deepEqual(await r.json(),{error:'mail_unavailable'})}
  for(const path of ['/__dev/key','/__dev/identity','/auth/one-click?token=synthetic-uptime-618'])assert.ok([400,403,404].includes((await context.request.get(origin+path,{maxRedirects:0})).status()));
  for(const path of ['/login','/signin']){
   await page.goto(origin+path);await page.getByRole('heading',{name:/sign in/i}).waitFor();
   assert.equal(await page.locator('input,form').count(),0);
   assert.match(await page.locator('main').innerText(),/rer signin/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  // Assertions use 1440 only; the proof captures the changed screen once at each width.
  if(process.env.UPTIME_AUTH_SHOTS){await mkdir(process.env.UPTIME_AUTH_SHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:join(process.env.UPTIME_AUTH_SHOTS,`mail-off-login-${width}.png`),fullPage:true})}}
  assert.equal(mailRequests,0);
  if(process.env.UPTIME_MAIL_OFF_RECEIPT)await writeFile(process.env.UPTIME_MAIL_OFF_RECEIPT,JSON.stringify({journey:'proveMailOff',setup:'native model -> bootstrap -> first-run',provider:answers.MAIL_PROVIDER,operationsProviders,mailRequests,settingsSaved:true,invitationCounts:{before:beforeInvites,after:await counts()},productRolesRefused:['admin','editor','responder','read-only'],peopleMailOff:true,alertsMailOff:true,assertionWidth:1440,proofWidths:[1440,390],incidentOpened:true,incidentRecovered:true,privateDoorsProtected:true,unavailableAuthentication:true,unavailableAlerts:true},null,2)+'\n');
  console.log('MAIL-OFF passed native setup, operations, deploy validation/preflight, fresh first-run, Settings, monitor failure/recovery, unavailable mail and protected hosted doors');
 } finally {await browser?.close();await runtime?.close();await rm(directory,{recursive:true,force:true})}
}
