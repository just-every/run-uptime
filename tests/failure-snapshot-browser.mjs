import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
export async function snapshotBrowser(f,monitor,secrets=[]){
 const output=resolve(process.env.UPTIME_SCREENSHOTS??join(f.directory,'screens'));await mkdir(output,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,f.origin);
  const forbidden=[];page.on('request',request=>{if(new URL(request.url()).hostname==='snapshot-attacker.example.test')forbidden.push(true)});
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(f.origin+`/app/monitors/${monitor.id}`);
   const panel=page.locator('#failure-snapshots');await panel.getByText('1 retained snapshots in this selection.',{exact:false}).waitFor();
   await panel.locator('.failure-snapshot summary').click();await panel.scrollIntoViewIfNeeded();
   assert.ok((await panel.innerText()).includes('Service Unavailable'));assert.equal(await panel.locator('script,img').count(),0);assert.deepEqual(forbidden,[]);
   await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
   assert.deepEqual(await panel.evaluate(async node=>(await axe.run(node)).violations.map(v=>v.id)),[]);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await panel.screenshot({path:join(output,`failure-snapshot-${width}.png`)});
   const tree=await panel.ariaSnapshot();assert.ok(tree.includes('Redacted response excerpt'));await writeFile(join(output,`failure-snapshot-${width}.aria.txt`),tree);
   const selectionDownload=page.waitForEvent('download');await panel.getByRole('button',{name:'Download selection as JSON'}).click();const download=await selectionDownload;const downloaded=await readFile(await download.path(),'utf8');assert.equal(JSON.parse(downloaded).length,1);for(const secret of secrets)assert.ok(!downloaded.includes(secret),'download remains redacted');
   await panel.getByText('Retention and redaction',{exact:true}).click();const input=panel.getByLabel('Retention days (1–365)');await input.fill('0');await panel.getByRole('button',{name:'Save snapshot settings'}).click();assert.equal(await input.evaluate(node=>node.validity.valid),false);
   await input.fill('30');await panel.getByLabel('Literal masks (one per line; up to 20)').fill('Visible diagnostic marker');await panel.getByRole('button',{name:'Save snapshot settings'}).click();await panel.getByText('Snapshot settings saved.',{exact:true}).waitFor();
   await panel.getByRole('button',{name:'Load failure snapshots'}).click();await panel.getByText('1 retained snapshots in this selection.',{exact:false}).waitFor();assert.ok(!(await panel.innerText()).includes('Visible diagnostic marker\n'));
   await input.focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#snapshot-masks').evaluate(node=>node===document.activeElement),true);
   await panel.screenshot({path:join(output,`failure-snapshot-settings-${width}.png`)});
   await page.reload();await page.locator('#failure-snapshots').getByText('1 retained snapshots in this selection.',{exact:false}).waitFor();assert.equal(await page.locator('#snapshot-retention').inputValue(),'30');
   await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
   const incident=page.locator('#monitor-incidents');await incident.getByText('Incident evidence',{exact:true}).click();await incident.getByRole('button',{name:'Load incident failure snapshots'}).click();await incident.locator('.failure-snapshot').waitFor();await incident.locator('.failure-snapshot summary').click();assert.deepEqual(await incident.evaluate(async node=>(await axe.run(node)).violations.map(v=>v.id)),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await incident.screenshot({path:join(output,`incident-failure-snapshot-${width}.png`)});
  }
  // Capture the destructive end state once at each width. The next failure can create a new snapshot.
  await page.locator('#failure-snapshot-settings summary').click();await page.locator('#erase-failure-snapshots').click();await page.getByText('Snapshot erasure completed.',{exact:true}).waitFor();
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const panel=page.locator('#failure-snapshots');await panel.screenshot({path:join(output,`failure-snapshots-erased-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(f.origin+'/docs/monitors');await page.getByRole('heading',{name:'Failure snapshots',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(output,`failure-snapshot-guide-${width}.png`)});await page.getByText('This is the text-snapshot subset of EVIDENCE-002.',{exact:false}).scrollIntoViewIfNeeded();await page.screenshot({path:join(output,`failure-snapshot-guide-bounds-${width}.png`)});await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id)),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 }finally{await browser.close()}
}
