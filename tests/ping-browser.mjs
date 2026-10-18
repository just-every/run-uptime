// PING-001: owner editor -> signed ICMP runner -> immutable console evidence.
import assert from 'node:assert/strict';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn,testAuthBindings} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {certificates,listen,close} from './protocol-fixtures.mjs';
const directory=await runtimeDirectory(),screens=process.env.UPTIME_SCREENSHOTS??join(directory,'screens'),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
let worker,browser,canary;
try{
 const certs=await certificates(directory);canary=https.createServer(certs.web,(_,res)=>{res.writeHead(200);res.end()});const canaryPort=await listen(canary);
 ({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);await mkdir(screens,{recursive:true});
 const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);assert.match(await page.locator('body').ariaSnapshot(),/ICMP|Ping/);await page.screenshot({path:join(screens,name),fullPage:!name.includes('guide')})};
 const run=async mode=>{
  const child=spawn(process.execPath,['--import',resolve('tests/ping-routing.mjs'),'--input-type=module','-e',"import {runRunner} from './runners/src/private-runner.mjs';await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,localReview:true,once:true});"],{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:testAuthBindings.UPTIME_RUNNER_KEY,NODE_EXTRA_CA_CERTS:certs.caPath,PROTOCOL_HTTPS_PORT:String(canaryPort),PING_MODE:mode},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),40000);try{assert.equal((await once(child,'exit'))[0],0,output.slice(0,1200))}finally{clearTimeout(timer)}
 };
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/monitor');await page.locator('.editor-ready').waitFor();await page.locator('#discovery-manual').click();
  const form=page.locator('form').filter({has:page.locator('[name=checkType]')});
  await form.locator('[name=checkType]').selectOption('ping');await form.getByLabel('Monitor name',{exact:true}).fill(`Chicago gateway IPv6 ${width}`);
  await form.getByLabel('Ping host',{exact:true}).fill('ping.protocol.test');await form.locator('[name=pingFamily]').selectOption('6');
  await form.locator('[name=canary-local-a]').fill('https://canary.protocol.test/ok');await form.locator('[name=retries]').fill('0');await form.locator('[name=confirmSlots]').fill('1');await form.locator('[name=recoverSlots]').fill('1');
  await shot(`ping-editor-${width}.png`);
  // Transport-specific bounds are refused through the public save door.
  await form.locator('[name=timeoutSeconds]').fill('1');await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.locator('#editor-feedback[data-error]').waitFor();assert.match(await page.locator('#editor-feedback').textContent(),/timeout|8|8000/i);await shot(`ping-refused-${width}.png`);
  await form.locator('[name=timeoutSeconds]').fill('10');await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.waitForURL(origin+'/app');
  const list=await(await page.request.get(origin+'/api/overview')).json(),m=list.monitors.find(m=>m.definition.name===`Chicago gateway IPv6 ${width}`);assert.ok(m);assert.equal(m.definition.ping.family,6);
  await run('healthy');await page.goto(origin+`/app/monitors/${m.id}`);await page.locator('#monitor-state').filter({hasText:'Healthy'}).waitFor();await page.locator('#raw-history details').first().evaluate(e=>e.open=true);assert.match(await page.locator('#raw-history').textContent(),/packet|repl|ICMP/i);await shot(`ping-healthy-${width}.png`);
  await page.getByRole('button',{name:'Edit check',exact:true}).click();await page.locator('.editor-ready').waitFor();assert.equal(await page.locator('[name=pingFamily]').inputValue(),'6');assert.equal(await page.locator('[name=pingPackets]').inputValue(),'3');
  await page.request.patch(origin+`/api/monitors/${m.id}`,{headers:{origin},data:{...m.definition,enabled:false}});
  for(const [mode,state] of [['loss','Failing'],['denied','Unknown']]){
   const r=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{...m.definition,name:`Dallas gateway ${mode} ${width}`,ping:{...m.definition.ping,family:4},enabled:true}});assert.equal(r.status(),201);const next=await r.json();await run(mode);
   await page.goto(origin+`/app/monitors/${next.id}`);await page.locator('#monitor-state').filter({hasText:state}).waitFor();await page.locator('#raw-history details').first().evaluate(e=>e.open=true);await shot(`ping-${mode}-${width}.png`);
   await page.request.patch(origin+`/api/monitors/${next.id}`,{headers:{origin},data:{...next.definition,enabled:false}});
  }
  await page.goto(origin+'/docs/monitors');await page.getByRole('heading',{name:'ICMP ping',exact:true}).scrollIntoViewIfNeeded();await shot(`ping-guide-${width}.png`);
 }
 console.log('PING-001 browser PASS: desktop/phone configure, bound refusal, IPv6 save/reload, signed Healthy/Failing/Unknown evidence, axe, accessibility tree and reflow.');
}finally{await browser?.close();await close(canary);await worker?.dispose();await cleanupDirectory(directory)}
