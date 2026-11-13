import {definitionDoor} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

// Extends the signed heartbeat lifecycle through its console creation door.
// The emitted Worker and real signed runner own every health transition.
export async function proveHeartbeatConsole({origin,cookie,api,runner,advance}){
 const browser=await chromium.launch({headless:true,...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 const output=process.env.UPTIME_HEARTBEAT_PROOF_DIR;
 if(output)await mkdir(output,{recursive:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true,permissions:['clipboard-read','clipboard-write']});
 const separator=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.name));
 const read=async id=>(await api('/api/overview')).data.monitors.find(m=>m.id===id);
 const state=async id=>(await read(id)).state.state;
 const shot=async(name)=>{
  if(!output)return;
  // Screenshots never disclose the real URL capability or executable secret.
  for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});await page.screenshot({path:join(output,`${name}-${width}.png`),fullPage:true,mask:[page.locator('#heartbeat-checkin-url'),page.locator('#heartbeat-checkin-command'),page.locator('#heartbeat pre')]})}
  await page.setViewportSize({width:1440,height:1000});
 };
 const refreshState=async(id,expected)=>{await page.reload();await page.locator('#monitor-state').filter({hasText:expected}).waitFor();assert.equal(await state(id),expected)};
 try{
  await page.goto(origin+'/app');
  if(new URL(page.url()).pathname==='/setup'){await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(url=>url.pathname.startsWith('/app'))}
  // A documented import creates a digest-bearing internal ID; only opened integration instructions show it.
  const fetcher=async(url,init)=>{const target=new URL(url),r=await api(target.pathname+target.search,init.body===undefined?undefined:JSON.parse(init.body),init.headers,init.method);return new Response(JSON.stringify(r.data),{status:r.status})};
  const door=definitionDoor({origin,cookie,fetcher}),document={format:'uptime.monitors',version:5,monitors:[{name:'synthetic-uptime-801 nightly backup',type:'heartbeat',heartbeat:{maxAgeMs:300000},intervalMs:60000}]};
  const plan=await door.preview(document);assert.equal(plan.status,200);const applied=await door.apply(plan.body);assert.equal(applied.status,200);const [importedId]=applied.body.created;
  await page.goto(origin+'/app/monitors/'+encodeURIComponent(importedId));await page.locator('#monitor-detail-heading').waitFor();
  assert.ok((await page.locator('.monitor-page-header').innerText()).includes(document.monitors[0].name));
  assert.doesNotMatch(await page.locator('.monitor-page-header').innerText(),/[a-f0-9]{64}/i);
  const heartbeat=page.locator('#heartbeat');if(!await heartbeat.evaluate(e=>e.open))await heartbeat.locator(':scope > summary').click();
  assert.doesNotMatch(await heartbeat.innerText(),/[a-f0-9]{64}/i,'expanded heartbeat summary has no internal digest');
  const integration=heartbeat.locator('.heartbeat-integration').first();await integration.locator('summary').click();assert.ok((await integration.innerText()).includes(importedId),'the receipt path remains available in integration instructions');await integration.locator('summary').click();
  await shot('imported-job-summary');
  assert.equal((await api('/api/external-check',{url:'https://canary.runner-target.test/canary'})).status,200);
  await page.goto(origin+'/app/monitors');
  await page.getByRole('button',{name:'New monitor',exact:true}).click();
  await page.locator('html.editor-context-ready').waitFor();
  if(!await page.locator('#monitor-form').isVisible())await page.getByRole('button',{name:'Fill in the form yourself',exact:true}).click();
  await page.getByRole('combobox',{name:'What to check',exact:true}).selectOption('heartbeat');
  await page.getByLabel('Monitor name',{exact:true}).fill('synthetic-uptime-701');
  await page.getByLabel('Expected interval (seconds)',{exact:true}).fill('30');
  await page.getByLabel('Grace period (seconds)',{exact:true}).fill('2');
  assert.equal(await page.locator('[name="url"]').isVisible(),false);
  assert.equal(await page.locator('#check-from').isVisible(),false);
  // A rejected browser value leaves the form intact and writes no monitor.
  const before=(await api('/api/overview')).data.monitors.length;
  await page.getByLabel('Expected interval (seconds)',{exact:true}).fill('29');
  await page.getByRole('button',{name:'Save monitor',exact:true}).click();
  assert.equal((await api('/api/overview')).data.monitors.length,before);
  await page.getByLabel('Expected interval (seconds)',{exact:true}).fill('30');
  await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
  assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[],'heartbeat creation accessibility at 1440');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await shot('scheduled-job-form');
  const saved=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/monitors'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Save monitor',exact:true}).click();
  const response=await saved;if(response.status()!==201)throw Error('Console create refused: '+(await response.json()).error);
  await page.waitForURL(url=>/^\/app\/monitors\/[^/]+$/.test(url.pathname));const id=new URL(page.url()).pathname.split('/').at(-1);
  const urlField=page.getByLabel('Check-in URL',{exact:true});await urlField.waitFor();await page.waitForFunction(()=>Boolean(document.querySelector('#heartbeat-checkin-url')?.value));
  const url=await urlField.inputValue();assert.equal(new URL(url).origin,origin);assert.ok(new URL(url).pathname.startsWith(`/api/heartbeats/${id}/url/`));
  assert.equal(await page.evaluate(value=>{const token=new URL(value).pathname.split('/').at(-1);return [sessionStorage,localStorage].every(storage=>Object.values(storage).every(item=>!String(item).includes(token)))},url),true,'raw authority never enters browser storage');
  assert.equal(await state(id),'Unknown');
  const definition=(await read(id)).definition;
  assert.equal(definition.type,'heartbeat');assert.equal(definition.heartbeat.maxAgeMs,30000);assert.equal(definition.heartbeat.graceMs,2000);assert.equal(definition.url,'');
  const command=await page.locator('#heartbeat-checkin-command').textContent();assert.ok(command.includes(url));
  await page.getByRole('button',{name:'Copy check-in URL',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),url);
  await page.getByRole('button',{name:'Copy command',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),command);
  await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
  assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[],'heartbeat monitor accessibility at 1440');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await shot('job-checkin-ready');
  // Real GET through the URL read from the rendered page, with no owner cookie.
  const received=await api(new URL(url).pathname,undefined,{cookie:''},'GET');assert.equal(received.status,200);assert.equal(received.data.received,true);
  assert.equal((await api(new URL(url).pathname,undefined,{cookie:''},'HEAD')).status,200);
  const posted=await api(new URL(url).pathname,{},{cookie:''},'POST');assert.equal(posted.status,200);assert.equal(posted.data.received,true);
  assert.equal(await state(id),'Unknown','ingress alone cannot establish Healthy');

  await runner();assert.equal(await state(id),'Healthy');
  // Read the updated page without reloading: polling must keep its one-time URL.
  await page.locator('#monitor-state').filter({hasText:'Healthy'}).waitFor({timeout:15000});
  assert.equal(await urlField.inputValue(),url,'polling keeps the URL available for this visit');
  await shot('job-up');
  const anchor=received.data.receivedAt;
  advance(anchor+30000);await runner();assert.notEqual(await state(id),'Failing','the grace period still applies');
  advance(anchor+31999);await runner();assert.notEqual(await state(id),'Failing','no failure before the exact deadline');
  advance(anchor+32000);await runner();assert.equal(await state(id),'Failing');
  await refreshState(id,'Failing');assert.equal(await page.locator('#heartbeat-checkin-secret').isVisible(),false,'reload retains no raw capability');
  const heartbeatRuns=page.locator('#heartbeat');if(!await heartbeatRuns.evaluate(e=>e.open))await heartbeatRuns.locator(':scope > summary').click();
  await page.locator('#load-heartbeat-runs').click();await page.locator('.heartbeat-job-run').first().waitFor();assert.doesNotMatch(await page.locator('#heartbeat-run-history').innerText(),/\b(?:start|success|fail)\b|revision \d+/);
  await shot('job-missed');
  const events=(await api('/api/overview')).data.alerts.filter(a=>a.monitor_id===id);assert.ok(events.some(a=>a.kind==='trigger'&&/Job missed/.test(a.event.explanation)));
  advance(anchor+33000);const recovered=await api(new URL(url).pathname,undefined,{cookie:''},'GET');assert.equal(recovered.status,200);assert.equal(recovered.data.late,true);
  assert.equal(await state(id),'Failing','late ingress alone cannot recover');await runner();await refreshState(id,'Healthy');
  assert.deepEqual(errors,[]);
  const receipt={journey:'proveHeartbeatConsole',result:'passed',width:1440,proofWidths:output?[1440,390]:[],createdThroughForm:true,copyUrl:true,copyCommand:true,realInstallUrl:true,ingressState:'Unknown',scheduledState:'Healthy',periodMs:30000,graceMs:2000,beforeDeadline:'not Failing',atDeadline:'Failing',lateRecovery:'Healthy',secretsInStorage:false};
  if(output)await writeFile(join(output,'heartbeat-console.json'),JSON.stringify(receipt,null,2)+'\n');
  assert.equal((await api(`/api/monitors/${id}`,{...(await read(id)).definition,enabled:false},{},'PATCH')).status,200);
  console.log('Heartbeat console passed: create, copy real URL/command, actual check-in, signed Healthy, grace, exact-deadline Failing and late recovery.');
 }finally{await context.close();await browser.close()}
}

