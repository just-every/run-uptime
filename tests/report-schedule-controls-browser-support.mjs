import assert from 'node:assert/strict';
import {join} from 'node:path';
export async function proveReportScheduleControls({page,origin,monitor,destination,width,out}){
 const panel=page.locator('#report-schedule-controls');await panel.getByText('Schedule a one-time report',{exact:true}).click();
 const form=panel.locator('form');await form.getByLabel('Monitor',{exact:true}).selectOption(monitor.id);await form.getByLabel('Destination',{exact:true}).selectOption(destination.id);
 const local=new Date(Date.now()+600000);local.setMinutes(local.getMinutes()-local.getTimezoneOffset());const due=local.toISOString().slice(0,16);
 await form.getByLabel('Send at (local time)',{exact:true}).fill(due);await form.getByLabel('Report time zone',{exact:true}).fill('America/New_York');
 await page.waitForTimeout(5500);assert.equal(await form.getByLabel('Report time zone',{exact:true}).inputValue(),'America/New_York','polling retains schedule draft');
 await panel.screenshot({path:join(out,`schedule-form-${width}.png`)});
 await form.getByRole('button',{name:'Schedule report',exact:true}).click();await panel.getByRole('status').filter({hasText:'Report scheduled.'}).waitFor();
 const schedules=await(await page.request.get(origin+`/api/monitors/${monitor.id}/report-schedules`)).json();const saved=schedules.find(s=>s.dueAt===new Date(due).getTime());assert.ok(saved);assert.equal(saved.state,'queued');
 await panel.getByRole('button',{name:'Cancel scheduled report',exact:true}).click();await panel.getByRole('status').filter({hasText:'Report cancelled.'}).waitFor();
 await page.reload();await panel.locator(`[data-report-id="${saved.id}"]`).getByText(/Cancelled by owner/).waitFor();
 const retained=await(await page.request.get(origin+`/api/monitors/${monitor.id}/report-schedules/${saved.id}`)).json();assert.equal(retained.code,'report_cancelled');assert.equal(retained.attempts,0);
 await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth));
 await panel.screenshot({path:join(out,`schedule-cancelled-${width}.png`)});
}
