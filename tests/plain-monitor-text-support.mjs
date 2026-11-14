import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Person-facing text stays readable; raw definitions remain in the API and exports.
export async function assertPlainMonitorText(region){
 const visible=await region.innerText();
 assert.doesNotMatch(visible,/\blocal-[a-z]\b|\bself-[0-9a-f-]{36}\b|\b[A-Z][A-Z0-9]*(?:-[A-Z]+)*-\d{3}\b|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|[{}]/,'visible monitor text has no internal location/clause IDs or JSON payload');
}

// Extends the existing owner monitor journey: the incident is produced by a real scheduled runner and target control.
// Changing today's status rule while the incident remains open must not change the expectation shown for its saved slot.
export async function provePlainMonitorEvidence(page,origin,monitor){
 const current=async()=>(await (await page.request.get(origin+'/api/overview')).json()).monitors.find(m=>m.id===monitor.id);
 const save=async definition=>assert.equal((await page.request.patch(origin+`/api/monitors/${monitor.id}`,{headers:{origin},data:definition})).status(),200);
 const control=async mode=>assert.equal((await page.request.post('http://127.0.0.1:15481/control',{data:{mode}})).status(),200);
 const saved={...monitor.definition,assertions:{...monitor.definition.assertions,status:['200-299']}};
 await save(saved);const reviewed=await current();
 // Wait for the changed definition's real passing slot before causing its failure.
 let slots=[];
 for(const end=Date.now()+30000;Date.now()<end;await page.waitForTimeout(500)){
  slots=await (await page.request.get(origin+`/api/monitors/${monitor.id}/history`)).json();
  if(slots.some(s=>s.revision===reviewed.revision&&s.status==='complete'&&s.observations.every(o=>o.outcome==='pass')))break;
 }
 assert.ok(slots.some(s=>s.revision===reviewed.revision&&s.status==='complete'&&s.observations.every(o=>o.outcome==='pass')),'reviewed status range has a real passing check');
 try{
  await control('failing');await page.locator('#monitor-state').filter({hasText:'Failing'}).waitFor({timeout:30000});
  await page.evaluate(()=>{location.hash='incidents'});
  const incident=page.locator('#monitor-incidents');
  await incident.getByText('Incident evidence',{exact:true}).first().click();
  const events=await (await page.request.get(origin+`/api/monitors/${monitor.id}/incidents`)).json();
  const trigger=events[0].trigger;assert.equal(trigger.monitorRevision,reviewed.revision);
  slots=await (await page.request.get(origin+`/api/monitors/${monitor.id}/history`)).json();
  const slot=slots.find(s=>s.id===trigger.slotId),failed=slot.observations.find(o=>o.checks.some(c=>c.assertion==='status'&&!c.pass));
  assert.ok(failed,'incident has a retained failed HTTP status');
  const check=page.locator(`#raw-history details[data-slot="${slot.id}"]`);
  await check.locator('summary').click();await assertPlainMonitorText(check);
  assert.doesNotMatch(await check.innerText(),/target_failure|runner_error|body-absent/,'attempt results use readable rule names');
  await save(monitor.definition);
  await page.waitForResponse(r=>new URL(r.url()).pathname==='/api/overview'&&r.ok());
  const evidence=incident.locator('details[open]').first();
  await assertPlainMonitorText(evidence);
  const words=await evidence.innerText(),expected=slot.definition.assertions.status.map(String).join(', ').replaceAll('-','–');
  assert.ok(words.includes(String(failed.status))&&words.includes(expected),'incident names the measured status and its original expected range after an edit');
  for(const assignment of Object.values(slot.definition.assignments))assert.ok(words.includes(assignment.networkLabel),'incident names the assigned place');
  await page.evaluate(()=>{location.hash='details'});const details=page.locator('#details');await details.locator('dt').first().waitFor();
  assert.ok(await details.locator('dt').count()>0,'saved details have labelled values');
  await assertPlainMonitorText(details);
  assert.equal(await details.locator('pre').count(),0,'saved details never render a raw payload');
  assert.deepEqual((await current()).definition,monitor.definition,'the full saved criteria remain available through the API');
 }finally{await control('healthy')}
 await page.locator('#monitor-state').filter({hasText:'Healthy'}).waitFor({timeout:30000});
 await provePeriodReport(page,origin,monitor);
 return current();
}

