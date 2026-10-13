import {testAuthBindings,browserSignIn} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startLocalWorker} from '../scripts/local-worker.mjs';
import {auditNotificationView,assertTabsFit,assertNoSampleHost} from './notify-browser-audit.mjs';
import {notificationJourney} from './notify-browser-journey.mjs';
import {notificationMailFake} from './notify-browser-wire.mjs';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const scratch=process.env.TMPDIR||join(root,'..','tmp');
const evidence=resolve(process.env.UPTIME_UI_EVIDENCE??resolve(tmpdir(),'uptime-console-evidence'));
const runnerKey='console-smoke-runner-key-local-only-20261007';
const children=[];
let worker,browser,logs='';
let scratchDir;

async function portAvailable(port){
  const server=createServer();
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});return true}
  catch{return false}
  finally{await new Promise(resolve=>server.close(()=>resolve()))}
}
async function ports(){
  const free=[];
  for(let port=15519;port>=15480&&free.length<2;port--)if(await portAvailable(port))free.push(port);
  assert.equal(free.length,2,'two free ports in the assigned 15480–15519 range');
  return {control:free[0],fixture:free[1]};
}
function start(args,env={}){
  const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,...env},stdio:'pipe'});
  child.stdout.on('data',chunk=>logs+=chunk);
  child.stderr.on('data',chunk=>logs+=chunk);
  children.push(child);
  return child;
}
async function command(args){
  const child=start(args);
  const code=await new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('exit',resolve);
  });
  assert.equal(code,0,`command failed: ${args.join(' ')}\n${logs.slice(-5000)}`);
}
async function waitFor(fn,label,timeout=30000){
  const until=Date.now()+timeout;
  let last;
  while(Date.now()<until){
    try{const value=await fn();if(value)return value}catch(error){last=error}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw Error(`${label} did not complete${last?`: ${last.message}`:''}\n${logs.slice(-6000)}`);
}
function stop(child){if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM')}
async function stopChildren(){
  for(const child of children.slice().reverse())stop(child);
  await Promise.all(children.map(child=>new Promise(resolve=>child.exitCode!==null||child.signalCode!==null?resolve():child.once('exit',resolve))));
}

try{
  await mkdir(scratch,{recursive:true});
  await mkdir(evidence,{recursive:true});
  scratchDir=await mkdtemp(join(scratch,'uptime-console-smoke-'));
  process.env.TMPDIR=scratchDir;
  const persist=join(scratchDir,'worker'),grant=join(scratchDir,'synthetic-grant.json');
  const assigned=await ports(),origin=`http://127.0.0.1:${assigned.control}`;
  const mailFake=notificationMailFake();
  const bindings={...testAuthBindings,MAIL_FROM:'Uptime review <review@example.com>',MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'local-test-sendgrid-key',UPTIME_RUNNER_KEY:runnerKey,UPTIME_SYNTHETIC_PORT:String(assigned.fixture)};

  await command(['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','uptime-local','--local','--persist-to',persist]);
  start(['runners/src/synthetic.mjs'],{UPTIME_SYNTHETIC_PORT:String(assigned.fixture),UPTIME_GRANT_FILE:grant});
  await waitFor(async()=>{const response=await fetch(`http://127.0.0.1:${assigned.fixture}/health`);return response.ok},'owned fixture ready');
  worker=await startLocalWorker({root,port:assigned.control,persist,bindings,outboundService:mailFake.outboundService});
  await waitFor(async()=> (await fetch(origin+'/health')).ok,'local Worker ready');

  browser=await chromium.launch({headless:true,args:['--disable-gpu'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage(),pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  const providerSignIn=async()=>{
    const previous=mailFake.authMessages.length;
    await page.goto(origin+'/login');await page.getByLabel('Email address').fill(bindings.OWNER_EMAIL);await page.getByRole('button',{name:'Send sign-in link'}).click();
    await waitFor(()=>mailFake.authMessages.length>previous,'Base provider sign-in message');
    const text=mailFake.authMessages.at(-1).content.find(part=>part.type==='text/plain').value,link=text.match(/https?:\/\/[^\s]+\/auth\/confirm\?[^\s]+/);
    assert.ok(link,'the actual Base mail envelope carries the sign-in link');await page.goto(link[0]);await page.getByRole('button',{name:/confirm|sign in/i}).click();await page.waitForURL(origin+'/app');
  };
  const ownerOverview=async()=>{
    const response=await page.request.get(origin+'/api/overview',{maxRetries:3});
    return {response,data:await response.json()};
  };
  await browserSignIn(page,origin,{bindings});
  await page.locator('html.signed-in').waitFor({timeout:15000});
  const second=(await (await page.request.post(origin+'/api/runners',{data:{networkLabel:'console-second-network'}})).json());
  await page.getByRole('heading',{name:'No monitors yet'}).waitFor();
  assert.equal(await page.locator('#notice').isHidden(),true,'initial sign-in does not show a false recovery notice');

  async function capture(state,width){
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(100);
    const extents=await page.evaluate(()=>({
      viewport:innerWidth,
      document:document.documentElement.scrollWidth,
      body:document.body.scrollWidth,
      list:document.querySelector('.monitor-list')?{
        width:document.querySelector('.monitor-list').clientWidth,
        scroll:document.querySelector('.monitor-list').scrollWidth,
        links:[...document.querySelectorAll('.monitor-list .monitor-link')].map(el=>({width:el.clientWidth,scroll:el.scrollWidth})),
      }:null,
    }));
    assert.ok(extents.document<=width+1,`${state}-${width} document overflow: ${JSON.stringify(extents)}`);
    assert.ok(extents.body<=width+1,`${state}-${width} body overflow: ${JSON.stringify(extents)}`);
    if(extents.list){
      assert.ok(extents.list.scroll<=extents.list.width+1,`${state}-${width} monitor list overflow: ${JSON.stringify(extents)}`);
      for(const link of extents.list.links)assert.ok(link.scroll<=link.width+1,`${state}-${width} monitor name or URL overflow: ${JSON.stringify(extents)}`);
    }
    assert.deepEqual(pageErrors,[],`${state}-${width} pageerror`);
    await auditNotificationView({page,label:state,width,evidence,pageErrors});
    return extents;
  }

  await assertNoSampleHost(page,'served console');
  for(const width of [390,320]){await page.setViewportSize({width,height:900});await assertTabsFit(page,width)}
  await page.setViewportSize({width:1440,height:900});
  let failedReads=0;
  await page.route(origin+'/api/overview',route=>{failedReads++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Local read unavailable'})})},{times:1});
  await page.locator('#read-notice').filter({hasText:'Refresh unavailable'}).waitFor({timeout:10000});
  await page.unroute(origin+'/api/overview');
  await page.locator('#read-notice').filter({hasText:'Refresh recovered'}).waitFor({timeout:10000});
  assert.equal(failedReads,1,'one failed overview read is followed by a real successful refresh');
  const checks=[];
  checks.push({state:'empty',width:1440,overflow:await capture('empty',1440)});
  checks.push({state:'empty',width:390,overflow:await capture('empty',390)});
  checks.push({state:'empty',width:320,overflow:await capture('empty',320)});
  await page.setViewportSize({width:1440,height:900});

  const name='Local monitoring endpoint with a deliberately long owner visible name';
  await page.getByRole('button',{name:/NEW MONITOR/i}).click();
  await page.locator('html.editor-ready').waitFor({timeout:15000});
  await assertNoSampleHost(page,'served editor');
  for(const width of [1440,390,320])checks.push(await auditNotificationView({page,label:'new-monitor-url-step',width,evidence,pageErrors}));
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Fill in the form yourself',exact:true}).click();
  for(const width of [1440,390,320])checks.push(await auditNotificationView({page,label:'new-monitor-editor',width,evidence,pageErrors}));
  await page.setViewportSize({width:1440,height:900});
  await page.locator('input[name="name"]:visible').first().fill(name);
  await page.locator('input[name="url"]:visible').first().fill(`http://127.0.0.1:${assigned.fixture}/health`);
  await page.locator('input[name=probes][value=local-b]').check();
  await page.locator('select[name=runner-local-b]').selectOption(second.runnerId);
  await page.getByRole('button',{name:'Save monitor'}).first().click();
  await page.locator('html.signed-in').waitFor({timeout:15000});
  const created=await waitFor(async()=>{
    const result=await ownerOverview();
    return result.response.ok()?result.data.monitors.find(m=>m.definition.name===name):null;
  },'persisted owner-created monitor');
  assert.equal(created.definition.name,name);
  assert.equal(created.definition.url,`http://127.0.0.1:${assigned.fixture}/health`);
  assert.equal(created.state.state,'Unknown','a new name-and-URL monitor has no inferred health');
  assert.deepEqual(created.definition.probes,['local-a','local-b']);
  assert.equal(created.availability.last24h.uptimePercent,null);
  assert.equal(created.availability.last24h.unknownPercent,100);
  await page.locator('.monitor-list .monitor-link').filter({hasText:name}).waitFor({timeout:15000});
  await page.reload({waitUntil:'networkidle'});
  await page.locator('html.signed-in').waitFor({timeout:15000});
  await page.locator('.monitor-list .monitor-link').filter({hasText:name}).waitFor({timeout:15000});
  const persistedAfterReload=await ownerOverview();
  assert.ok(persistedAfterReload.data.monitors.some(m=>m.id===created.id&&m.definition.name===name&&m.definition.url===created.definition.url),'the saved monitor survives a browser reload');
  const monitorPage=`${origin}/app/monitors/${encodeURIComponent(created.id)}`;
  const openMonitorPage=async(monitorName,url)=>{
    const link=page.locator('.monitor-list a.monitor-link').filter({hasText:monitorName});
    assert.equal(await link.getAttribute('href'),new URL(url).pathname,'the monitor name links to its own page');
    await link.click();
    await page.waitForURL(url);
    await page.locator('html.signed-in').waitFor({timeout:15000});
    await page.getByRole('heading',{level:1,name:monitorName}).waitFor({timeout:15000});
  };
  await openMonitorPage(name,monitorPage);
  await page.getByRole('button',{name:'Edit check'}).click();
  await page.locator('html.editor-ready').waitFor({timeout:15000});
  await assertNoSampleHost(page,'served editor');
  for(const link of ['.editor-back','.editor-cancel:visible'])assert.equal(await page.locator(link).getAttribute('href'),new URL(monitorPage).pathname,`${link} returns to the edited monitor's page`);
  await page.locator('input[name="intervalMinutes"]:visible').first().fill(String(5000/60000));
  await page.locator('input[name="timeoutSeconds"]:visible').first().fill('1');
  await page.locator('input[name="retries"]:visible').first().fill('1');
  await page.locator('input[name="confirmSlots"]:visible').first().fill('1');
  await page.locator('input[name="recoverSlots"]:visible').first().fill('1');
  await page.locator('input[name="freshnessMinutes"]:visible').first().fill(String(10000/60000));
  await page.getByRole('button',{name:'Save monitor'}).first().click();
  const configured=await waitFor(async()=>{
    const result=await ownerOverview();
    const monitor=result.data?.monitors?.find(m=>m.id===created.id);
    return monitor?.definition.intervalMs===5000?monitor:null;
  },'configured interval for timely signed-probe evidence');
  assert.equal(configured.definition.name,name);
  assert.equal(configured.definition.url,created.definition.url);
  await page.waitForURL(monitorPage);
  await page.locator('html.signed-in').waitFor({timeout:15000});
  await page.getByRole('link',{name:'Back to Monitors',exact:true}).click();
  await page.waitForURL(origin+'/app');
  await page.locator('html.signed-in').waitFor({timeout:15000});

  const longName='Public status endpoint with a long query string for narrow screens';
  const longUrl=`https://example.com/health?owner=${'x'.repeat(480)}`;
  await page.getByRole('button',{name:/NEW MONITOR/i}).click();
  await page.locator('html.editor-ready').waitFor({timeout:15000});
  await assertNoSampleHost(page,'served editor');
  await page.getByRole('button',{name:'Fill in the form yourself',exact:true}).click();
  await page.locator('input[name="name"]:visible').first().fill(longName);
  await page.locator('input[name="url"]:visible').first().fill(longUrl);
  await page.locator('input[name=probes][value=local-b]').check();
  await page.locator('select[name=runner-local-b]').selectOption(second.runnerId);
  await page.getByRole('button',{name:'Save monitor'}).first().click();
  const longMonitor=await waitFor(async()=>{
    const result=await ownerOverview();
    return result.data?.monitors?.find(m=>m.definition.name===longName)||null;
  },'persisted monitor with long public query URL');
  await page.locator('.monitor-list .monitor-link').filter({hasText:longName}).waitFor({timeout:15000});
  assert.equal(longMonitor.definition.url,longUrl);
  assert.equal(longMonitor.definition.enabled,true);
  const pause=await page.request.patch(`${origin}/api/monitors/${longMonitor.id}`,{data:{...longMonitor.definition,enabled:false}});
  assert.equal(pause.status(),200,'the long-URL monitor can be paused through the owner API');
  const pausedLongMonitor=await waitFor(async()=>{
    const result=await ownerOverview();
    const monitor=result.data?.monitors?.find(m=>m.id===longMonitor.id);
    return monitor?.definition.enabled===false&&monitor.state.state==='Paused'?monitor:null;
  },'paused long-URL monitor before runner starts');
  assert.equal(pausedLongMonitor.availability.last24h.unknownPercent,100);

  const startRunner=()=>[start(['runners/src/private-runner.mjs'],{UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:runnerKey,UPTIME_GRANT_FILE:grant,UPTIME_LOCAL_REVIEW:'true'}),start(['runners/src/private-runner.mjs'],{UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:second.key,UPTIME_RUNNER_ID:second.runnerId,UPTIME_GRANT_FILE:grant,UPTIME_LOCAL_REVIEW:'true'})];
  const stopRunner=async runners=>{for(const runner of runners){stop(runner);await new Promise(resolve=>runner.exitCode!==null||runner.signalCode!==null?resolve():runner.once('exit',resolve))}};
  const probeRunner=startRunner();
  const populated=await waitFor(async()=>{
    const result=await ownerOverview();
    const monitor=result.data?.monitors?.find(m=>m.id===created.id);
    return monitor?.availability?.lastCheckAt&&monitor.state.state==='Healthy'&&monitor.availability.last24h.unknownPercent<100?monitor:null;
  },'real signed passing observation',30000);
  assert.ok(populated.availability.responseDurationMs>=0);
  assert.ok(populated.availability.last24h.observedMs>0);
  assert.ok(populated.availability.last24h.uptimePercent>0);
  assert.ok(populated.availability.last24h.unknownPercent<100);
  const rule='Uptime counts only observed time. Time without a valid scheduled result is Unknown, never counted as up.';
  await page.locator('.monitor-list .monitor-row').filter({hasText:name}).locator('.coverage-label').filter({hasText:/passing · /}).first().waitFor({timeout:10000});
  assert.deepEqual(await page.locator('#content-area .metric-basis').allInnerTexts(),[rule],'the list states the coverage rule once, not in every cell');
  assert.equal(await page.locator('#side-panel').isHidden(),true,'the monitor list has no side inspector');
  checks.push({state:'populated-list',width:1440,overflow:await capture('populated-list',1440)});
  checks.push({state:'populated-list',width:390,overflow:await capture('populated-list',390)});
  checks.push({state:'populated-list',width:320,overflow:await capture('populated-list',320)});
  for(const width of [390,320]){await page.setViewportSize({width,height:900});await openMonitorPage(name,monitorPage);await page.waitForFunction(()=>{const r=document.querySelector('#monitor-detail-heading').getBoundingClientRect();return r.top>=-1&&r.top<innerHeight});await page.getByRole('link',{name:'Back to Monitors',exact:true}).click();await page.waitForURL(origin+'/app');await page.locator('html.signed-in').waitFor({timeout:15000})}
  await page.setViewportSize({width:1440,height:900});
  await openMonitorPage(name,monitorPage);
  await page.locator('#monitor-state.badge').filter({hasText:'Healthy'}).waitFor({timeout:10000});
  assert.ok(await page.locator('#monitor-state.badge').evaluate(e=>e.classList.contains('healthy')),'Healthy state badge uses the healthy token');
  await page.locator('#raw-history .check-result.passed').first().waitFor();
  assert.deepEqual(await page.locator('#monitor-page .metric-basis').allInnerTexts(),[rule],'the monitor page states the coverage rule once');
  assert.deepEqual(await page.locator('#monitor-page .detail-metrics dt').allTextContents(),['Last check','Response duration']);
  assert.doesNotMatch(await page.locator('.ui-main').innerText(),/selected probes|failure quorum|scheduled-slot confirmation/i);
  await page.locator('#monitor-page .coverage-unknown').filter({hasText:/^(?:\d+\.\d{2}%|over 99\.99%) Unknown \(no valid result\)$/}).first().waitFor();
  checks.push({state:'populated',width:1440,overflow:await capture('populated',1440)});
  checks.push({state:'populated',width:390,overflow:await capture('populated',390)});
  checks.push({state:'populated',width:320,overflow:await capture('populated',320)});

  // The page's own refresh is the update signal: wait for the overview read it receives that reports Failing, then for
  // the badge it renders from that read, instead of a fixed wait that races the five-second refresh.
  const failingRefresh=page.waitForResponse(async response=>{if(!response.url().endsWith('/api/overview')||!response.ok())return false;const body=await response.json().catch(()=>null);return body?.monitors?.find(m=>m.id===created.id)?.state?.state==='Failing'},{timeout:60000});
  const mode=await fetch(`http://127.0.0.1:${assigned.fixture}/control`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'failing'})});
  assert.equal(mode.status,200,'owned fixture failure mode set');
  const failing=await waitFor(async()=>{
    const result=await ownerOverview();
    const monitor=result.data?.monitors?.find(m=>m.id===created.id);
    return monitor?.availability?.lastCheckAt>populated.availability.lastCheckAt&&monitor.state.state==='Failing'&&monitor.availability.last24h.notPassingMs>0?monitor:null;
  },'real signed failing observation',25000);
  assert.ok(failing.availability.last24h.notPassingMs>0,'a real failed result contributes its actual observed duration even when its share rounds to 0.00% of a day');
  assert.ok(failing.availability.last24h.unknownPercent<100);
  await failingRefresh;
  await page.locator('#monitor-state.badge').filter({hasText:'Failing'}).waitFor();
  await page.locator('#raw-history .check-result.failed').filter({hasText:'Failed · HTTP 503'}).first().waitFor();
  assert.match(await page.locator('#monitor-page .status-explanation').innerText(),/latest scheduled check did not pass/i);
  checks.push({state:'failing',width:1440,overflow:await capture('failing',1440)});
  checks.push({state:'failing',width:390,overflow:await capture('failing',390)});
  checks.push({state:'failing',width:320,overflow:await capture('failing',320)});
  await page.setViewportSize({width:1440,height:900});
  // A runner outage longer than two 5 s intervals: the next claim records the skipped intervals in missed_count, and the
  // page shows them as missed scheduled checks with no result (the hollow Unknown ring) in the list and the strip. The
  // late slot ran after its gap, so it sits above the gap at its run time with its due time in the meta, and the newest
  // row and mark are a real result.
  await stopRunner(probeRunner);
  await page.waitForTimeout(12000);
  const resumedRunner=startRunner();
  await page.locator('#raw-history details:has(+ .slot-missed) .slot-late').first().waitFor({timeout:20000});
  const missedRow=page.locator('#raw-history .slot-missed').first();
  assert.ok(await missedRow.evaluate(row=>/ · No result · (Scheduled check|\d+ scheduled checks) missed \(no result available\)$/.test(row.textContent)&&row.querySelector('.check-result.unknown')&&!row.querySelector('.passed')&&document.querySelector('#history-strip :is(.ui-dot.missed, .strip-run.missed)')),'a missed-slot gap renders as missed scheduled checks, never as passing');
  assert.ok(await page.locator('#raw-history .check-list').evaluate(list=>list.firstElementChild.matches('details')&&/^Scheduled check \w+ · due .+ · ran .+ late · /.test(list.querySelector('details:has(+ .slot-missed) .slot-meta').textContent)&&[...document.querySelectorAll('#history-strip :is(.ui-dot, .strip-run)')].at(-1).matches('.ui-dot:not(.missed)')),'a late slot is listed and drawn after its gap at its run time, so the newest row and mark are a real result');
  await page.getByRole('link',{name:'Back to Monitors',exact:true}).click();
  await page.waitForURL(origin+'/app');
  await page.locator('html.signed-in').waitFor({timeout:15000});

  await stopRunner(resumedRunner);
  const notificationChecks=await notificationJourney({page,origin,runnerKey,mailFake,evidence,pageErrors,grantPath:grant});
  checks.push(...notificationChecks);
  await page.locator('[data-view=runners]').click();
  await page.getByRole('heading',{name:'Local check runner',exact:true}).waitFor();
  for(const width of [1440,390,320])checks.push(await auditNotificationView({page,label:'runner-archive',width,evidence,pageErrors}));
  await page.locator('[data-view=monitors]').click();
  const final=await ownerOverview();
  assert.equal(final.response.status(),200);
  assert.ok(final.data.monitors.some(m=>m.id===created.id&&m.definition.name===name&&m.definition.url===`http://127.0.0.1:${assigned.fixture}/health`));
  assert.ok(final.data.monitors.some(m=>m.id===longMonitor.id&&m.definition.name===longName&&m.definition.url===longUrl&&m.state.state==='Paused'));
  assert.deepEqual(pageErrors,[],'every browser pageerror must fail the smoke');
  await page.setViewportSize({width:390,height:900});
  await assertTabsFit(page,390);
  await page.getByRole('link',{name:'Sign out',exact:true}).click();
  await page.getByLabel('Email address').waitFor({timeout:10000});
  assert.equal((await page.request.get(origin+'/api/overview',{maxRetries:3})).status(),401,'sign-out revokes the browser session');
  checks.push(await auditNotificationView({page,label:'signed-out',width:390,evidence,pageErrors,navigation:false}));
  const denied=await page.request.post(origin+'/auth/confirm',{headers:{origin},data:{token:'invalid-confirmation-token'},maxRedirects:0});
  assert.equal(denied.status(),400,'an invalid sign-in link cannot create a browser session');
  assert.equal((await page.request.get(origin+'/api/overview')).status(),401);
  await providerSignIn();
  await page.locator('html.signed-in').waitFor({timeout:15000});
  assert.equal((await page.request.get(origin+'/api/overview',{maxRetries:3})).status(),200,'the real owner link restores the browser session');
  assert.deepEqual(pageErrors,[],'browser sign-out, rejected login and login must not cause pageerrors');
  await page.setViewportSize({width:320,height:900});await assertTabsFit(page,320);
  await page.getByRole('link',{name:'Sign out',exact:true}).click();
  await page.getByLabel('Email address').waitFor({timeout:10000});
  assert.equal((await page.request.get(origin+'/api/overview',{maxRetries:3})).status(),401,'320px sign-out revokes the browser session');
  checks.push(await auditNotificationView({page,label:'signed-out',width:320,evidence,pageErrors,navigation:false}));
  await providerSignIn();
  await page.locator('html.signed-in').waitFor({timeout:15000});
  assert.equal((await page.request.get(origin+'/api/overview',{maxRetries:3})).status(),200,'320px valid login restores the browser session');
  await (await import('node:fs/promises')).writeFile(join(evidence,'RESULTS.json'),JSON.stringify({checks,monitorId:created.id,storedDefinition:{name,url:created.definition.url},longUrlMonitor:{id:longMonitor.id,name:longName,url:longUrl,pausedBeforeRunner:true},persistenceAfterBrowserReload:true,ownerSession:{signoutRevoked:true,rejectedLink:true,validLinkRestored:true},passingObservation:{at:populated.availability.lastCheckAt,responseDurationMs:populated.availability.responseDurationMs},failingObservation:{at:failing.availability.lastCheckAt,state:failing.state.state},notificationViews:notificationChecks.length,refreshFailureRecovery:true,narrowTabs:[390,320],observationSource:'real local Worker D1 and local fixture through signed private runner',pageErrors:pageErrors.length},null,2));
  await context.close();
  console.log(`CONSOLE-001 passed: persisted name+URL, signed passing/failing observations, native notification CRUD and real runner deliveries, audited 1440/390/320 views, 390/320 sign-out, and no horizontal overflow or pageerrors. Evidence ${evidence}`);
}finally{
  try{if(browser)await browser.close()}
  finally{
    try{if(worker)await worker.dispose()}
    finally{
      await stopChildren();
      // Remove only this test's D1 and fixture grant scratch; screenshots are deliverables.
      if(scratchDir)await rm(scratchDir,{recursive:true,force:true});
    }
  }
}