// The same failure receipt is inspected through the operator's actual run-history control.
export async function proveHeartbeatOutputRedaction({origin,cookie,id,output,planted,ordinary}){
 const browser=await chromium.launch({headless:true,...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
 try{
  const separator=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage();await page.goto(origin+`/app/monitors/${id}`);
  if(new URL(page.url()).pathname==='/setup'){await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(url=>url.pathname.startsWith('/app'));await page.goto(origin+`/app/monitors/${id}`)}
  const fold=page.locator('details#heartbeat');if(!await fold.evaluate(node=>node.open))await fold.locator(':scope > summary').click();
  await page.getByRole('button',{name:'Load run history',exact:true}).click();
  const history=page.locator('#heartbeat-run-history');await history.locator('pre').waitFor();
  assert.equal(await history.locator('pre').textContent(),output,'the console displays the stored redacted output');
  const text=await history.innerText();for(const secret of planted)assert.ok(!text.includes(secret),'the console withholds planted secrets');
  for(const value of ordinary)assert.ok(text.includes(value),'the console preserves ordinary output');
  if(process.env.UPTIME_HEARTBEAT_PROOF_DIR){
   const directory=process.env.UPTIME_HEARTBEAT_PROOF_DIR;await mkdir(directory,{recursive:true});
   for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});await history.screenshot({path:join(directory,`heartbeat-output-redacted-${width}.png`)})}
   await writeFile(join(directory,'heartbeat-redaction.json'),JSON.stringify({journey:'signed-runner heartbeat failure output',result:'passed',assertionWidth:1440,proofWidths:[1440,390],providerKeys:planted.length-5,storedMasked:true,consoleMatchesStorage:true,ordinaryValuesPreserved:ordinary.length},null,2)+'\n');
  }
 }finally{await context.close();await browser.close()}
}
