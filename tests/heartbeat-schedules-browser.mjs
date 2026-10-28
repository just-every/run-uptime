import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory,ownerAPI} from './notify-acceptance-runtime.mjs';
import {rehashArchive} from './archive-restore-fixtures.mjs';
const dir=await runtimeDirectory(),out=resolve(process.env.UPTIME_SCREENSHOTS??join(dir,'screens'));await mkdir(out,{recursive:true});let worker,browser;
try{
 const [port,sourcePort]=await availablePorts(2),origin=`http://127.0.0.1:${port}`;
 // A restored archive keeps the monitor ids it was exported with, whatever characters they hold.
 const importedId=`nightly'$(printf\${IFS}substituted)'`,sourceOrigin=`http://127.0.0.1:${sourcePort}`,source=await migratedWorker({port:sourcePort,persist:join(dir,'source')});let archive;
 try{
  const owner=ownerAPI(sourceOrigin);await owner.signIn();
  const created=await owner.api('/api/monitors','POST',{name:'Imported nightly export',type:'heartbeat',heartbeat:{maxAgeMs:86400000},canaryUrl:'https://example.org/',intervalMs:30000,enabled:true},{origin:sourceOrigin});assert.equal(created.status,201);
  const exported=await owner.api('/api/archive','GET',undefined,{origin:sourceOrigin});assert.equal(exported.status,200);
  archive=await rehashArchive(JSON.parse(JSON.stringify(exported.data).replaceAll(created.data.id,importedId)));
 }finally{await source.worker.dispose()}
 ({worker}=await migratedWorker({port,persist:join(dir,'worker')}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
 const restored=await page.request.post(origin+'/api/restore',{headers:{origin},data:{archive}});assert.equal(restored.status(),200,await restored.text());
 const response=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'Acme nightly database backup',type:'heartbeat',heartbeat:{maxAgeMs:86400000,graceMs:900000,maxRunDurationMs:1800000},canaryUrl:'https://example.org/',intervalMs:30000,enabled:true}});assert.equal(response.status(),201);const monitor=await response.json();
 // A restored monitor keeps its source's locations; its owner assigns this installation's before issuing it a key.
 const [imported]=(await (await page.request.get(origin+`/api/overview?monitor=${encodeURIComponent(importedId)}`,{headers:{origin}})).json()).monitors;
 const assigned=await page.request.patch(origin+`/api/monitors/${encodeURIComponent(importedId)}`,{headers:{origin},data:{...imported.definition,probes:monitor.definition.probes,assignments:monitor.definition.assignments}});assert.equal(assigned.status(),200,await assigned.text());
 const shot=async(name,selector)=>{await page.locator(selector).scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);await page.locator(selector).screenshot({path:join(out,name+'.png'),mask:await page.locator('.one-time-secret').all(),maskColor:'#e7e9ef'})};
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+`/app/monitors/${monitor.id}`);await page.locator('#job-mode').waitFor();
  await page.locator('#job-mode').selectOption('cron');await page.locator('#job-cron').fill('0 2 * * *');await page.locator('#job-zone').fill('America/New_York');await page.locator('#job-grace').fill('900');
  await page.locator('#heartbeat-job-settings button').click();await page.getByText('Job settings saved. Issue a new heartbeat key.',{exact:true}).waitFor();
  await page.reload();await page.locator('#job-mode').waitFor();assert.equal(await page.locator('#job-mode').inputValue(),'cron');assert.equal(await page.locator('#job-zone').inputValue(),'America/New_York');
  await page.locator('#load-heartbeat-runs').click();await page.getByText(/Next expected runs \(America\/New_York\)/).waitFor();assert.ok((await page.locator('#heartbeat-jobs').ariaSnapshot()).includes('Five-field cron expression'));await shot(`cron-saved-${width}`,'#heartbeat-jobs');
  await page.locator('#job-cron').fill('0 2 31 2 *');await page.locator('#heartbeat-job-settings button').click();await page.locator('#heartbeat-settings-status').filter({hasText:/Heartbeat cron has no possible calendar date/}).waitFor();assert.equal(await page.locator('#job-cron').inputValue(),'0 2 31 2 *');await shot(`cron-refused-${width}`,'#heartbeat-jobs');
  await page.reload();await page.locator('#issue-heartbeat-key').click();await page.getByRole('button',{name:'Issue key',exact:true}).click();const dialog=page.locator('.heartbeat-key-dialog');await dialog.waitFor();
  const select=dialog.getByLabel('Heartbeat command or scheduler');const options=await select.locator('option').all();assert.ok(options.length>=10);await select.selectOption('kubernetes');assert.ok((await dialog.locator('pre').textContent()).includes('America/New_York'));await select.selectOption('bash');assert.ok((await dialog.locator('pre').textContent()).includes('/fail/'));await shot(`scheduler-snippet-${width}`,'.heartbeat-key-dialog');
  await dialog.getByRole('button',{name:'I saved it — close'}).click();await dialog.waitFor({state:'detached'});assert.equal(await dialog.count(),0);assert.equal(await page.evaluate(()=>document.activeElement.id),'issue-heartbeat-key');
  await page.goto(origin+'/app/archive');await page.locator('#definition-source').waitFor();await page.locator('#definition-source').selectOption('betterstack-heartbeats');await page.locator('#definition-text').fill(JSON.stringify({data:[{type:'heartbeat',attributes:{name:'Acme offsite copy',period:86400,grace:900}}]}));
  await page.getByRole('button',{name:'Preview',exact:true}).click();await page.locator('#definition-result .definition-source').waitFor();await shot(`heartbeat-import-${width}`,'#definition-result');
  await page.goto(origin+'/docs/heartbeat-jobs');await page.getByText(/Choose Cron in a time zone/).first().waitFor();await shot(`heartbeat-guide-${width}`,'main');
  console.log(`HEARTBEAT-002/003/004 browser ${width}: cron save/reload, deadline preview, invalid-date refusal, one-time scheduler selection, focus, source preview, axe and reflow passed.`);
 }
 // The copied heartbeat command hands curl its receipt URL as one literal argument; the shell runs nothing the id spells.
 await page.goto(origin+`/app/monitors/${encodeURIComponent(importedId)}`);await page.locator('#issue-heartbeat-key').click();await page.getByRole('button',{name:'Issue key',exact:true}).click();
 const keyDialog=page.locator('.heartbeat-key-dialog');await keyDialog.waitFor();
 const copied=spawnSync('/bin/sh',['-c',`curl() { printf '%s\\n' "$@"; }\n${await keyDialog.locator('pre').textContent()}`],{encoding:'utf8'});assert.equal(copied.status,0);
 assert.equal(copied.stdout.split('\n')[2],`${origin}/api/heartbeats/${importedId}`,'The copied heartbeat command passes its receipt URL to curl as one literal argument');
 await keyDialog.getByRole('button',{name:'I saved it — close'}).click();await keyDialog.waitFor({state:'detached'});
 console.log('Heartbeat key: the copied curl command quotes a restored monitor id as one shell word.');
}finally{await browser?.close();await worker?.dispose();await cleanupDirectory(dir)}
