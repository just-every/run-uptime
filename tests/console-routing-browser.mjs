import assert from 'node:assert/strict';
import {test} from 'node:test';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';

test('console paths survive bookmarks, navigation, copied links, history and reload',async()=>{
 const directory=await runtimeDirectory();let worker,browser;
 try{
  const [port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
  ({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
  const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
  const created=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'Storefront availability',url:'https://example.com/',canaryUrl:'https://example.org/',enabled:false}});
  assert.equal(created.status(),201);const {id}=await created.json(),detail=`/app/monitors/${encodeURIComponent(id)}`,edit=detail+'/edit';
  const filtered='catalog-search=Storefront&catalog-state=Paused&catalog-selection='+encodeURIComponent(id);
  const aliases=[['/app','/app/monitors'],['/app/','/app/monitors'],['/app?'+filtered,'/app/monitors?'+filtered],['/monitor','/app/monitors/new'],['/monitor/?monitor='+encodeURIComponent(id),edit],['/app/monitor?monitor='+encodeURIComponent(id),edit],['/app/monitor/?first=1','/app/monitors/new']];
  for(const [old,to]of aliases){const response=await page.request.get(origin+old,{maxRedirects:0});assert.equal(response.status(),308,old);assert.equal(response.headers().location,to);}
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});
   for(const [old,to]of [['locations','locations'],['runners','locations'],['notifications','notifications'],['archive','archive'],['definitions','archive'],['settings','settings'],['monitors','monitors']]){
    await page.goto(origin+'/app#'+old);await page.waitForURL(origin+'/app/'+to);await page.locator('html.signed-in').waitFor();
    assert.equal(await page.locator('.sidebar nav a[aria-current=page]').getAttribute('href'),'/app/'+to);
   }
   // An old filtered-list bookmark opens the list with its search, its filters as chips and its selection.
   await page.goto(origin+'/app?'+filtered);await page.waitForURL(origin+'/app/monitors?'+filtered);await page.locator('.catalog-rows .monitor-row').waitFor();
   assert.equal(await page.locator('#catalog-search').inputValue(),'Storefront');assert.ok(await page.locator(`[data-monitor-select="${id}"]`).isChecked());
   await page.getByRole('button',{name:'Remove filter: State: Paused',exact:true}).waitFor();assert.equal(await page.locator('.catalog-selected').textContent(),'1 selected');
   // Twelve section clicks inside one public-rate window switch the console in place: no document load and no 429. The
   // cache is off, as under rer dev where every asset revalidates on each load, so a document per click would run out.
   const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   const left=60000-Date.now()%60000;if(left<20000)await new Promise(resolve=>setTimeout(resolve,left+250));
   const spent=[],started=Date.now(),loads=request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())spent.push('document '+request.url())},refused=response=>{if(response.status()===429)spent.push('429 '+response.url())};
   page.on('request',loads);page.on('response',refused);
   const sections=['Locations','Notifications','Archive','Settings','Monitors'];
   for(let click=0;click<12;click++){
    const name=sections[click%sections.length],path='/app/'+name.toLowerCase();
    await page.locator('.sidebar nav').getByRole('link',{name,exact:true}).click();await page.waitForURL(origin+path);
    await page.waitForFunction(name=>document.documentElement.classList.contains('signed-in')&&document.querySelector('h1')?.textContent.trim()===name&&!document.querySelector('#content-area .loading-list'),name);
    assert.equal(await page.locator('.sidebar nav a[aria-current=page]').getAttribute('href'),path);
   }
   await page.goBack();await page.waitForURL(origin+'/app/locations');await page.locator('h1',{hasText:'Locations'}).waitFor();
   await page.goForward();await page.waitForURL(origin+'/app/notifications');await page.locator('h1',{hasText:'Notifications'}).waitFor();
   page.off('request',loads);page.off('response',refused);
   assert.deepEqual(spent,[],'section clicks spend no document load or public request');assert.equal(Math.floor(Date.now()/60000),Math.floor(started/60000),'one rate window');
   await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});await cdp.detach();
   await page.reload();await page.locator('html.signed-in').waitFor();assert.equal(await page.locator('h1').textContent(),'Notifications');
   await page.getByRole('link',{name:'Locations',exact:true}).click();await page.waitForURL(origin+'/app/locations');await page.locator('html.signed-in').waitFor();
   await page.getByRole('link',{name:'Monitors',exact:true}).click();await page.locator('.catalog-rows .monitor-link').click();await page.waitForURL(origin+detail);await page.locator('#monitor-state').waitFor();
   await page.getByRole('link',{name:'Edit rules',exact:true}).click();await page.waitForURL(origin+edit);await page.locator('html.editor-context-ready').waitFor();
   assert.equal(await page.locator('[name=name]').inputValue(),'Storefront availability');
   const copied=page.url(),copy=await context.newPage();assert.equal((await copy.goto(copied)).status(),200);await copy.locator('html.editor-context-ready').waitFor();assert.equal(await copy.locator('[name=name]').inputValue(),'Storefront availability');await copy.close();
   await page.reload();await page.locator('html.editor-context-ready').waitFor();assert.equal(page.url(),copied);
   await page.goBack();await page.waitForURL(origin+detail);await page.locator('#monitor-state').waitFor();
   await page.goForward();await page.waitForURL(origin+edit);await page.locator('html.editor-context-ready').waitFor();
   assert.equal(new URL(page.url()).search,'');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  // Clone is opened through the list selection, including the optional Labels
  // fold. Keep this block at the end of the existing navigation registration.
  {
   const {readFile,mkdir,writeFile}=await import('node:fs/promises');
   const axe=await readFile(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8');
   const evidence=process.env.UPTIME_CLONE_EVIDENCE;if(evidence)await mkdir(evidence,{recursive:true});
   const problems=[],failed=[];page.on('pageerror',error=>problems.push(error.message));page.on('console',message=>{if(message.type()==='error')problems.push(message.text())});
   page.on('requestfailed',request=>failed.push(request.url()));
   const get=async path=>{const response=await page.request.get(origin+path);assert.equal(response.status(),200);return response.json()};
   const post=async(path,data,status=200)=>{const response=await page.request.post(origin+path,{headers:{origin},data});assert.equal(response.status(),status);return response.json()};
   const source=await post('/api/monitors',{name:'synthetic-uptime-1',url:'https://93.184.216.34/clone',canaryUrl:'https://93.184.216.35/',enabled:false,project:'Source project',tags:['source']},201);
   await post('/api/monitors',{name:'synthetic-uptime-2',url:'https://93.184.216.34/spare',canaryUrl:'https://93.184.216.35/',enabled:false},201);
   const read=async()=>(await get('/api/overview')).monitors;
   const original=(await read()).find(row=>row.id===source.id);
   const labels={project:'New project',environment:'staging',service:'Checkout',group:'Web',tags:['reviewed','clone'],owner:'Synthetic team',outcome:'Checkout stays available'};
   const audit=async(label,width)=>{
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label} fits ${width}`);
    await page.evaluate(axe);const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
    const severe=result.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id);assert.deepEqual(severe,[],`${label} has no serious axe findings`);
    if(evidence){await page.screenshot({path:join(evidence,`${label}-${width}.png`),fullPage:true});await writeFile(join(evidence,`${label}-${width}-axe.json`),JSON.stringify({severe}))}
   };
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});await page.goto(origin+'/app/monitors');await page.locator('html.signed-in').waitFor();await page.locator(`[data-monitor-select="${source.id}"]`).check();
    // Cancel and Escape discard an un-applied review and create no monitor.
    for(const dismiss of ['cancel','escape']){
     const before=await read();await page.getByRole('button',{name:'Clone',exact:true}).click();
     if(dismiss==='cancel')await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();else await page.keyboard.press('Escape');
     await page.getByRole('dialog').waitFor({state:'detached'});assert.deepEqual((await read()).map(m=>({id:m.id,revision:m.revision})),before.map(m=>({id:m.id,revision:m.revision})));
    }
    for(const filled of [true,false]){
     const before=await read(),enabled=filled;
     await page.getByRole('button',{name:'Clone',exact:true}).click();const dialog=page.getByRole('dialog');
     if(filled){await dialog.locator('summary').click();for(const [name,value]of Object.entries(labels))await dialog.locator(`[name="${name}"]`).fill(Array.isArray(value)?value.join(', '):value);await dialog.locator('[name=enableAfterCreate]').check()}
     const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog/preview'&&response.request().method()==='POST');
     await dialog.getByRole('button',{name:'Preview',exact:true}).click();const response=await pending;assert.equal(response.status(),200);
     assert.deepEqual(response.request().postDataJSON(),{monitorIds:[source.id],action:'clone',changes:filled?labels:{},enableAfterCreate:enabled});
     const plan=await response.json();assert.equal(plan.counts.create,1);assert.equal(plan.entries.length,1);assert.equal(plan.entries[0].sourceMonitorId,source.id);assert.equal(plan.entries[0].target.url,original.definition.url);assert.ok(plan.entries[0].target.name.startsWith(original.definition.name));
     for(const [name,value]of Object.entries(filled?labels:{project:original.definition.project,tags:original.definition.tags}))assert.deepEqual(plan.entries[0].target[name],value);
     await dialog.locator('.catalog-preview h3').waitFor();await page.waitForFunction(()=>!document.querySelector('.catalog-dialog [data-apply]').disabled);
     await audit(filled?'clone-labels-preview':'clone-empty-preview',width);
     const applying=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog/apply'&&response.request().method()==='POST');await dialog.locator('[data-apply]').click();const applied=await applying;assert.equal(applied.status(),201);const batch=await applied.json();assert.equal(batch.created.length,1);
     await dialog.getByRole('button',{name:'Done',exact:true}).waitFor();const after=await read();assert.equal(after.length,before.length+1);const clone=after.find(row=>row.id===batch.created[0]);assert.equal(clone.definition.enabled,enabled);assert.deepEqual(clone.definition,plan.entries[0].target);
     assert.deepEqual(after.find(row=>row.id===source.id).definition,original.definition);assert.equal(after.find(row=>row.id===source.id).revision,original.revision);
     await audit(filled?'clone-labels-applied':'clone-empty-applied',width);await dialog.getByRole('button',{name:'Done',exact:true}).click();
     await post(`/api/definitions/batches/${batch.batchId}/undo`,{});const undone=(await read()).find(row=>row.id===clone.id);assert.equal(undone.definition.enabled,false,'batch undo pauses the clone and preserves its history');
     const batches=await get('/api/definitions/batches');assert.ok(batches.find(row=>row.id===batch.batchId).undoneAt);assert.deepEqual((await read()).find(row=>row.id===source.id).definition,original.definition);
     console.log(`CLONE ${width}: ${filled?'typed':'empty'} labels reviewed, one create, enabled=${enabled}, source unchanged, undo paused`);
    }
    // The unchanged dialog kinds still construct and preview their own payloads.
    for(const kind of ['edit','pause','resume']){
     await page.locator(`[data-bulk="${kind}"]`).click();const dialog=page.getByRole('dialog');
     if(kind==='edit'){await dialog.locator('[name=set-project]').check();await dialog.locator('[name=project]').fill('Edited project')}
     const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog/preview');await dialog.getByRole('button',{name:'Preview',exact:true}).click();const response=await pending;assert.equal(response.status(),200);assert.deepEqual(response.request().postDataJSON(),{monitorIds:[source.id],action:kind,...(kind==='edit'?{changes:{project:'Edited project'}}:{})});
     await dialog.locator('.catalog-preview h3').waitFor();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    }
    await page.getByRole('button',{name:'Add many monitors',exact:true}).click();
    {const dialog=page.getByRole('dialog');await dialog.locator('[name=text]').fill('https://93.184.216.34/bulk');const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog/add/preview');await dialog.getByRole('button',{name:'Preview',exact:true}).click();const response=await pending;assert.equal(response.status(),200);assert.equal(response.request().postDataJSON().text,'https://93.184.216.34/bulk');await dialog.locator('.catalog-preview h3').waitFor();await dialog.getByRole('button',{name:'Cancel',exact:true}).click()}
    await page.getByRole('button',{name:'Plan maintenance',exact:true}).click();
    {const dialog=page.getByRole('dialog');await dialog.locator('[name=name]').fill('synthetic-uptime-maintenance');const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/maintenance/preview');await dialog.getByRole('button',{name:'Preview occurrences',exact:true}).click();const response=await pending;assert.equal(response.status(),200);assert.deepEqual(response.request().postDataJSON().monitorIds,[source.id]);await dialog.locator('#maintenance-preview:not([hidden])').waitFor();await dialog.getByRole('button',{name:'Cancel',exact:true}).click()}
    // The overview's current end covers all maintenance forms, while an ordinary row has no end.
    const now=Date.now(),end=now+3600000,weeklyStart=new Date(now-60000),date=weeklyStart.toISOString().slice(0,10);
    const maintenanceCases=[
     ['planned',{maintenanceWindows:[{id:'list-planned',name:'Planned list window',timeZone:'UTC',mode:'suppress',startsAt:now-60000,endsAt:end}]}],
     ['recurring',{maintenanceWindows:[{id:'list-weekly',name:'Recurring list window',timeZone:'UTC',mode:'suppress',weekly:{weekdays:[weeklyStart.getUTCDay()],localTime:weeklyStart.toISOString().slice(11,16),durationMinutes:120,fromDate:date,untilDate:date}}]}],
     ['quick',{maintenanceUntil:end}],['none',{}],
    ];
    const maintenanceRows=[];
    for(const [kind,settings]of maintenanceCases){const row=await post('/api/monitors',{name:`synthetic-uptime-list-${kind}-${width}`,url:'https://93.184.216.34/list',enabled:true,...settings},201);maintenanceRows.push({id:row.id,kind})}
    const overview=await read();await page.goto(origin+'/app/monitors');await page.locator('html.signed-in').waitFor();
    for(const {id,kind}of maintenanceRows){
     const row=page.locator(`.monitor-row[data-key="${id}"]`);await row.waitFor();
     if(kind==='none')assert.equal(await row.locator('.monitor-note.maintenance').count(),0);
     else {const expected=await page.evaluate(t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),overview.find(m=>m.id===id).maintenanceEndsAt);assert.equal((await row.locator('.monitor-note.maintenance').textContent()).trim(),`· until ${expected}`)}
    }
    await audit('maintenance-list',width);
    await page.evaluate(axe);assert.deepEqual(await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations.map(v=>v.id)),[],'maintenance list has zero axe violations');
    assert.deepEqual(problems,[],'no unexpected console error or hydration mismatch');assert.deepEqual(failed,[],'no failed browser request');
   }
  }
 }finally{await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
});
