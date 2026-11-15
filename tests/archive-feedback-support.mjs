import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {definitionDoor} from './auth-test-support.mjs';

// A real list edit leaves portable import history. Erasing a separately
// imported job creates a later journal checkpoint, which fences the old backup.
export async function prepareArchiveFeedback(page,origin,directory){
 const request=page.request,post=(path,data)=>request.post(origin+path,{data});
 const overview=await (await request.get(origin+'/api/overview')).json(),id=overview.monitors[0].id;
 const input={monitorIds:[id],action:'edit',changes:{tags:['portable-history']}};
 const planned=await post('/api/catalog/preview',input);assert.equal(planned.status(),200);
 assert.equal((await post('/api/catalog/apply',{...input,digest:(await planned.json()).digest})).status(),201);
 const fetcher=async(url,init)=>{const {cookie,...headers}=init.headers;const response=await request.fetch(url,{method:init.method,headers,data:init.body});return new Response(await response.body(),{status:response.status()})};
 const door=definitionDoor({origin,fetcher}),plan=await door.preview({format:'uptime.monitors',version:5,monitors:[{name:'Synthetic retired job',type:'heartbeat',heartbeat:{maxAgeMs:60000}}]});assert.equal(plan.status,200);
 const applied=await door.apply(plan.body);assert.equal(applied.status,200);
 const old=await request.get(origin+'/api/archive');assert.equal(old.status(),200);
 assert.equal((await post('/api/monitors/'+applied.body.created[0]+'/erase',{name:'Synthetic retired job'})).status(),200);
 const journal=await request.get(origin+'/api/erasure-journal');assert.equal(journal.status(),200);
 const oldFile=join(directory,'before-erasure.json'),journalFile=join(directory,'later-erasure.json');
 await writeFile(oldFile,await old.body(),{mode:0o600});await writeFile(journalFile,await journal.body(),{mode:0o600});
 return {oldFile,journalFile};
}
export async function proveFencedArchiveFeedback(page,origin,{oldFile,journalFile}){
 await page.locator('#definition-batches .rows-note').waitFor();
 assert.equal(await page.locator('.definition-batches > li').count(),0,'the receiving history has loaded empty');
 await page.getByText('Restoring an older backup',{exact:true}).click();await page.locator('#later-journal').setInputFiles(journalFile);
 const refused=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/restore'&&r.request().method()==='POST');
 await page.locator('#restore:not(:disabled)').setInputFiles(oldFile);const result=await refused;assert.equal(result.status(),400);
 assert.equal((await result.json()).error,'erasure_epoch','the real later-erasure fence refuses this archive');
 const notice=page.locator('#action-notice[data-state=error]');await notice.waitFor();
 const text=await notice.innerText();assert.match(text,/backup.*erasure/i);assert.match(text,/nothing.*restored/i);assert.match(text,/new backup.*source|source.*new backup/i);assert.doesNotMatch(text,/erasure_epoch/);
 assert.equal((await (await page.request.get(origin+'/api/overview')).json()).monitors.length,0,'refusal restores nothing');
 assert.equal(await page.locator('#restore').isEnabled(),true,'a current backup can still be chosen');
}
export async function assertRestoredImportHistory(page){
 const batches=page.locator('.definition-batches > li');await batches.first().waitFor();
 assert.match(await batches.innerText(),/archive.*history/i,'restored history appears without a reload');
 assert.equal(await batches.locator('.definition-undo').count(),0,'restored history cannot undo an old installation');
 await batches.locator('summary').first().click();assert.ok(await batches.locator('details[open] li').count()>0,'the restored import retains entries');
}