// Part of the same owner journey: the existing signed scheduled incident and
// measured samples must remain readable after opening a report and returning.
export async function provePeriodReport(page,origin,monitor){
 await page.evaluate(()=>{location.hash='reports'});
 await page.locator('#report-generate').waitFor();
 const sideWidth=await page.locator('.monitor-column-side').evaluate(node=>node.getBoundingClientRect().width);
 assert.equal(await page.locator('.monitor-column-side #report-results').count(),0,'the monitor keeps only the report control');
 await page.locator('#report-period').selectOption('7d');await page.locator('#report-generate').click();
 await page.locator('#report-results .report-snapshot').waitFor();
 assert.equal(await page.locator('#report-period').inputValue(),'7d','the selected period opens in the report view');
 const report=page.locator('#report-results');
 assert.equal(await page.locator('#monitor-page').count(),0,'generating a report opens a dedicated view');
 const reportWidth=await report.evaluate(node=>node.getBoundingClientRect().width);
 assert.ok(reportWidth>sideWidth*2,'the report uses the wide content area outside the side column');
 assert.equal(await page.locator('.monitor-column-side #report-results').count(),0);
 await page.locator('.report-options > summary').click();
 await page.locator('#report-period').selectOption('24h');await page.locator('#report-bucket').selectOption('raw');
 await page.locator('#report-use-sla').check();
 const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/report')&&r.ok());
 await page.locator('#report-generate').click();const snapshot=await (await response).json();
 await page.locator('#report-status').getByText('Report generated.',{exact:true}).waitFor();
 await report.getByText('Incident evidence',{exact:true}).first().click();await assertPlainMonitorText(report);
 assert.ok(await report.locator('td[data-label=Location]').count()>0,'report contains measured location samples');
 assert.ok((await report.locator('td[data-label=Location]').allInnerTexts()).every(value=>Object.values(monitor.definition.assignments).some(a=>a.networkLabel===value)),'report samples name their assigned places');
 assert.ok(snapshot.incidents.length>0&&snapshot.sla&&snapshot.availability.observedMs>0,'the report retains incident, SLA and coverage figures');
 assert.doesNotMatch(await report.innerText(),/\([−\-]?[\d,.]+\s*(?:seconds?|s|ms|milliseconds?)\)/i,'durations have no second parenthesised numerical form');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'report and its table fit the page');
 await page.addScriptTag({path:join(process.cwd(),'node_modules/axe-core/axe.min.js')});
 assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],'report remains accessible');
 const generated=await report.locator('time').first().getAttribute('datetime');
 await page.waitForResponse(r=>new URL(r.url()).pathname==='/api/overview'&&r.ok());
 assert.equal(await report.locator('time').first().getAttribute('datetime'),generated,'polling preserves the generated snapshot');
 for(const format of ['json','csv','pdf']){
  const downloaded=page.waitForEvent('download');await page.locator(`#report-${format}`).click();
  const data=await readFile(await (await downloaded).path());
  if(format==='json')assert.deepEqual(JSON.parse(data),snapshot,'JSON downloads the exact displayed snapshot');
  if(format==='csv')assert.ok(data.toString().includes(String(snapshot.availability.observedMs)),'CSV retains exact duration figures');
  if(format==='pdf')assert.ok(data.subarray(0,5).equals(Buffer.from('%PDF-')),'PDF remains downloadable');
 }
 // Proof at both widths; assertions above run once at the journey's 1440 width.
 if(process.env.UPTIME_SCREENSHOTS){
  const out=process.env.UPTIME_SCREENSHOTS;await mkdir(out,{recursive:true});
  const proof=[];
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:join(out,`report-${width}.png`),fullPage:true});
   proof.push(await report.evaluate(node=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,reportWidth:node.getBoundingClientRect().width,insideSideColumn:Boolean(node.closest('.monitor-column-side')),doubledDurations:node.innerText.match(/\([\d,.]+ seconds\)/g)??[]})));
  }
  await writeFile(join(out,'report-layout.json'),JSON.stringify(proof,null,2)+'\n');
  await page.setViewportSize({width:1440,height:900});
 }
 await page.locator('#report-back').click();await page.locator('#report-generate').waitFor();
 assert.equal(await page.locator('#monitor-page #report-results').count(),0,'the monitor never grows by the generated report');
 assert.equal(await page.locator('#monitor-page .report-snapshot').count(),0);
}
