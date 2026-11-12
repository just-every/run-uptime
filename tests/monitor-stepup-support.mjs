import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Part of operator-security's existing in-place step-up journey, at one width.
export async function proveImportEraseStepUp({page,origin,call,cookie,DB,recovery}){
 const expire=()=>DB.prepare('UPDATE uptime_mfa_proofs SET verified_at=?').bind(Date.now()-300001).run();
 const shot=async name=>{
  if(!process.env.UPTIME_SCREENSHOTS)return;
  await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===390?844:1000});
   await page.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`${name}-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
 };
 const prompt=page.locator('[data-stepup-dialog]');
 const verify=async()=>{
  await prompt.getByLabel('Authenticator or recovery code',{exact:true}).fill(recovery.shift());
  await prompt.getByRole('button',{name:'Verify code',exact:true}).click();await prompt.waitFor({state:'detached'});
 };
 const created=await call('/api/monitors',{name:'synthetic-uptime-erase-stepup',url:'https://example.com/',enabled:false},{cookie});assert.equal(created.status,201);const monitor=await created.json();
 const before=(await(await call('/api/overview',undefined,{cookie})).json()).monitors.map(m=>m.id).sort();
 const file={name:'synthetic-uptime-stepup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'uptime.monitors',version:1,monitors:[{name:'synthetic-uptime-preview-stepup',url:'https://example.org/',enabled:false}]}))};
 await expire();await page.goto(origin+'/app/settings/backup');await page.locator('#definition-file').setInputFiles(file);
 const previewRefusal=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operator/import/uploads'&&r.status()===403);
 await page.getByRole('button',{name:'Preview',exact:true}).click();const refusedPreview=await previewRefusal;assert.equal((await refusedPreview.json()).code,'fresh_second_factor_required');await prompt.waitFor();
 assert.equal(await page.locator('#definition-file').evaluate(el=>el.files[0].name),file.name);await shot('import-preview-verification');
 // Cancelling keeps the public file input and permits another attempt.
 await prompt.getByRole('button',{name:'Cancel',exact:true}).click();await prompt.waitFor({state:'detached'});await page.getByRole('button',{name:'Preview',exact:true}).waitFor({state:'visible'});
 assert.equal(await page.locator('#definition-file').evaluate(el=>el.files[0].name),file.name);
 const recognised=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/definitions/recognise'&&r.status()===200),uploaded=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operator/import/uploads'&&r.status()===200);
 await page.getByRole('button',{name:'Preview',exact:true}).click();await prompt.waitFor();await verify();
 const resumed=await recognised;assert.deepEqual(resumed.request().postDataBuffer(),file.buffer,'the chosen file survives cancellation');assert.deepEqual((await uploaded).request().postDataJSON(),refusedPreview.request().postDataJSON(),'verification retries the unchanged upload');
 await page.locator('#definition-preview-area:not([hidden])').waitFor();assert.ok((await page.locator('#definition-result').innerText()).includes('synthetic-uptime-preview-stepup'));await shot('import-preview-ready');
 assert.deepEqual((await(await call('/api/overview',undefined,{cookie})).json()).monitors.map(m=>m.id).sort(),before,'preview never applies the file');
 await expire();await page.goto(origin+'/app/monitors/'+monitor.id);await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#erase-monitor').click();
 const confirmation=page.getByRole('dialog');await confirmation.getByRole('textbox').fill(monitor.definition.name);
 const eraseRefusal=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/monitors/${monitor.id}/erase`&&r.status()===403);
 await confirmation.getByRole('button',{name:'Erase monitor',exact:true}).click();assert.equal((await(await eraseRefusal).json()).code,'fresh_second_factor_required');await prompt.waitFor();await shot('monitor-erase-verification');
 assert.ok(await DB.prepare('SELECT id FROM monitors WHERE id=?').bind(monitor.id).first(),'refused erasure preserves the monitor');
 const erased=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/monitors/${monitor.id}/erase`&&r.status()===200);
 await verify();const response=await erased,{receipt}=await response.json();assert.deepEqual(response.request().postDataJSON(),{name:monitor.definition.name},'verification retains the typed confirmation');
 const view=page.locator('.erasure-receipt');await view.waitFor();assert.ok((await view.innerText()).includes(receipt.entityKind));assert.ok((await view.innerText()).includes(receipt.id));assert.equal(await view.locator('time').getAttribute('datetime'),new Date(receipt.completedAt).toISOString());
 const displayed=await view.locator('[data-erasure-table]').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.dataset.erasureTable,Number(row.querySelector('dd').textContent)])));assert.deepEqual(displayed,receipt.counts,'every table has its own returned count');
 const stored=await DB.prepare('SELECT entity_kind,counts,completed_at FROM uptime_erasure_receipts WHERE id=?').bind(receipt.id).first();assert.deepEqual({entityKind:stored.entity_kind,counts:JSON.parse(stored.counts),completedAt:stored.completed_at},{entityKind:receipt.entityKind,counts:receipt.counts,completedAt:receipt.completedAt});
 const exported=await(await call('/api/archive',undefined,{cookie})).json();assert.deepEqual(exported.payload.productTables.uptime_erasure_receipts.find(row=>row.id===receipt.id),{id:receipt.id,...stored},'later backup carries the receipt shown');
 assert.equal(await DB.prepare('SELECT id FROM monitors WHERE id=?').bind(monitor.id).first(),null);assert.ok(await view.evaluate(el=>el.scrollWidth<=el.clientWidth),'receipt reflows without horizontal scrolling');
 if(process.env.UPTIME_SCREENSHOTS)await writeFile(join(process.env.UPTIME_SCREENSHOTS,'monitor-erasure-receipt.json'),JSON.stringify({receipt,stored,displayed,archiveReceipt:exported.payload.productTables.uptime_erasure_receipts.find(row=>row.id===receipt.id)},null,2)+'\n');
 await shot('monitor-erasure-receipt');
 await view.getByRole('button',{name:'Close receipt',exact:true}).click();await page.waitForURL(origin+'/app/monitors');assert.equal(await page.locator('.erasure-receipt').count(),0);
 console.log('Import/erase step-up PASS: expired proof, cancelled preview/file retention, unchanged-byte retry, retained typed erasure, per-table receipt equal to storage and later backup.');
}
