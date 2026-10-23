// MAIL-001: the real owner editor and signed native mail history at desktop/phone widths.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn,testAuthBindings} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {certificates,listen,close} from './protocol-fixtures.mjs';
import {mailEdges} from './mail-edges.mjs';
const directory=await runtimeDirectory(),screens=process.env.UPTIME_SCREENSHOTS??join(directory,'screens'),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
let worker,browser,canary,edge;
const password=randomBytes(24).toString('base64url');
try{
 const certs=await certificates(directory);edge=await mailEdges(certs.web);edge.state.password=password;canary=https.createServer(certs.web,(_,res)=>{res.writeHead(200);res.end()});const canaryPort=await listen(canary),credentialDir=join(directory,'credentials');await mkdir(credentialDir,{mode:0o700});await mkdir(screens,{recursive:true});
 ({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
 const run=async()=>{
  const child=spawn(process.execPath,['--import',resolve('tests/mail-routing.mjs'),'--input-type=module','-e',"import {runRunner} from './runners/src/private-runner.mjs';await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,localReview:true,once:true,grantPath:process.env.MAIL_GRANT_PATH});"],{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:testAuthBindings.UPTIME_RUNNER_KEY,NODE_EXTRA_CA_CERTS:certs.caPath,MAIL_JOURNEY_WEB_PORT:String(canaryPort),UPTIME_CREDENTIAL_DIR:credentialDir,UPTIME_FLOW_DIR:join(directory,'flows'),MAIL_GRANT_PATH:join(directory,'grant.json')},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),30000);try{assert.equal((await once(child,'exit'))[0],0,output.slice(0,1800))}finally{clearTimeout(timer)}
 };
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
 const shot=async(name,{fullPage=true}={})=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);await page.screenshot({path:join(screens,name),fullPage})};
 for(const width of [1440,390]){
  edge.state.dropReceipt=false;edge.state.receiptDelayMs=200;
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/monitors/new');await page.locator('.editor-context-ready').waitFor();await page.locator('#discovery-manual').click();await page.locator('[name=checkType]').selectOption('mail');await page.getByLabel('Monitor name',{exact:true}).fill(`Checkout mail delivery ${width}`);
  const mail={protocol:'smtp',host:'canary.protocol.test',port:edge.ports.smtp,security:'starttls',credentialRef:`sender-${width}`,transaction:{dedicatedMailbox:true,from:'synthetic@example.test',to:'mailbox@example.test',receive:{protocol:'pop3',host:'canary.protocol.test',port:edge.ports.pop3,security:'tls',credentialRef:`receiver-${width}`},receiptTimeoutMs:700,pollIntervalMs:100}};
  await page.getByLabel('Mail protocol settings (JSON)',{exact:true}).fill(JSON.stringify(mail,null,2));await page.locator('.check-from-advanced summary').click();await page.locator('[name=externalCheckUrl]').fill('https://dns.google/ok');await page.locator('[name=confirmSlots]').fill('1');await page.locator('[name=recoverSlots]').fill('1');await shot(`mail-editor-${width}.png`);
  const saved=page.waitForResponse(r=>r.url()===origin+'/api/monitors'&&r.request().method()==='POST');await page.getByRole('button',{name:'Save monitor',exact:true}).click();const savedResponse=await saved;if(savedResponse.status()!==201)throw Error(JSON.stringify(await savedResponse.json()));await page.waitForURL(/\/app\/monitors\/[^/]+$/);const list=await(await page.request.get(origin+'/api/overview')).json(),m=list.monitors.find(m=>m.definition.name===`Checkout mail delivery ${width}`);assert.ok(m);
  for(const endpoint of [m.definition.mail,m.definition.mail.transaction.receive])await writeFile(join(credentialDir,endpoint.credentialRef+'.json'),JSON.stringify({monitorId:m.id,origin:`https://${endpoint.host}:${endpoint.port}`,auth:{type:'basic',username:'synthetic-user',password}}),{mode:0o600});
  await run();assert.ok(edge.state.removed.length>0,'The received synthetic message is actually removed');
  edge.state.dropReceipt=true;assert.equal((await page.request.post(origin+`/api/monitors/${m.id}/run`,{headers:{origin},data:{}})).status(),200);await run();edge.state.dropReceipt=false;
  await page.goto(origin+`/app/monitors/${m.id}#all-checks`);await page.locator('html.signed-in').waitFor();await page.locator('#raw-history details').first().evaluate(e=>e.open=true);await page.getByText('Not confirmed — inspect the dedicated mailbox using this Message-ID',{exact:true}).waitFor();
  const history=await page.locator('#raw-history').innerText();assert.match(history,/SMTP accepted/);assert.match(history,/Mailbox received/);assert.ok(!history.includes(password));assert.ok(!history.includes('private-body-not-evidence'));await shot(`mail-history-${width}.png`);
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('.editor-context-ready').waitFor();assert.equal(await page.locator('[name=checkType]').inputValue(),'mail');assert.deepEqual(JSON.parse(await page.locator('[name=mailSettings]').inputValue()),m.definition.mail);await shot(`mail-edit-${width}.png`);
  assert.equal((await page.request.patch(origin+`/api/monitors/${m.id}`,{headers:{origin},data:{...m.definition,enabled:false}})).status(),200);
  for(const section of ['api-transactions','mail-protocols']){await page.goto(origin+'/docs/definitions#'+section);await page.locator('#'+section).scrollIntoViewIfNeeded();await shot(`${section}-guide-${width}.png`,{fullPage:false})}
 }
 console.log('MAIL-001 browser PASS: owner configure/edit, signed SMTP/STARTTLS + POP3S receipt and removal, separate unreceived-message outcome, no content/passwords, axe/reflow at 1440/390.');
}finally{await browser?.close();await edge?.close();await close(canary);await worker?.dispose();await cleanupDirectory(directory)}
