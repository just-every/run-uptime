// API-003: owner editor -> real authenticated transaction -> signed history, desktop and phone.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {authFixture} from './tls-auth-support.mjs';
import {browserSignIn} from './auth-test-support.mjs';
let edge,browser,broken=false,objects=new Set();
const token=randomBytes(24).toString('base64url');
try{
 edge=await authFixture((record,res)=>{
  const path=record.url;
  res.setHeader('content-type','application/json');
  if(path==='/canary'){res.end('{}');return}
  if(path==='/login'){res.end(JSON.stringify({token}));return}
  if(record.headers.authorization!==`Bearer ${token}`){res.writeHead(401);res.end('{}');return}
  if(path==='/items'&&record.method==='POST'){objects.add('synthetic-42');res.writeHead(201);res.end('{"id":"synthetic-42"}');return}
  if(path==='/items/synthetic-42'&&record.method==='DELETE'){objects.delete('synthetic-42');res.writeHead(204);res.end();return}
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
  await page.locator('[name=canary-local-a]').fill(edge.url('/canary','token.example.test'));await page.locator('[name=confirmSlots]').fill('1');await page.locator('[name=recoverSlots]').fill('1');
  await shot(`api-editor-${width}.png`);await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.waitForURL(edge.f.origin+'/app');
  const list=await(await page.request.get(edge.f.origin+'/api/overview')).json(),m=list.monitors.find(m=>m.definition.name===`Sandbox order API ${width}`);assert.ok(m);
  let task=await edge.claim(m.id),result=await edge.run(task);assert.equal(result.outcome,'pass');await edge.submit(task,result);assert.equal(objects.size,0);
  broken=true;task=await edge.manual(m.id);result=await edge.run(task);assert.equal(result.outcome,'target_failure');await edge.submit(task,result);broken=false;assert.equal(objects.size,0);assert.equal(result.apiTransaction.cleanup.passed,1);
  await page.goto(edge.f.origin+`/app/monitors/${m.id}`);await page.locator('html.signed-in').waitFor();await page.locator('#raw-history details').first().evaluate(e=>e.open=true);
  await page.getByText('Cleanup: 1 passed; 0 failed; 0 skipped.',{exact:true}).first().waitFor();assert.ok(!(await page.locator('body').innerText()).includes(token));await shot(`api-history-${width}.png`);
  await page.getByRole('button',{name:'Edit check',exact:true}).click();await page.locator('.editor-context-ready').waitFor();assert.equal(await page.locator('[name=checkType]').inputValue(),'api');assert.deepEqual(JSON.parse(await page.locator('[name=apiSettings]').inputValue()),m.definition.api);await shot(`api-edit-${width}.png`);await edge.f.pause(m);
 }
 console.log('API-003 browser PASS: owner create/edit, real login/create/read/delete, failed middle requirement with successful cleanup, signed retained step timing, no extracted secrets, axe/reflow at 1440/390.');
}finally{await browser?.close();await edge?.close()}
