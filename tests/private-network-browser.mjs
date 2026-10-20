// PRIVATE-001 console: choose scope, provision a local grant, inspect evidence and runner readiness.
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn,testAuthBindings} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {certificates,listen,close} from './protocol-fixtures.mjs';
const directory=await runtimeDirectory(),screens=process.env.UPTIME_SCREENSHOTS??join(directory,'screens'),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
let worker,browser,web,canary;
try{
 const certs=await certificates(directory);canary=https.createServer(certs.web,(_,res)=>{res.writeHead(200);res.end()});const canaryPort=await listen(canary);
 web=http.createServer((_,res)=>{res.writeHead(200);res.end('Warehouse checkout ready')});const httpPort=await listen(web);
 await mkdir(join(directory,'grants'),{mode:0o700});const grants=await realpath(join(directory,'grants'));
 ({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
 const run=async()=>{
  const child=spawn(process.execPath,['--import',resolve('tests/private-network-routing.mjs'),'--input-type=module','-e',"import {runRunner} from './runners/src/private-runner.mjs';await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,localReview:true,once:true});"],{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:testAuthBindings.UPTIME_RUNNER_KEY,UPTIME_PRIVATE_GRANT_DIR:grants,PRIVATE_HTTP_PORT:String(httpPort),PROTOCOL_HTTPS_PORT:String(canaryPort),NODE_EXTRA_CA_CERTS:certs.caPath},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),30000);try{assert.equal((await once(child,'exit'))[0],0,output.slice(0,1500))}finally{clearTimeout(timer)}
 };
 await run();browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);await mkdir(screens,{recursive:true});
 const shot=async(name,fullPage=true,section)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(async selector=>{if(!selector)return axe.run(document);const heading=document.querySelector(selector),nodes=[heading];for(let node=heading.nextElementSibling;node&&!/^H[12]$/.test(node.tagName);node=node.nextElementSibling)nodes.push(node);return axe.run(nodes)},section)).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);assert.ok((await page.locator('body').ariaSnapshot()).length);const clip=section?await page.evaluate(selector=>{const heading=document.querySelector(selector);let last=heading;for(let node=heading.nextElementSibling;node&&!/^H[12]$/.test(node.tagName);node=node.nextElementSibling)last=node;const top=heading.getBoundingClientRect().top+scrollY,bottom=last.getBoundingClientRect().bottom+scrollY;return{x:0,y:Math.floor(top),width:innerWidth,height:Math.ceil(bottom-top)}},section):undefined;await page.screenshot({path:join(screens,name),...(clip?{clip,fullPage:true}:{fullPage})})};
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/monitor');await page.locator('.editor-ready').waitFor();await page.locator('#discovery-manual').click();
  await page.locator('[name=name]').fill(`US warehouse checkout ${width}`);await page.locator('[name=networkScope]').selectOption('private');await page.locator('[name=privateGrantRef]').fill('warehouse-local');await page.locator('[name=url]').fill('http://checkout.internal.test:8080/health');await page.locator('.add-rule summary').click();await page.getByRole('button',{name:'Page contains',exact:true}).click();await page.locator('[name=body]').fill('Warehouse checkout ready');await page.locator('[name=canary-local-a]').fill('https://canary.protocol.test/ok');await page.locator('[name=intervalMinutes]').fill(String(5000/60000));await page.locator('[name=retries]').fill('0');await page.locator('[name=confirmSlots]').fill('1');await page.locator('[name=recoverSlots]').fill('1');
  await shot(`private-editor-${width}.png`);await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.waitForURL(origin+'/app');
  let data=await(await page.request.get(origin+'/api/overview')).json();const m=data.monitors.find(m=>m.definition.name===`US warehouse checkout ${width}`);assert.ok(m);assert.equal(m.definition.network,'private');
  await run();await page.goto(origin+`/app/monitors/${m.id}`);await page.locator('html.signed-in').waitFor();await page.locator('#monitor-state').filter({hasText:'Unknown'}).waitFor();await shot(`private-unavailable-${width}.png`);
  await writeFile(join(grants,'warehouse-local.json'),JSON.stringify({runnerId:m.definition.assignments['local-a'].runnerId,monitorId:m.id,hosts:['checkout.internal.test'],cidrs:['10.24.3.10/32'],ports:[8080],expiresAt:Date.now()+600000}),{mode:0o600});const due=(await(await page.request.get(origin+`/api/overview?monitor=${m.id}`)).json()).monitors[0].nextDue;await new Promise(r=>setTimeout(r,Math.max(0,due-Date.now()+20)));await run();
  await page.goto(origin+`/app/monitors/${m.id}`);await page.locator('html.signed-in').waitFor();await page.locator('#monitor-state').filter({hasText:'Healthy'}).waitFor();await page.locator('#raw-history details').first().evaluate(e=>e.open=true);await shot(`private-evidence-${width}.png`);
  await page.getByRole('button',{name:'Edit check',exact:true}).click();await page.locator('.editor-ready').waitFor();assert.equal(await page.locator('[name=networkScope]').inputValue(),'private');assert.equal(await page.locator('[name=privateGrantRef]').inputValue(),'warehouse-local');
  assert.ok((await page.request.patch(origin+`/api/monitors/${m.id}`,{headers:{origin},data:{...m.definition,enabled:false}})).ok());
  await page.goto(origin+'/app#locations');await page.locator('#locations-table').waitFor();const readiness=await(await page.request.get(origin+'/api/runners')).json();assert.ok(readiness.some(r=>r.capabilities.privateNetwork&&r.capabilities.capacity>0));await shot(`private-runner-${width}.png`);
  await page.goto(origin+'/app#archive');await page.locator('#definition-text').waitFor();await page.locator('#definition-text').fill(JSON.stringify({format:'uptime.monitors',version:5,monitors:[{name:`Warehouse browser ${width}`,type:'flow',network:'private',privateGrantRef:'warehouse-browser',url:'http://checkout.internal.test:8080/checkout',flow:{intent:'Open the warehouse checkout screen',steps:[{kind:'goto',url:'http://checkout.internal.test:8080/checkout'}],outcomes:[{id:'ready',what:'text',value:'Checkout ready'}]}}]}));await page.locator('#definition-preview').click();await page.locator('#definition-result').getByText('Private network',{exact:true}).waitFor();await page.locator('#definition-result').scrollIntoViewIfNeeded();await shot(`private-definition-preview-${width}.png`);
  await page.goto(origin+'/docs/runner');await page.getByRole('heading',{name:'Private network grants',exact:true}).scrollIntoViewIfNeeded();await shot(`private-guide-${width}.png`,false,'#private-network-grants');
  await page.goto(origin+'/docs/definitions');await page.getByRole('heading',{name:'The file',exact:true}).scrollIntoViewIfNeeded();await shot(`private-file-guide-${width}.png`,false,'#the-file');
 }
 console.log('PRIVATE-001 browser PASS: actual private HTTP checks, create/edit, runner capacity/version/contact, reviewed private browser definitions, guides, axe, accessibility tree and reflow at desktop/phone widths.');
}finally{await browser?.close();await close(web);await close(canary);await worker?.dispose();await cleanupDirectory(directory)}
