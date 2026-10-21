// API-003: owner editor -> real authenticated transaction -> signed history, desktop and phone.
// API-004: a cleanup denied at the network edge -> retained debt -> the owner resolves it in the console, desktop and phone.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {authFixture} from './tls-auth-support.mjs';
import {browserSignIn} from './auth-test-support.mjs';
let edge,browser,broken=false,denied=false,objects=new Set();
const token=randomBytes(24).toString('base64url');
try{
 edge=await authFixture((record,res)=>{
  const path=record.url;
  res.setHeader('content-type','application/json');
  if(path==='/canary'){res.end('{}');return}
  if(path==='/login'){res.end(JSON.stringify({token}));return}
  if(record.headers.authorization!==`Bearer ${token}`){res.writeHead(401);res.end('{}');return}
  if(path==='/items'&&record.method==='POST'){objects.add('synthetic-42');res.writeHead(201);res.end('{"id":"synthetic-42"}');return}
  if(path==='/items/synthetic-42'&&record.method==='DELETE'){if(denied){res.socket.destroy();return}objects.delete('synthetic-42');res.writeHead(204);res.end();return}
  if(path==='/items/synthetic-42'){res.end(JSON.stringify({ready:!broken}));return}
  res.end('{}');
 });
 const screens=process.env.UPTIME_SCREENSHOTS??join(edge.directory,'screens');await mkdir(screens,{recursive:true});
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,edge.f.origin);
 const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);await page.screenshot({path:join(screens,name),fullPage:true})};
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(edge.f.origin+'/app/monitor');await page.locator('.editor-context-ready').waitFor();await page.locator('#discovery-manual').click();
  await page.locator('[name=checkType]').selectOption('api');await page.getByLabel('Monitor name',{exact:true}).fill(`Sandbox order API ${width}`);
  const url=path=>edge.url(path,'auth.example.test'),auth={authorization:'Bearer {{token}}'};
  const api={variables:{},steps:[{name:'Log in',phase:'setup',url:url('/login'),method:'POST',assertions:{status:200},extract:{token:'$.token'}},{name:'Create order',phase:'request',url:url('/items'),method:'POST',headers:auth,assertions:{status:201},extract:{id:'$.id'}},{name:'Read order',phase:'request',url:url('/items/{{id}}'),headers:auth,method:'GET',assertions:{status:200,json:{path:'$.ready',equals:true}}},{name:'Delete synthetic order',phase:'cleanup',url:url('/items/{{id}}'),headers:auth,method:'DELETE',assertions:{status:204}}]};
  await page.getByLabel('API origin URL',{exact:true}).fill(url('/'));await page.getByLabel('Transaction steps (JSON)',{exact:true}).fill(JSON.stringify(api,null,2));
  await page.locator('.check-from-advanced summary').click();await page.locator('[name=externalCheckUrl]').fill(edge.url('/canary','token.example.test'));await page.locator('[name=confirmSlots]').fill('1');await page.locator('[name=recoverSlots]').fill('1');
  await shot(`api-editor-${width}.png`);await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.waitForURL(/\/app\/monitors\/[^/]+$/);
  const list=await(await page.request.get(edge.f.origin+'/api/overview')).json(),m=list.monitors.find(m=>m.definition.name===`Sandbox order API ${width}`);assert.ok(m);
  let task=await edge.claim(m.id),result=await edge.run(task);assert.equal(result.outcome,'pass');await edge.submit(task,result);assert.equal(objects.size,0);
  broken=true;task=await edge.manual(m.id);result=await edge.run(task);assert.equal(result.outcome,'target_failure');await edge.submit(task,result);broken=false;assert.equal(objects.size,0);assert.equal(result.apiTransaction.cleanup.passed,1);
  await page.goto(edge.f.origin+`/app/monitors/${m.id}`);await page.locator('html.signed-in').waitFor();await page.locator('#raw-history details').first().evaluate(e=>e.open=true);
  await page.getByText('Cleanup: 1 passed; 0 failed; 0 skipped.',{exact:true}).first().waitFor();assert.ok(!(await page.locator('body').innerText()).includes(token));await shot(`api-history-${width}.png`);
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('.editor-context-ready').waitFor();assert.equal(await page.locator('[name=checkType]').inputValue(),'api');assert.deepEqual(JSON.parse(await page.locator('[name=apiSettings]').inputValue()),m.definition.api);await shot(`api-edit-${width}.png`);
  denied=true;task=await edge.manual(m.id);result=await edge.run(task);await edge.submit(task,result);denied=false;objects.clear();assert.equal(result.apiTransaction.cleanup.failed,1);
  await page.goto(edge.f.origin+`/app/monitors/${m.id}`);await page.locator('html.signed-in').waitFor();
  const debt=page.locator('.cleanup-debt'),note=debt.getByLabel('Note',{exact:true});await debt.getByText(/^Delete synthetic order · 3 attempts · /).waitFor();assert.ok(!(await debt.innerText()).includes(token));
  await debt.scrollIntoViewIfNeeded();await shot(`api-cleanup-debt-${width}.png`);
  await note.fill('Deleted the sandbox order by hand');await page.waitForTimeout(5500);assert.equal(await note.inputValue(),'Deleted the sandbox order by hand','A background refresh keeps the control and its typed note');
  await debt.getByRole('button',{name:'Resolve',exact:true}).click();await debt.getByText('Cleanup debt resolved.',{exact:true}).waitFor();await debt.getByText('No open cleanup debt.',{exact:true}).waitFor();
  await debt.getByText('Resolved (1)',{exact:true}).click();await debt.getByText(/Deleted the sandbox order by hand$/).waitFor();await shot(`api-cleanup-debt-resolved-${width}.png`);await edge.f.pause(m);
 }
 console.log('API-003/API-004 browser PASS: owner create/edit, real login/create/read/delete, failed middle requirement with successful cleanup, signed retained step timing, denied cleanup retained as debt and resolved in the console, no extracted secrets, axe/reflow at 1440/390.');
}finally{await browser?.close();await edge?.close()}
