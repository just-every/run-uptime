import {browserSignIn,testAuthBindings} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';

const require=createRequire(import.meta.url),origin='http://127.0.0.1:15482';
const out=resolve(process.env.UPTIME_UI_EVIDENCE??'data/operator-evidence'),checks=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-gpu','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
const overviewRead=url=>url.origin===origin&&url.pathname==='/api/overview';
const failedReads=new WeakMap();
const ready=async page=>{try{await page.locator('.signed-in').waitFor({timeout:15000})}catch(error){
 console.error('Console readiness failure '+JSON.stringify({path:new URL(page.url()).pathname,failedReads:failedReads.get(page),state:await page.evaluate(()=>({booted:window.uptimeBooted===true,classes:document.documentElement.className,notice:document.querySelector('#read-notice')?.textContent,loading:document.querySelector('.loading-note')?.textContent}))}));
 throw error;
}};
// A rule waits in the form's Add rule menu until the owner adds it.
const addRule=async(page,name)=>{await page.locator('.add-rule summary:visible').click();await page.locator('.add-rule-menu:visible').getByRole('button',{name,exact:true}).click()};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
async function audit(page,label,{state,reason}={}){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
 const session=await page.context().newCDPSession(page);
 let tree;try{tree=await session.send('Accessibility.getFullAXTree')}finally{await session.detach()}
 const accessible=tree.nodes.filter(node=>!node.ignored),text=accessible.map(node=>node.name?.value??'').join('\n');
 assert.ok(accessible.some(node=>node.role?.value==='main'),label+' exposes a main landmark');
 assert.ok(accessible.some(node=>node.role?.value==='heading'&&node.name?.value),label+' exposes named headings');
 if(state){assert.ok(accessible.some(node=>node.role?.value==='StaticText'&&node.name?.value===state),label+' exposes textual state');assert.match(await page.locator('.status-explanation').textContent(),reason)}
 const extent=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
 await Promise.all([writeFile(resolve(out,`${label}-axe.json`),JSON.stringify(result,null,2)),writeFile(resolve(out,`${label}-accessibility.json`),JSON.stringify(tree,null,2)),page.screenshot({path:resolve(out,`${label}.png`),fullPage:true})]);
 assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' accessibility');
 assert.ok(extent.scroll<=extent.width+1,label+' document overflow '+JSON.stringify(extent));
 checks.push({label,violations:0,documentWidth:extent.width,accessibilityNodes:accessible.length,...(state?{state}:{}),textInspected:Boolean(text)});
}
async function tabTo(page,locator){
 for(let i=0;i<100;i++){await page.keyboard.press('Tab');if(await locator.evaluate(element=>document.activeElement===element))return}
 assert.fail('Keyboard could not reach '+await locator.textContent());
}
// Bulk add's door, "Add many monitors": beside New monitor on the list, and on the first-monitor page an empty list opens.
// Tab from the page's heading reaches it, its dialog previews pasted URLs, and Escape returns to it.
async function bulkAddDoor(page){
 const door=page.getByRole('button',{name:'Add many monitors',exact:true});
 await page.locator('main h1').click();await tabTo(page,door);await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog',{name:'Bulk add monitors',exact:true});await dialog.waitFor();
 await dialog.getByLabel('URLs or CSV',{exact:true}).fill('https://93.184.216.34/operator-batch');
 await dialog.getByRole('button',{name:'Preview',exact:true}).click();await dialog.getByRole('heading',{name:'Review the plan',exact:true}).waitFor();
 assert.match(await dialog.locator('.catalog-preview > p').first().textContent(),/^1 create\b/,'Bulk add previews the pasted URL');
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 assert.ok(await door.evaluate(element=>document.activeElement===element),'closing Bulk add returns focus to its door');
}
async function nextPoll(page){
 await page.waitForResponse(response=>overviewRead(new URL(response.url()))&&response.request().method()==='GET'&&response.ok(),{timeout:12000});
 // The next keyboard action must see the completed redraw, not just headers.
 await page.waitForFunction(()=>document.querySelector('#content-area')?.getAttribute('aria-busy')!=='true');
}
async function unavailableJourney(page,width){
 await page.route(overviewRead,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic read unavailable'})}));
 try{
  await page.locator('#read-notice[data-state=unavailable]').waitFor({timeout:12000});
  assert.equal(await page.locator('#monitor-state').textContent(),'Unknown');
  assert.match(await page.locator('#read-notice').textContent(),/Last successful refresh/);
  // The status line says the last result is shown, and the recorded checks stay listed with their times.
  assert.match(await page.locator('#monitor-status').textContent(),/Showing the last result/);assert.ok(await page.locator('#recent-rows time').count(),'the last recorded checks stay listed');
  await audit(page,`unavailable-${width}`,{state:'Unknown',reason:/couldn.t refresh/i});
 }finally{await page.unroute(overviewRead)}
 await page.locator('#read-notice[data-state=recovered]').waitFor({timeout:12000});
 await page.locator('#monitor-state').filter({hasText:'Healthy'}).waitFor();
}
async function actionErrorJourney(page,monitor,width){
 const actionGate=deferred(),actionStarted=deferred(),readGate=deferred(),readStarted=deferred();
 const runURL=origin+`/api/monitors/${monitor.id}/run`;
 const failAction=async route=>{actionStarted.resolve();await actionGate.promise;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Manual check could not be queued'})})};
 const holdRead=async route=>{readStarted.resolve();await readGate.promise;await route.continue()};
 await page.route(runURL,failAction);
 try{
  await tabTo(page,page.getByRole('button',{name:'Run now',exact:true}));
  await page.keyboard.press('Enter');await actionStarted.promise;
  await page.route(overviewRead,holdRead);
  async function locked(){
   assert.equal(await page.locator('#content-area').getAttribute('aria-busy'),'true');
   assert.equal(await page.locator('button:enabled,input:enabled,select:enabled,textarea:enabled').count(),0,'busy form controls are excluded');
   assert.equal(await page.locator('a[href]:not([aria-disabled=true])').count(),0,'busy navigation is excluded');
  }
  await locked();const url=page.url();
  await tabTo(page,page.getByRole('link',{name:'Monitors',exact:true}));await page.keyboard.press('Enter');assert.equal(page.url(),url,'keyboard navigation is blocked during the action');
  actionGate.resolve();await readStarted.promise;await locked();
  readGate.resolve();await page.locator('#action-notice[data-state=error]').waitFor();
  await page.waitForFunction(()=>document.querySelector('#content-area')?.getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#run-monitor').isEnabled(),true);
  const message=await page.locator('#action-notice').textContent();
  await nextPoll(page);assert.equal(await page.locator('#action-notice').textContent(),message,'successful polling preserves the failed action');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'run-monitor','action restores its initiating keyboard control');
  await audit(page,`action-error-${width}`,{state:'Healthy',reason:/^Up/});
 }finally{actionGate.resolve();readGate.resolve();await page.unroute(runURL,failAction);await page.unroute(overviewRead,holdRead)}
 assert.equal((await (await page.request.get(origin+`/api/monitors/${monitor.id}/history`)).json()).some(slot=>slot.manual),false,'failed action created no manual evidence');
}
async function editJourney(page,monitor,width){
 await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('.editor-ready').waitFor();
 const fields={status:'200',body:'healthy',bodyExcludes:'unhealthy',regexPattern:'"ok":true',regexFlags:'i',headerName:'x-synthetic',headerValue:'local-review',jsonPath:'$.ok',jsonEquals:'true'};
 for(const [name,value] of Object.entries(fields))assert.equal(await page.locator(`[name=${name}]:visible`).inputValue(),value,'editing preserves '+name);
 // A JSON rule with no value to equal is refused in the form and makes no revision.
 await page.locator('[name=jsonEquals]:visible').fill('');
 await page.getByRole('button',{name:'Save monitor',exact:true}).click();
 await page.locator('#editor-feedback[data-error]').waitFor();
 assert.match(await page.locator('#editor-feedback').textContent(),/JSON value: enter both/);
 const before=await (await page.request.get(origin+'/api/overview')).json();
 assert.equal(before.monitors.find(m=>m.id===monitor.id).revision,monitor.revision,'a refused rule made no revision');
 await audit(page,`assertion-refusal-${width}`);
 await page.locator('[name=jsonEquals]:visible').fill('true');
 await addRule(page,'Responds within');await page.locator('[name=latencyMs]:visible').fill('10');
 // A real scheduled pass will age out before the next one; no clocks or stored observations are fabricated.
 await page.locator('[name=intervalMinutes]:visible').fill('1');
 await page.locator('[name=confirmSlots]:visible').fill('1');await page.locator('[name=recoverSlots]:visible').fill('1');
 await page.getByRole('button',{name:'Save monitor',exact:true}).click();await ready(page);
 await page.locator('#monitor-state').filter({hasText:'Healthy'}).waitFor({timeout:18000});
 const after=await (await page.request.get(origin+'/api/overview')).json(),saved=after.monitors.find(m=>m.id===monitor.id);
 assert.equal(saved.revision,monitor.revision+1);assert.deepEqual(saved.definition.assertions,{...monitor.definition.assertions,latencyMs:10000});
 await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('.editor-ready').waitFor();
 assert.equal(await page.locator('[name=jsonEquals]:visible').inputValue(),'true');assert.equal(await page.locator('[name=latencyMs]:visible').inputValue(),'10');
 await page.locator('.editor-cancel:visible').click();await ready(page);
 await page.locator('#monitor-state').filter({hasText:'Unknown'}).waitFor({timeout:22000});
 await audit(page,`stale-${width}`,{state:'Unknown',reason:/recent result|waiting/i});
 assert.ok(await page.locator('#recent-rows time').count(),'stale state retains the last real check time');
 const history=await (await page.request.get(origin+`/api/monitors/${monitor.id}/history`)).json();
 assert.ok(history.some(slot=>slot.revision===monitor.revision),'old assertion revision evidence remains');
 assert.ok(history.some(slot=>slot.revision===saved.revision&&slot.status==='complete'),'changed assertion revision has its own evidence');
}
try{
 for(const width of [1440,768,390,320]){
  // These independent cold-browser journeys share the local installation's
  // public asset bucket. Do not carry one viewport's loads into the next one.
  await new Promise(resolve=>setTimeout(resolve,60000-Date.now()%60000));
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort()});
  try{
   const page=await context.newPage(),errors=[],failed=[];failedReads.set(page,failed);page.on('pageerror',error=>errors.push(error.message));
   page.on('response',response=>{const path=new URL(response.url()).pathname;if(response.status()>=400&&(path.startsWith('/assets/')||path==='/app.js'||path==='/api/overview'))failed.push({path,status:response.status()})});
   await browserSignIn(page,origin,{bootstrap:false,bindings:{...testAuthBindings,OWNER_EMAIL:process.env.UPTIME_OPERATOR_OWNER_EMAIL??testAuthBindings.OWNER_EMAIL}});
   // The installation has no monitors before the first width: the console opens straight into the new-monitor form.
   if(width===1440){await page.waitForURL(url=>url.pathname==='/app/monitors/new');await page.locator('.editor-context-ready').waitFor();assert.equal(await page.locator('h1').textContent(),'Add your first monitor');await audit(page,`editor-${width}`);await bulkAddDoor(page);await page.locator('#discovery-manual').click()}
   else{await ready(page);await audit(page,`console-${width}`);await bulkAddDoor(page);
    await tabTo(page,page.getByRole('button',{name:'New monitor',exact:true}));await page.keyboard.press('Enter');
    await page.locator('.editor-ready').waitFor();await audit(page,`editor-${width}`);await page.locator('#discovery-manual').click()}
   const name=`Operator ${width} ${Date.now()}`;
   await page.locator('input[name=name]:visible').fill(name);await page.locator('input[name=url]:visible').fill('http://169.254.169.254/latest/meta-data/');
   await page.getByRole('button',{name:'Save monitor'}).click();await page.locator('#editor-feedback').filter({hasText:/grant|literal|target|URL|host|port|loopback/i}).waitFor();assert.equal(new URL(page.url()).pathname,'/app/monitors/new/manual');
   const values={url:'http://127.0.0.1:15481/health',intervalMinutes:String(5000/60000),freshnessMinutes:String(10000/60000),retries:'0',confirmSlots:'1',recoverSlots:'1'};
   for(const [field,value] of Object.entries(values))await page.locator(`[name=${field}]:visible`).fill(value);
   const rules={'Page contains':{body:'healthy'},'Page must not contain':{bodyExcludes:'unhealthy'},Pattern:{regexPattern:'"ok":true',regexFlags:'i'},'Header equals':{headerName:'x-synthetic',headerValue:'local-review'},'JSON value':{jsonPath:'$.ok',jsonEquals:'true'}};
   for(const [rule,fields] of Object.entries(rules)){await addRule(page,rule);for(const [field,value] of Object.entries(fields))await page.locator(`[name=${field}]:visible`).fill(value)}
   await page.getByRole('button',{name:'Save monitor'}).click();await ready(page);
   const overview=await (await page.request.get(origin+'/api/overview')).json(),monitor=overview.monitors.find(m=>m.definition.name===name);
   assert.ok(monitor);assert.deepEqual(Object.values(monitor.definition.assignments).map(a=>a.runnerId),overview.runner.runners.filter(r=>!r.revokedAt).map(r=>r.runnerId),'a new monitor checks from every location');
   await page.waitForURL(url=>url.pathname===`/app/monitors/${monitor.id}`);await ready(page);await page.locator('#all-checks > summary').click();
   await page.locator('#monitor-state').filter({hasText:'Healthy'}).waitFor({timeout:18000});await page.locator('#raw-history details').first().waitFor();
   await audit(page,`healthy-${width}`,{state:'Healthy',reason:/^Up/});
   await unavailableJourney(page,width);await actionErrorJourney(page,monitor,width);
   await page.getByRole('button',{name:'Run now',exact:true}).click();await page.locator('#raw-history summary').filter({hasText:/Manual check complete · .+[✓✗]/}).first().waitFor({timeout:12000});
   await page.locator('#raw-history details').first().locator('summary').click();
   const summary=page.locator('#raw-history details[open] summary').first();await summary.focus();const summaryId=await summary.getAttribute('id');
   await nextPoll(page);assert.equal(await page.evaluate(()=>document.activeElement?.id),summaryId,'history keyboard focus survives polling');
   assert.ok(await page.locator('#raw-history details[open]').count()>0,'expanded immutable evidence survives polling');
   await editJourney(page,monitor,width);
   await tabTo(page,page.getByRole('button',{name:'Pause',exact:true}));await page.keyboard.press('Enter');await page.locator('#monitor-state').filter({hasText:'Paused'}).waitFor();
   await page.getByRole('button',{name:'Resume',exact:true}).click();await page.locator('details#maintenance > summary').click();await page.getByRole('button',{name:'Quiet alerts for 15 min'}).click();await page.locator('#status-card').getByRole('button',{name:'End now',exact:true}).click();await page.getByRole('button',{name:'Quiet alerts for 15 min'}).waitFor();await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Resume',exact:true}).waitFor();
   await tabTo(page,page.getByRole('link',{name:'Notifications',exact:true}));await page.keyboard.press('Enter');await page.waitForURL(origin+'/app/notifications');await ready(page);await page.getByRole('heading',{name:'Destinations · all monitors',exact:true}).waitFor();await audit(page,`notifications-${width}`);
   await page.getByRole('link',{name:'Archive',exact:true}).click();await page.waitForURL(origin+'/app/archive');await ready(page);await page.getByRole('button',{name:'Download backup'}).waitFor();await audit(page,`archive-${width}`);
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download backup'}).click()]);await download.saveAs(resolve(out,`archive-${width}.json`));
   await page.getByRole('link',{name:'Sign out',exact:true}).click();await page.getByLabel('Email address').waitFor();assert.equal((await page.request.get(origin+'/api/overview')).status(),401);assert.deepEqual(errors,[],'browser exceptions');
  }finally{await context.close()}
 }
 await writeFile(resolve(out,'RESULTS.json'),JSON.stringify({checks,workflow:'Native owner console at 1440/390; real healthy and naturally stale scheduled evidence; failed reads show Unknown with historical time; keyboard actions/navigation; failed actions survive polling; controls excluded through reconciliation; assertion edits preserve checks and reject overrides without writes; immutable history/focus retained; native export and signout; computed accessibility trees, axe and reflow',externalNetwork:false},null,2));
 console.log(`INTERFACE-001 operator passed: ${checks.length} local accessibility/reflow checks and real owner journeys at 1440/768/390/320. Evidence ${out}`);
}finally{await browser.close()}
