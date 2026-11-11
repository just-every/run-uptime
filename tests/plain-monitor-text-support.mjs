import assert from 'node:assert/strict';

// Only visible console text is checked: support JSON remains available in its explicitly closed disclosure.
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
  await page.evaluate(()=>{location.hash='details'});const details=page.locator('#details');await details.locator('.check-raw-data').waitFor();
  assert.ok(await details.locator('dt').count()>0,'saved details have labelled values');
  assert.equal(await details.locator('.check-raw-data pre').isVisible(),false,'support payload starts closed');
  await assertPlainMonitorText(details);
  await details.locator('.check-raw-data > summary').click();assert.equal(await details.locator('.check-raw-data pre').isVisible(),true,'support payload remains reachable');
  await details.locator('.check-raw-data > summary').click();
 }finally{await control('healthy')}
 await page.locator('#monitor-state').filter({hasText:'Healthy'}).waitFor({timeout:30000});
 await page.evaluate(()=>{location.hash='reports'});
 await page.locator('#report-bucket').selectOption('raw');await page.locator('#report-generate').click();
 await page.locator('#report-status').getByText('Report generated.',{exact:true}).waitFor();
 const report=page.locator('#report-results');
 await report.getByText('Incident evidence',{exact:true}).first().click();await assertPlainMonitorText(report);
 assert.ok(await report.locator('td[data-label=Location]').count()>0,'report contains measured location samples');
 assert.ok((await report.locator('td[data-label=Location]').allInnerTexts()).every(value=>Object.values(monitor.definition.assignments).some(a=>a.networkLabel===value)),'report samples name their assigned places');
 return current();
}
