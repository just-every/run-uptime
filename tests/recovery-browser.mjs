import {testAuthBindings,browserSignIn} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {startLocalWorker} from './mail-provider-fixture.mjs';

// Full restore/re-authorize workflow uses the owned live fixture and its
// current custody grant. No source-installation monitor is edited by this test.
const root=fileURLToPath(new URL('../',import.meta.url)),sourcePort=Number(process.env.UPTIME_RECOVERY_UI_SOURCE_PORT??15494),source=`http://127.0.0.1:${sourcePort}`,port=Number(process.env.UPTIME_RECOVERY_UI_PORT??15493);
if([sourcePort,port].some(p=>!Number.isInteger(p)||p<15485||p>15519)||sourcePort===port)throw Error('Distinct assigned recovery port required');
const origin=`http://127.0.0.1:${port}`,dir=await mkdtemp(join(tmpdir(),'uptime-recovery-ui-')),out=resolve(process.env.UPTIME_RECOVERY_UI_EVIDENCE??'data/recovery-evidence');
const require=createRequire(import.meta.url),checks=[];
async function auditWidths(page,label,state){
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const axeResult=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
  const session=await page.context().newCDPSession(page);let tree;try{tree=await session.send('Accessibility.getFullAXTree')}finally{await session.detach()}
  const nodes=tree.nodes.filter(node=>!node.ignored);
  assert.ok(nodes.some(node=>node.role?.value==='main'),label+' main landmark');
  if(state){
   assert.equal(await page.locator('#monitor-state').textContent(),state);
   assert.ok(nodes.some(node=>node.role?.value==='StaticText'&&node.name?.value===state),label+' textual state in computed accessibility tree');
   assert.ok((await page.locator('.status-explanation').textContent()).trim(),label+' explains state');
  }
  const extent=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  await Promise.all([writeFile(join(out,`${label}-${width}-axe.json`),JSON.stringify(axeResult,null,2)),writeFile(join(out,`${label}-${width}-accessibility.json`),JSON.stringify(tree,null,2)),page.screenshot({path:join(out,`${label}-${width}.png`),fullPage:true})]);
  assert.deepEqual(axeResult.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' axe');
  assert.ok(extent.scroll<=extent.width+1,label+' reflows');checks.push({label,width,state,violations:0,accessibilityNodes:nodes.length});
 }
}
const runnerKey='synthetic-review-only-runner-key-20261002';
let worker,sourceWorker,browser,runner,sourceRunner,logs='';const extraRunners=[];
function additionalRunner(url,identity){const child=spawn(process.execPath,[join(root,'runners/src/private-runner.mjs')],{cwd:root,env:{...process.env,UPTIME_CONTROL_ORIGIN:url,UPTIME_RUNNER_KEY:identity.key,UPTIME_RUNNER_ID:identity.runnerId,UPTIME_GRANT_FILE:join(root,'data/synthetic-grant.json'),UPTIME_LOCAL_REVIEW:'true'},stdio:'ignore'});extraRunners.push(child);return child}
// An installation with no monitors signs in to the first monitor's form; this suite works from the console's Locations.
async function login(page,url){await browserSignIn(page,url);await page.goto(url+'/app/locations');await page.locator('.signed-in').waitFor({timeout:15000});}
try{
 await mkdir(out,{recursive:true});
 const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:runnerKey,UPTIME_SYNTHETIC_PORT:'15481'};
 sourceWorker=await startLocalWorker({root,port:sourcePort,persist:join(dir,'source'),bindings});
 const sourceDB=await sourceWorker.getD1Database('DB');for(const name of (await readdir(join(root,'migrations'))).filter(n=>n.endsWith('.sql')).sort())for(const statement of splitSql(await readFile(join(root,'migrations',name),'utf8')))await sourceDB.prepare(statement).run();
 worker=await startLocalWorker({root,port,persist:join(dir,'control'),bindings:{...testAuthBindings,UPTIME_RUNNER_KEY:runnerKey,UPTIME_SYNTHETIC_PORT:'15481'}});
 const DB=await worker.getD1Database('DB');for(const name of (await readdir(join(root,'migrations'))).filter(n=>n.endsWith('.sql')).sort())for(const statement of splitSql(await readFile(join(root,'migrations',name),'utf8')))await DB.prepare(statement).run();
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:390,height:900}});await context.route('**/*',route=>{const url=new URL(route.request().url());return [source,origin].includes(url.origin)?route.continue():route.abort()});
 const sourcePage=await context.newPage();await login(sourcePage,source);const sourceSecond=await (await sourcePage.request.post(source+'/api/runners',{data:{networkLabel:'second-recovery-network'}})).json();
 const created=await sourcePage.request.post(source+'/api/monitors',{data:{name:'Recovery status assertion retained',url:'http://127.0.0.1:15481/health',probes:['local-a','local-b'],assertions:{status:201},confirmSlots:1,recoverSlots:1,retries:0,intervalMs:5000,freshnessMs:10000}});assert.equal(created.status(),201);
 sourceRunner=spawn(process.execPath,[join(root,'runners/src/private-runner.mjs')],{cwd:root,env:{...process.env,UPTIME_CONTROL_ORIGIN:source,UPTIME_RUNNER_KEY:runnerKey,UPTIME_GRANT_FILE:join(root,'data/synthetic-grant.json'),UPTIME_LOCAL_REVIEW:'true'},stdio:'pipe'});sourceRunner.stdout.on('data',c=>logs+=c);sourceRunner.stderr.on('data',c=>logs+=c);
 const sourceExtra=additionalRunner(source,sourceSecond);
 let confirmed=false;for(let i=0;i<200;i++){const state=await (await sourcePage.request.get(source+'/api/overview')).json();if(state.monitors[0]?.state.state==='Failing'&&state.alerts.length){confirmed=true;break}await new Promise(r=>setTimeout(r,100))}assert.ok(confirmed,'source archive must contain actual confirmed failure and trigger');
 sourceRunner.kill('SIGTERM');await new Promise(r=>sourceRunner.once('exit',r));sourceExtra.kill('SIGTERM');await new Promise(r=>sourceExtra.once('exit',r));
 const response=await sourcePage.request.get(source+'/api/archive');assert.equal(response.status(),200);const archive=await response.json();assert.ok(archive.payload.tables.monitors.length>0);assert.ok(archive.payload.tables.observations.length>0,'restoration needs real recorded observations');assert.ok(archive.payload.tables.outbox.length>0,'quarantine assertion requires actual prior alerts');await writeFile(join(out,'source-private-archive.json'),JSON.stringify(archive,null,2),{mode:0o600});assert.ok(!Object.hasOwn(archive.payload.tables,'runner_contact'));
 const archiveFile=join(dir,'private-archive.json');await writeFile(archiveFile,JSON.stringify(archive),{mode:0o600});await sourcePage.close();
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await login(page,origin);await page.getByRole('link',{name:'Locations',exact:true}).click();assert.equal(await page.locator('#locations-table tbody tr').first().locator('.ui-pill').textContent(),'Waiting to join');await page.getByRole('link',{name:'Archive',exact:true}).click();
 await page.locator('#restore:not(:disabled)').waitFor();await page.locator('#restore').setInputFiles(archiveFile);await page.locator('#notice').filter({hasText:'Archive restored.'}).waitFor({timeout:15000});
 let overview=await (await page.request.get(origin+'/api/overview')).json();assert.ok(overview.monitors.every(m=>!m.definition.enabled&&m.state.state==='Paused'));assert.ok(overview.alerts.every(a=>a.status==='imported-inactive'));assert.equal(overview.runner.contact.state,'Never seen');
 const first=overview.monitors[0],old=archive.payload.tables.monitors.find(m=>m.id===first.id);assert.equal(first.revision,old.revision+1);
 await auditWidths(page,'restored-archive');
 await page.getByRole('link',{name:'Monitors',exact:true}).click();const monitorPage=`${origin}/app/monitors/${encodeURIComponent(first.id)}`;await page.locator(`.catalog-rows a.monitor-link[href="${new URL(monitorPage).pathname}"]`).click();await page.waitForURL(monitorPage);await page.locator('html.signed-in').waitFor();await page.locator('#monitor-state.badge').filter({hasText:'Paused'}).waitFor();await auditWidths(page,'restored-paused','Paused');
 // The receiving owner adds a second location, whose runner joins before the restored monitor is pointed at both.
 const receivingSecond=await (await page.request.post(origin+'/api/runners',{data:{networkLabel:'second-receiving-network'}})).json();additionalRunner(origin,receivingSecond);
 for(const end=Date.now()+30000;!(await (await page.request.get(origin+'/api/runners')).json()).find(r=>r.runnerId===receivingSecond.runnerId).lastContactAt;){assert.ok(Date.now()<end,'the second receiving location joins');await new Promise(r=>setTimeout(r,250))}
 const identities=await (await page.request.get(origin+'/api/runners')).json();
 await page.getByRole('button',{name:'Resume',exact:true}).click();await page.locator('html.editor-context-ready').waitFor();for(const id of [identities.find(r=>r.builtIn).runnerId,receivingSecond.runnerId])await page.locator(`input[name=locations][value="${id}"]`).check();await page.getByRole('button',{name:'Save monitor'}).click();await page.getByRole('button',{name:'Resume',exact:true}).click();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
 runner=spawn(process.execPath,[join(root,'runners/src/private-runner.mjs')],{cwd:root,env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:runnerKey,UPTIME_GRANT_FILE:join(root,'data/synthetic-grant.json'),UPTIME_LOCAL_REVIEW:'true'},stdio:'pipe'});runner.stdout.on('data',c=>logs+=c);runner.stderr.on('data',c=>logs+=c);
 await page.locator('#monitor-state.badge').filter({hasText:'Failing'}).waitFor({timeout:30000});
 const history=await (await page.request.get(origin+`/api/monitors/${first.id}/history`)).json();assert.ok(history.some(slot=>!slot.manual&&slot.revision===first.revision+2&&slot.status==='complete'&&slot.observations.some(o=>o.outcome==='target_failure'&&o.status===200)),'new current-custody scheduled evidence required');
 overview=await (await page.request.get(origin+'/api/overview')).json();assert.equal(overview.runner.contact.state,'Fresh contact');assert.ok(archive.payload.tables.outbox.every(old=>overview.alerts.some(a=>a.id===old.id&&a.status==='imported-inactive')),'old alerts must not replay after deliberate resume');assert.ok(overview.alerts.some(a=>a.kind==='trigger'&&a.status==='pending'&&a.event.monitorRevision===first.revision+2),'a new confirmed failure must create a distinct current trigger');assert.equal(overview.monitors[0].definition.assertions.status,201,'success criteria must remain unchanged');
 await auditWidths(page,'reauthorized-current-evidence','Failing');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  // Scheduled checks can prepend a new row between browser commands. Keep the
  // identity the owner focused instead of resolving the moving first row again.
  const evidenceId=await page.locator('#raw-history details > summary').first().getAttribute('id');assert.ok(evidenceId);
  const summary=page.locator(`#raw-history summary[id=${JSON.stringify(evidenceId)}]`);await summary.focus();
  if(!await summary.evaluate(element=>element.parentElement.open))await summary.press('Enter');
  const focusedDisclosure=id=>document.activeElement?.id===id&&document.getElementById(id)?.closest('details')?.open;
  await page.waitForFunction(focusedDisclosure,evidenceId,{timeout:10000});
  // The row as rendered now. The poll and the history read it starts patch the list in place: afterwards this is the
  // same row, with focus still on it and no other row expanded above it.
  const rendered=await summary.elementHandle();
  await page.waitForResponse(response=>new URL(response.url()).pathname==='/api/overview'&&response.ok(),{timeout:12000});
  await page.waitForLoadState('networkidle');
  assert.ok(await page.evaluate(([id,rendered])=>document.getElementById(id)===rendered&&document.activeElement?.id===id&&document.querySelector('#raw-history details[open] summary')?.id===id,[evidenceId,rendered]),'confirmed failure evidence stays the same open row through polling at '+width);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),evidenceId,'confirmed failure evidence keeps keyboard focus through polling at '+width);
 }
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Resume',exact:true}).waitFor();
 await page.getByRole('link',{name:'Archive',exact:true}).click();const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download backup'}).click()]);await download.saveAs(join(out,'recovered-private-archive.json'));const recovered=JSON.parse(await readFile(join(out,'recovered-private-archive.json'),'utf8'));assert.ok(!Object.hasOwn(recovered.payload.tables,'runner_contact'));assert.ok(archive.payload.tables.outbox.every(old=>recovered.payload.tables.outbox.some(row=>row.id===old.id&&row.status==='imported-inactive')));
 await page.locator('#restore:disabled').waitFor();assert.match(await page.locator('#restore-help').textContent(),/empty installation/);const refused=await page.request.post(origin+'/api/restore',{data:{archive}});assert.equal(refused.status(),400,'the server still refuses a nonempty restore');assert.equal((await refused.json()).error,'Restore requires empty installation');
 await page.getByRole('link',{name:'Sign out',exact:true}).click();await page.getByLabel('Email address').waitFor();assert.equal((await page.request.get(origin+'/api/overview')).status(),401);assert.deepEqual(errors,[]);
 await writeFile(join(out,'RESULTS.json'),JSON.stringify({checks,source,restoredInstallation:origin,workflow:'Actual synthetic HTTP200/status201 confirmed failure and stored trigger; real native archive read; UI upload into empty independent D1; paused new revision/no inherited contact; explicit UI reauthorization; actual current-custody scheduled probes; no imported alert replay; UI re-export; nonempty-restore rejection; native session revocation',externalNetwork:false},null,2));
 console.log('RECOVERY-UI-001 passed: actual confirmed failure archive/trigger, independent desktop/mobile restore, deliberate reauthorization/unchanged criteria, current failed evidence/distinct new trigger, old-alert quarantine, re-export and signout.');
}finally{
 for(const child of extraRunners)if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r))}
 if(sourceRunner&&sourceRunner.exitCode===null){sourceRunner.kill('SIGTERM');await new Promise(r=>sourceRunner.once('exit',r))}
 if(runner&&runner.exitCode===null){runner.kill('SIGTERM');await new Promise(r=>runner.once('exit',r))}
 if(browser)await browser.close();if(worker)await worker.dispose();if(sourceWorker)await sourceWorker.dispose();await mkdir(out,{recursive:true});await writeFile(join(out,'runner.log'),logs);await rm(dir,{recursive:true,force:true});
}
