// UDP-001: configure, validate, save, execute and inspect actual UDP evidence.
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
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
let worker,browser,canary;const udp=dgram.createSocket('udp4');
try{
 udp.on('message',(_,remote)=>udp.send(Buffer.from('PONG'),remote.port,remote.address));udp.bind(0,'127.0.0.1');await once(udp,'listening');
 const certs=await certificates(directory);canary=https.createServer(certs.web,(_,res)=>{res.writeHead(200);res.end()});const canaryPort=await listen(canary);
 ({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);await mkdir(screens,{recursive:true});
 const shot=async(name)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);assert.match(await page.locator('body').ariaSnapshot(),/UDP/);await page.screenshot({path:join(screens,name),fullPage:true})};
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/monitor');await page.locator('.editor-ready').waitFor();await page.locator('#discovery-manual').click();
  const form=page.locator('form').filter({has:page.locator('[name=checkType]')});
  await form.locator('[name=checkType]').selectOption('udp');await form.getByLabel('Monitor name',{exact:true}).fill(`US West game gateway ${width}`);
  await form.getByLabel('UDP host',{exact:true}).fill('udp.protocol.test');await form.getByLabel('UDP port',{exact:true}).fill('9000');
  await form.getByLabel('Request bytes (hexadecimal)',{exact:true}).fill('50494e47');await form.getByLabel('Expected response bytes (hexadecimal)',{exact:true}).fill('504f4e47');
  await form.locator('[name=canary-local-a]').fill('https://canary.protocol.test/ok');await form.locator('[name=retries]').fill('0');await form.locator('[name=confirmSlots]').fill('1');await form.locator('[name=recoverSlots]').fill('1');
  await shot(`udp-editor-${width}.png`);
  await form.getByLabel('Expected response bytes (hexadecimal)',{exact:true}).fill('not hex');await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.locator('#editor-feedback[data-error]').waitFor();assert.match(await page.locator('#editor-feedback').textContent(),/hexadecimal/);
  await form.getByLabel('Expected response bytes (hexadecimal)',{exact:true}).fill('504f4e47');await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.waitForURL(origin+'/app');
  const list=await(await page.request.get(origin+'/api/overview')).json(),m=list.monitors.find(m=>m.definition.name===`US West game gateway ${width}`);assert.ok(m);assert.equal(m.definition.type,'udp');
  const child=spawn(process.execPath,['--import',resolve('tests/udp-routing.mjs'),'--input-type=module','-e',"import {runRunner} from './runners/src/private-runner.mjs';await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,localReview:true,once:true});"],{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:testAuthBindings.UPTIME_RUNNER_KEY,NODE_EXTRA_CA_CERTS:certs.caPath,PROTOCOL_HTTPS_PORT:String(canaryPort),UDP_TARGET_PORT:String(udp.address().port)},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),30000);try{assert.equal((await once(child,'exit'))[0],0,output.slice(0,1200))}finally{clearTimeout(timer)}
  await page.goto(origin+`/app/monitors/${m.id}`);await page.locator('html.signed-in').waitFor();await page.locator('#monitor-state').filter({hasText:'Healthy'}).waitFor();
  await page.locator('#raw-history details').first().evaluate(e=>e.open=true);assert.match(await page.locator('#raw-history').textContent(),/matches the expected bytes/);await shot(`udp-evidence-${width}.png`);
  await page.getByRole('button',{name:'Edit check',exact:true}).click();await page.locator('.editor-ready').waitFor();assert.equal(await page.locator('[name=udpExpected]').inputValue(),'504f4e47');assert.equal(await page.locator('[name=checkType]').inputValue(),'udp');
  await page.request.patch(origin+`/api/monitors/${m.id}`,{headers:{origin},data:{...m.definition,enabled:false}});
  await page.goto(origin+'/docs/definitions');await page.getByRole('heading',{name:'The file',exact:true}).scrollIntoViewIfNeeded();await shot(`udp-definitions-${width}.png`);
 }
 console.log('UDP-001 browser PASS: desktop/phone create, validation, signed real UDP execution, retained evidence, edit/reload, axe, accessibility tree and reflow.');
}finally{await browser?.close();udp.close();await close(canary);await worker?.dispose();await cleanupDirectory(directory)}
