// Adding a location, through the console and a real runner process: the owner adds a location and copies its command, the
// command runs in an empty folder with no Uptime checkout and joins with its one-time join key, the location is named after
// where it connects from, and the owner checks every monitor from there too in one step, renames it and removes it. Monitors an
// older Uptime saved keep their external check through that step: one that copied the installation's URL still follows Settings,
// and one with its own URL keeps it. Where a request comes from is the one fake, at the network edge: Cloudflare's request.cf
// says Sydney. The empty installation also opens straight into the new-monitor form.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn,testAuthBindings} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {legacyMonitor} from './legacy-monitor-fixture.mjs';
const directory=await runtimeDirectory();let worker,DB,browser,runner,output='';
const waitFor=async(what,check,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,250))}throw Error(`timed out waiting for ${what}\n${output.slice(-1500)}`)};
try{
 const [port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
 ({worker,DB}=await migratedWorker({port,persist:join(directory,'worker'),cf:{city:'Sydney',region:'New South Wales',country:'AU'}}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await browserSignIn(page,origin);
 await page.waitForURL(url=>url.pathname==='/app/monitors/new');await page.locator('html.editor-ready').waitFor();
 assert.equal(await page.locator('h1').textContent(),'Add your first monitor','with no monitors, finishing setup opens the new-monitor form');
 const runners=async()=>(await(await page.request.get(origin+'/api/runners')).json()).filter(r=>!r.revokedAt);
 const builtIn=(await runners()).find(r=>r.builtIn);
 const shop=await(await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'Shop',url:'https://shop.example.test/',probes:['local-a'],assignments:{'local-a':{runnerId:builtIn.runnerId}}}})).json();
 // Monitors an older Uptime saved, before monitors followed Settings: each check from one location carried a copy of a URL. A
 // copy of the installation's URL at the upgrade (migration 0062 recorded it) follows Settings, as do the three checks from one
 // location the old form gave by default; any other URL is the monitor's own.
 const {legacy_url:atUpgrade}=await DB.prepare('SELECT legacy_url FROM external_check WHERE id=1').first(),here={runnerId:builtIn.runnerId,networkLabel:builtIn.networkLabel};
 const carried=await legacyMonitor(DB,{name:'Carried over',url:'https://carried.example.test/',assignments:{'local-a':{...here,canaryUrl:atUpgrade}}});
 const own=await legacyMonitor(DB,{name:'Own check',url:'https://own.example.test/',assignments:{'local-a':{...here,canaryUrl:'https://check.example.test/'}}});
 const sameCity=await legacyMonitor(DB,{name:'Same city',url:'https://city.example.test/',assignments:Object.fromEntries(['local-a','local-b','local-c'].map(probe=>[probe,{...here,canaryUrl:atUpgrade}]))});
 const monitors=async()=>new Map((await(await page.request.get(origin+'/api/overview')).json()).monitors.map(m=>[m.id,m]));
 const settings=(await(await page.request.get(origin+'/api/external-check')).json()).url,upgraded=await monitors();
 assert.deepEqual(upgraded.get(carried.id).externalCheck,{url:settings,own:null},'a copy of the installation’s URL at the upgrade follows Settings');
 assert.deepEqual(upgraded.get(own.id).externalCheck,{url:'https://check.example.test/',own:'https://check.example.test/'});

 await page.goto(origin+'/app/locations');await page.locator('#locations-table').waitFor();
 const before=await runners();
 await page.getByRole('button',{name:'Add location',exact:true}).click();
 const command=(await page.locator('#location-command').textContent()).trim();
 const [,downloaded,joinOrigin,joinKey]=command.match(/^curl -fsSL (\S+)\/uptime-runner\.mjs -o uptime-runner\.mjs && node uptime-runner\.mjs (\S+) (\S+)$/)??[];
 assert.ok(joinKey,`one command line that downloads this installation's runner and joins: ${command.replace(/\S+$/,'…')}`);
 assert.equal(downloaded,origin);assert.equal(joinOrigin,origin,'the command carries this installation’s address');
 assert.doesNotMatch(command,/UPTIME_|runners\/src/,'no settings or checkout paths');
 assert.ok(await page.locator('#location-local').isVisible(),'a loopback installation says another machine cannot reach it');
 const added=(await runners()).find(r=>!before.some(b=>b.runnerId===r.runnerId));
 assert.ok(added&&added.lastContactAt===null,'the new location waits to join');
 assert.equal(await page.locator('#location-waiting').textContent(),'Waiting for it to join…');

 // The copied command, run in an empty folder: no Uptime checkout, only Node and curl on the PATH.
 const empty=await mkdtemp(join(directory,'machine-'));
 runner=spawn('/bin/sh',['-c',command],{cwd:empty,detached:true,env:{PATH:process.env.PATH,HOME:empty},stdio:['ignore','pipe','pipe']});
 runner.stdout.on('data',chunk=>output+=chunk);runner.stderr.on('data',chunk=>output+=chunk);
 await page.locator('#location-joined').filter({hasText:'Sydney joined'}).waitFor({timeout:60000});
 assert.equal(await page.locator('#location-command').count(),0,'the join key is gone once the location joins');
 const joined=(await runners()).find(r=>r.runnerId===added.runnerId);
 assert.equal(joined.networkLabel,'Sydney','named after the place it connects from');assert.ok(joined.lastContactAt);
 assert.deepEqual((await readdir(empty)).sort(),['uptime-runner','uptime-runner.mjs'],'the script and its own folder');
 const saved=JSON.parse(await readFile(join(empty,'uptime-runner/location.json'),'utf8'));
 assert.equal((await stat(join(empty,'uptime-runner/location.json'))).mode&0o777,0o600,'its key is the owner’s only');
 const again=await fetch(origin+'/api/runner/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({joinKey})});
 assert.equal(again.status,403,'the join key works once');

 // Check all monitors from here too: on by default, applied by Done in one step.
 assert.ok(await page.locator('#check-all-monitors').isChecked());
 await page.locator(`tr[data-key="location-${joined.runnerId}"] .location-badge`).filter({hasText:'Just joined'}).waitFor();
 const checkAll=page.waitForResponse(response=>response.url()===`${origin}/api/runners/${joined.runnerId}/check-all`);
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.locator('#add-location').waitFor({state:'detached'});
 const applied=await(await checkAll).json();
 assert.deepEqual(applied.added.map(m=>m.name).sort(),['Carried over','Own check','Shop']);assert.deepEqual(applied.full,['Same city'],'three checks already');
 const after=await monitors(),checked=after.get(shop.id);
 assert.deepEqual(Object.values(checked.definition.assignments).map(a=>a.runnerId).sort(),[builtIn.runnerId,joined.runnerId].sort(),'the monitor checks from both');
 assert.equal(checked.revision,shop.revision+1);
 await page.locator(`tr[data-key="location-${joined.runnerId}"] td[data-label="Monitors"]`).filter({hasText:'3'}).waitFor();
 // The carried-over monitor still follows Settings: its copy did not become its own URL, and from two locations it needs no
 // external check. The monitor's own URL stays its own, for the new location too.
 const follower=after.get(carried.id);
 assert.equal(follower.revision,carried.revision+1);assert.notEqual(follower.definition.externalCheck,'own');
 assert.deepEqual(Object.values(follower.definition.assignments).map(a=>a.canaryUrl??null),[null,null],'no copy is kept');
 assert.deepEqual(follower.externalCheck,{url:null,own:null});
 assert.equal(after.get(own.id).definition.externalCheck,'own');
 assert.deepEqual(Object.values(after.get(own.id).definition.assignments).map(a=>a.canaryUrl),['https://check.example.test/','https://check.example.test/']);
 assert.equal(after.get(sameCity.id).revision,sameCity.revision,'a monitor with three checks is left as it is');
 // Its edit view: both locations ticked, Advanced closed with no URL of its own.
 await page.goto(`${origin}/app/monitors/${encodeURIComponent(carried.id)}/edit`);await page.locator('html.editor-context-ready').waitFor();
 assert.deepEqual(await page.locator('input[name=locations]:checked').evaluateAll(boxes=>boxes.map(box=>box.value).sort()),[builtIn.runnerId,joined.runnerId].sort());
 assert.equal(await page.locator('details.check-from-advanced').evaluate(details=>details.open),false,'Advanced stays closed');
 assert.equal(await page.locator('#external-check-own').inputValue(),'');
 // A new URL in Settings: only the monitor with its own URL keeps it.
 await page.goto(origin+'/app/settings');const setting=page.locator('#external-check-url');await setting.waitFor();
 const saving=page.waitForResponse(response=>response.url()===origin+'/api/external-check'&&response.request().method()==='POST');
 await setting.fill('https://example.net/');await page.locator('#external-check-form button[type=submit]').click();
 const answer=await(await saving).json();assert.equal(answer.url,'https://example.net/');assert.equal(answer.own,1,'only the monitor with its own URL keeps its own');
 // The next checks from this computer's location, taken at the runner's own door: the carried-over monitor is handed no old
 // copy, the monitor with its own URL is handed that, and the monitor still checking three times from here the new URL.
 const handed=new Map(),from=task=>Object.values(task.definition.assignments).filter(a=>a.runnerId===builtIn.runnerId).map(a=>a.canaryUrl??null);
 await waitFor('the next checks from this computer',async()=>{
  const {task}=await(await fetch(origin+'/api/runner/claim',{method:'POST',headers:{'content-type':'application/json','x-runner-id':builtIn.runnerId,'x-runner-key':testAuthBindings.UPTIME_RUNNER_KEY},body:'{}'})).json();
  if(task&&!handed.has(task.monitorId))handed.set(task.monitorId,from(task));
  return [carried.id,own.id,sameCity.id].every(id=>handed.has(id));
 },90000);
 assert.deepEqual(handed.get(carried.id),[null],'the old copy is not handed');
 assert.deepEqual(handed.get(own.id),['https://check.example.test/']);
 assert.deepEqual(handed.get(sameCity.id),['https://example.net/','https://example.net/','https://example.net/'],'the new Settings URL reaches its next check');
 await page.goto(origin+'/app/locations');await page.locator('#locations-table').waitFor();

 // Rename: the owner's name stays, and the running runner keeps checking in under it.
 await page.locator(`[data-rename="${joined.runnerId}"]`).click();await page.locator('#location-name').fill('Sydney office');await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('.location-name',{hasText:'Sydney office'}).waitFor();
 const renamedAt=Date.now();
 await waitFor('the renamed location to keep checking in',async()=>{const row=(await runners()).find(r=>r.runnerId===joined.runnerId);return row.networkLabel==='Sydney office'&&row.lastContactAt>renamedAt});

 // Remove: the location leaves the list and the key it joined with stops working.
 await page.locator(`[data-remove="${joined.runnerId}"]`).click();
 await page.getByRole('dialog').getByRole('button',{name:'Remove',exact:true}).click();
 await page.locator(`tr[data-key="location-${joined.runnerId}"]`).waitFor({state:'detached'});
 const refused=await fetch(origin+'/api/runner/claim',{method:'POST',headers:{'content-type':'application/json','x-runner-id':saved.runnerId,'x-runner-key':saved.key},body:'{}'});
 assert.equal(refused.status,401,'a removed location cannot check in');
 assert.deepEqual(errors,[],'browser exceptions');
 console.log('ADD-LOCATION: added, joined from an empty folder with the copied command as Sydney, checks every monitor (carried-over ones keep their external check), renamed, removed.');
}finally{if(runner&&runner.exitCode===null){process.kill(-runner.pid,'SIGTERM');await once(runner,'exit')}await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
