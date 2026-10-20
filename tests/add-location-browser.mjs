// Adding a location, through the console and a real runner process: the owner adds a location, copies its command, the
// runner started with exactly that command joins, the location is named after where it connects from, and the owner
// renames it and removes it. Where a request comes from is the one fake, at the network edge: Cloudflare's request.cf
// says Sydney. The empty installation also opens straight into the new-monitor form.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
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
 await page.waitForURL(url=>url.pathname==='/app/monitor');
 assert.equal(await page.locator('h1').textContent(),'Add your first monitor','with no monitors, finishing setup opens the new-monitor form');
 const runners=async()=>(await(await page.request.get(origin+'/api/runners')).json()).filter(r=>!r.revokedAt);

 await page.goto(origin+'/app#locations');await page.locator('#locations-table').waitFor();
 const before=await runners();
 await page.getByRole('button',{name:'Add location',exact:true}).click();
 const command=await page.locator('#location-command').textContent();
 const settings=Object.fromEntries([...command.matchAll(/^export (\w+)='([^']*)'$/gm)].map(match=>[match[1],match[2]]));
 assert.deepEqual(Object.keys(settings).sort(),['UPTIME_CONTROL_ORIGIN','UPTIME_LOCAL_REVIEW','UPTIME_RUNNER_ID','UPTIME_RUNNER_KEY'],'the command carries no name: where the runner joins from names it');
 assert.equal(command.trim().split('\n').at(-1),'node runners/src/private-runner.mjs');
 const added=(await runners()).find(r=>r.runnerId===settings.UPTIME_RUNNER_ID);
 assert.ok(added&&added.lastContactAt===null&&!before.some(r=>r.runnerId===added.runnerId),'the new location waits to join');
 assert.equal(await page.locator('#location-waiting').textContent(),'Waiting for it to join…');

 // The runner, started on this machine with the command's settings and nothing else.
 runner=spawn(process.execPath,['runners/src/private-runner.mjs'],{env:{PATH:process.env.PATH,HOME:process.env.HOME,...settings,UPTIME_GRANT_FILE:join(directory,'grant.json')},stdio:['ignore','pipe','pipe']});
 runner.stdout.on('data',chunk=>output+=chunk);runner.stderr.on('data',chunk=>output+=chunk);
 await page.locator('#location-joined').filter({hasText:'Sydney joined'}).waitFor({timeout:30000});
 const joined=(await runners()).find(r=>r.runnerId===settings.UPTIME_RUNNER_ID);
 assert.equal(joined.networkLabel,'Sydney','named after the place it connects from');assert.ok(joined.lastContactAt);
 await page.locator(`tr[data-key="location-${joined.runnerId}"] .location-badge`).filter({hasText:'Just joined'}).waitFor();
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.locator('#add-location').waitFor({state:'detached'});

 // Rename: the owner's name stays, and the running runner keeps checking in under it.
 await page.locator(`[data-rename="${joined.runnerId}"]`).click();await page.locator('#location-name').fill('Sydney office');await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('.location-name',{hasText:'Sydney office'}).waitFor();
 const renamedAt=Date.now();
 await waitFor('the renamed location to keep checking in',async()=>{const row=(await runners()).find(r=>r.runnerId===joined.runnerId);return row.networkLabel==='Sydney office'&&row.lastContactAt>renamedAt});

 // Remove: the location leaves the list and its key stops working.
 page.once('dialog',dialog=>dialog.accept());
 await page.locator(`[data-remove="${joined.runnerId}"]`).click();
 await page.locator(`tr[data-key="location-${joined.runnerId}"]`).waitFor({state:'detached'});
 const refused=await fetch(origin+'/api/runner/claim',{method:'POST',headers:{'content-type':'application/json','x-runner-id':joined.runnerId,'x-runner-key':settings.UPTIME_RUNNER_KEY},body:'{}'});
 assert.equal(refused.status,401,'a removed location cannot check in');
 assert.deepEqual(errors,[],'browser exceptions');
 console.log('ADD-LOCATION: added, joined as Sydney from its place, renamed, still checking in, removed.');
}finally{if(runner&&runner.exitCode===null){runner.kill('SIGTERM');await once(runner,'exit')}await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
