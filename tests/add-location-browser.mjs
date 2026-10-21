// Adding a location, through the console and a real runner process: the owner adds a location and copies its command, the
// command runs in an empty folder with no Uptime checkout and joins with its one-time join key, the location is named after
// where it connects from, and the owner checks every monitor from there too in one step, renames it and removes it. Where a
// request comes from is the one fake, at the network edge: Cloudflare's request.cf says Sydney. The empty installation also
// opens straight into the new-monitor form.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
const directory=await runtimeDirectory();let worker,browser,runner,output='';
const waitFor=async(what,check,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,250))}throw Error(`timed out waiting for ${what}\n${output.slice(-1500)}`)};
try{
 const [port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
 ({worker}=await migratedWorker({port,persist:join(directory,'worker'),cf:{city:'Sydney',region:'New South Wales',country:'AU'}}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await browserSignIn(page,origin);
 await page.waitForURL(url=>url.pathname==='/app/monitor');await page.locator('html.editor-ready').waitFor();
 assert.equal(await page.locator('h1').textContent(),'Add your first monitor','with no monitors, finishing setup opens the new-monitor form');
 const runners=async()=>(await(await page.request.get(origin+'/api/runners')).json()).filter(r=>!r.revokedAt);
 const builtIn=(await runners()).find(r=>r.builtIn);
 const shop=await(await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'Shop',url:'https://shop.example.test/',probes:['local-a'],assignments:{'local-a':{runnerId:builtIn.runnerId}}}})).json();

 await page.goto(origin+'/app#locations');await page.locator('#locations-table').waitFor();
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
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.locator('#add-location').waitFor({state:'detached'});
 const checked=(await(await page.request.get(origin+'/api/overview')).json()).monitors.find(m=>m.id===shop.id);
 assert.deepEqual(Object.values(checked.definition.assignments).map(a=>a.runnerId).sort(),[builtIn.runnerId,joined.runnerId].sort(),'the monitor checks from both');
 assert.equal(checked.revision,shop.revision+1);
 await page.locator(`tr[data-key="location-${joined.runnerId}"] td[data-label="Monitors"]`).filter({hasText:'1'}).waitFor();

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
 console.log('ADD-LOCATION: added, joined from an empty folder with the copied command as Sydney, checks every monitor, renamed, removed.');
}finally{if(runner&&runner.exitCode===null){process.kill(-runner.pid,'SIGTERM');await once(runner,'exit')}await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
