import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {definitionDoor} from './auth-test-support.mjs';
import {assertPlainMonitorText} from './plain-monitor-text-support.mjs';

// The existing owner lifecycle plans maintenance and then erases its paused
// monitor through the console, retaining the server's original receipt.
export async function proveReadableMaintenanceAndErasure(page,origin,monitor,{proofDirectory=process.env.UPTIME_SCREENSHOTS}={}){
 const current=async()=>(await (await page.request.get(origin+'/api/overview')).json()).monitors.find(m=>m.id===monitor.id);
 const screenshots=async label=>{
  if(!proofDirectory)return;
  await mkdir(proofDirectory,{recursive:true});
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===390?844:1000});
   await page.screenshot({path:join(proofDirectory,`after-${label}-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:900});
 };
 const accessible=async region=>{
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the dialog fits the page');
  await page.addScriptTag({path:join(process.cwd(),'node_modules/axe-core/axe.min.js')});
  assert.deepEqual((await region.evaluate(node=>axe.run(node))).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],'the changed dialog remains accessible');
 };
 // An imported heartbeat keeps its raw assertions for API/export consumers,
 // while its opened check details must describe only the saved job rules.
 const fetcher=async(url,init)=>{
  const {cookie,...headers}=init.headers;
  const response=await page.request.fetch(url,{method:init.method,headers,data:init.body});
  return new Response(await response.body(),{status:response.status()});
 };
 const door=definitionDoor({origin,fetcher}),job={name:'synthetic-uptime-903 nightly backup',type:'heartbeat',heartbeat:{maxAgeMs:300000,graceMs:60000,maxRunDurationMs:120000},intervalMs:60000};
 const plan=await door.preview({format:'uptime.monitors',version:5,monitors:[job]});assert.equal(plan.status,200);
 const applied=await door.apply(plan.body);assert.equal(applied.status,200);const [heartbeatId]=applied.body.created;
 const heartbeat=(await (await page.request.get(origin+'/api/overview')).json()).monitors.find(m=>m.id===heartbeatId);
 assert.equal(heartbeat.definition.type,'heartbeat');assert.equal(heartbeat.definition.assertions.status,200,'the raw API definition is unchanged');
 await page.goto(origin+`/app/monitors/${heartbeatId}`);await page.locator('.signed-in').waitFor();
 const checkDetails=page.locator('details#details');await checkDetails.locator(':scope > summary').click();
 await assertPlainMonitorText(checkDetails);
 assert.equal(await checkDetails.locator('pre').count(),0,'no raw payload remains, even in a nested disclosure');
 assert.doesNotMatch(await checkDetails.innerText(),/HTTP|\b200\b|status["\s]*:/i,'a heartbeat has no HTTP criterion');
 const values=await checkDetails.locator('dd').allInnerTexts();
 assert.ok(values.some(v=>/6\s*min/.test(v)),'the saved period plus grace sets the success deadline');
 assert.ok(values.some(v=>/2\s*min/.test(v)),'the saved maximum run duration remains readable');
 assert.ok((await checkDetails.innerText()).includes(heartbeat.definition.enabled?heartbeat.state.state:'Paused'),'current evidence does not claim a check ran');
 await accessible(checkDetails);await screenshots('heartbeat-check-details');
 const erasedHeartbeat=await page.request.post(origin+`/api/monitors/${heartbeatId}/erase`,{headers:{origin},data:{name:job.name}});assert.equal(erasedHeartbeat.status(),200);
 await page.goto(origin+`/app/monitors/${monitor.id}`);await page.locator('.signed-in').waitFor();
 await page.locator('#maintenance > summary').click();await page.getByRole('button',{name:'Plan maintenance',exact:true}).click();
 const planner=page.getByRole('dialog',{name:'Plan maintenance',exact:true});
 assert.ok((await planner.getByRole('list',{name:'Selected monitors',exact:true}).innerText()).includes(monitor.definition.name),'the selection names the monitor');
 await assertPlainMonitorText(planner);assert.ok(!(await planner.innerText()).includes(monitor.id));
 await screenshots('maintenance-selection');
 await planner.getByLabel('Window name',{exact:true}).fill('Synthetic maintenance review');
 const previewResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/maintenance/preview'&&r.request().method()==='POST');
 await planner.getByRole('button',{name:'Preview occurrences',exact:true}).click();
 const preview=await (await previewResponse).json();await planner.locator('#maintenance-preview:not([hidden])').waitFor();
 assert.deepEqual(preview.scope.monitorIds,[monitor.id],'display names do not change the selected identity');
 assert.ok((await planner.getByRole('list',{name:'Reviewed monitors',exact:true}).innerText()).includes(monitor.definition.name),'the preview names the same monitor');
 await assertPlainMonitorText(planner);assert.ok(!(await planner.innerText()).includes(monitor.id));
 await accessible(planner);await screenshots('maintenance-preview');
 const before=await current();
 await planner.getByRole('button',{name:'Apply maintenance',exact:true}).click();await planner.waitFor({state:'detached'});
 const planned=await current();assert.equal(planned.revision,before.revision+1);
 assert.deepEqual(planned.definition.maintenanceWindows.find(w=>w.id===preview.window.id),preview.window,'the exact reviewed window is saved unchanged');
 assert.equal(planned.definition.enabled,false,'planning does not resume the paused monitor');
 await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('.editor-ready').waitFor();
 await page.locator('#erase-monitor').click();
 const confirmation=page.getByRole('dialog',{name:'Erase monitor?',exact:true});
 await confirmation.getByRole('textbox').fill(monitor.definition.name);
 const erasureResponse=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/monitors/${monitor.id}/erase`&&r.request().method()==='POST');
 await confirmation.getByRole('button',{name:'Erase monitor',exact:true}).click();
 const response=await erasureResponse;assert.equal(response.status(),200);const {receipt}=await response.json();
 const completion=page.getByRole('dialog',{name:'Erasure complete',exact:true});await completion.waitFor();
 assert.ok((await completion.innerText()).includes(monitor.definition.name),'completion names the erased monitor');
 await assertPlainMonitorText(completion);assert.ok(!(await completion.innerText()).includes(receipt.id),'the raw receipt ID stays out of the everyday screen');
 assert.equal(await completion.locator('[data-erasure-category]:visible').count(),0,'the counted summary starts closed');
 assert.equal(await current(),undefined,'the monitor is actually erased');
 const reference=await completion.locator('.erasure-reference-value').innerText();
 assert.ok(reference.length>0,'a readable receipt reference is available');
 // Grant only this disposable browser context access to its local clipboard.
 await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
 await completion.getByRole('button',{name:'Copy reference',exact:true}).click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),reference,'copy uses the displayed reference');
 await accessible(completion);await screenshots('erasure-completion');
 const downloaded=page.waitForEvent('download');await completion.getByRole('button',{name:'Download receipt',exact:true}).click();
 const bytes=await readFile(await (await downloaded).path());
 assert.deepEqual(JSON.parse(bytes),receipt,'the download preserves the exact recorded receipt without names or display fields');
 await completion.getByText('Receipt details',{exact:true}).click();
 await assertPlainMonitorText(completion);
 assert.ok(!(await completion.innerText()).includes(receipt.id),'expanded details never expose the stored UUID');
 assert.doesNotMatch(await completion.innerText(),/Agent door events|Effect grants|Attempt checkpoints|Heartbeat claims|Stored monitor receipt ID/i,'details use words about the erased content');
 const rows=completion.locator('[data-erasure-category]');assert.ok(await rows.count()>0);
 const displayedCounts=await rows.locator('dd').allTextContents();
 assert.equal(displayedCounts.reduce((sum,count)=>sum+Number(count),0),Object.values(receipt.counts).reduce((sum,count)=>sum+count,0),'every stored count is represented exactly once');
 const labels=await rows.locator('dt').allTextContents();
 for(const table of Object.keys(receipt.counts))assert.ok(!labels.some(label=>label.toLowerCase()===table.replaceAll('_',' ')),'storage names never become category labels');
 assert.equal(await completion.locator('time').getAttribute('datetime'),new Date(receipt.completedAt).toISOString(),'the recorded completion time remains available');
 await accessible(completion);await screenshots('erasure-receipt-details');
 await completion.getByText('Receipt details',{exact:true}).click();
 if(proofDirectory){
  await writeFile(join(proofDirectory,'after-erasure-receipt.json'),bytes);
  await writeFile(join(proofDirectory,'readable-receipts.json'),JSON.stringify({journey:'proveReadableMaintenanceAndErasure',assertionWidth:1440,proofWidths:[1440,390],monitorName:monitor.definition.name,selectionNamed:true,previewNamed:true,rawMonitorIdsVisible:false,rawReceiptIdVisible:false,inventoryRowsVisible:0,storedInventoryRows:Object.keys(receipt.counts).length,displayedCategories:await rows.count(),expandedRawReceiptIdVisible:false,expandedInternalNamesVisible:false,allCountsRepresented:true,heartbeatDetailsPlain:true,heartbeatApiUnchanged:true,receiptDownloadEqualsServer:true,clipboardEqualsDisplay:true,reviewedWindowUnchanged:true,pausedMonitorStayedPaused:true,monitorErased:true},null,2)+'\n');
 }
 await completion.getByRole('button',{name:'Close receipt',exact:true}).click();await page.waitForURL(origin+'/app/monitors');
}
