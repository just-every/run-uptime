// The buyer's move-in path inside the command journey: from the console navigation, upload the synthetic UptimeRobot
// file, read the preview counts and rows, apply exactly that preview, see the new monitors paused, and undo the batch;
// at 1440, with axe and horizontal-overflow checks. Screenshots go to UPTIME_DEFINITIONS_EVIDENCE when set.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const fixture = fileURLToPath(new URL('./fixtures/uptimerobot-v3-monitors.synthetic.json', import.meta.url));
const axeSource = require('node:fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function audit(page, label, evidence, width) {
 assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} fits ${width}px without horizontal scroll`);
 await page.evaluate(axeSource);
 const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
 const severe = result.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id);
 if (evidence) {
  await page.screenshot({ path: join(evidence, `${label}-${width}.png`), fullPage: true });
  await writeFile(join(evidence, `${label}-${width}-axe.json`), JSON.stringify({ severe, violations: result.violations.map(v => ({ id: v.id, impact: v.impact })) }, null, 2));
 }
 assert.deepEqual(severe, [], `${label} at ${width}px has no serious or critical axe violations`);
}

export async function definitionsJourney(page, origin) {
 const evidence = process.env.UPTIME_DEFINITIONS_EVIDENCE;
 if (evidence) await mkdir(evidence, { recursive: true });
 const cases = [
  { width: 1440, file: fixture, counts: { Create: '6', Unchanged: '0', Change: '0', Refused: '2', Unsupported: '4' }, apply: 'Apply: create 6, change 0', created: ['Shop home', 'Docs', 'Checkout keyword', 'Error banner absent', 'Nightly backup', 'Partner API'] },
  { width: 1440, file: { name: 'uptime.monitors.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'uptime.monitors', version: 1, monitors: [{ name: 'Phone import', url: 'https://phone.example.test/' }, { name: 'Shop home', url: 'https://shop.example.com/', method: 'GET', timeoutMs: 10000, freshnessMs: 900000, intervalMs: 300000 }] })) }, counts: { Create: '1', Unchanged: '1', Change: '0', Refused: '0', Unsupported: '0' }, apply: 'Apply: create 1, change 0', created: ['Phone import'] },
 ];
 for (const step of cases) {
  await page.setViewportSize({ width: step.width, height: 900 });
  await page.goto(origin + '/app/settings/backup');
  await page.getByRole('heading', { name: 'Monitor files' }).waitFor();
  await page.getByLabel(/^A file from\b/).setInputFiles(step.file);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const apply = page.getByRole('button', { name: step.apply, exact: true });
  await apply.waitFor();
  await page.waitForFunction(()=>{const control=document.getElementById('definition-apply');return control&&!control.disabled});
  const counts = await page.locator('.definition-counts > div').evaluateAll(rows => Object.fromEntries(rows.map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent])));
  assert.deepEqual(counts, step.counts, 'the preview shows its counts before its rows');
  await audit(page, 'definitions-preview', evidence, step.width);
  await apply.click();
  await page.locator('#action-notice').filter({ hasText: /^Applied:/ }).waitFor();
  const batch = page.locator('.definition-batches > li').first();
  for (const name of step.created) await batch.getByText(`${name} — created`, { exact: true }).waitFor();
  await audit(page, 'definitions-applied', evidence, step.width);
  // The monitor list shows every imported monitor paused.
  await page.getByRole('link', { name: 'Monitors', exact: true }).click();
  for (const name of step.created) {
   const row = page.locator('.monitor-row').filter({ has: page.locator('.monitor-name', { hasText: name }) });
   await row.locator('.ui-pill.state').filter({ hasText: 'Paused' }).waitFor();
  }
  if (evidence) await page.screenshot({ path: join(evidence, `definitions-monitors-paused-${step.width}.png`), fullPage: true });
  await page.getByRole('link', { name: /^Settings(, \d+ to fix)?$/ }).click();
  await page.getByRole('link', { name: 'Backup and files', exact: true }).click();
  await page.locator('.definition-batches > li').first().getByRole('button', { name: /^Undo/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Undo import', exact: true }).click();
  await page.locator('#action-notice').filter({ hasText: /^Batch undone/ }).waitFor();
  for (const name of step.created) await page.locator('.definition-batches > li').first().getByText(`${name} — created; Paused, history kept`, { exact: true }).waitFor();
  await audit(page, 'definitions-undone', evidence, step.width);
 }
 await incumbentReportJourney(page,origin);
}

export async function incumbentReportJourney(page,origin){
 const evidence=process.env.UPTIME_DEFINITIONS_EVIDENCE;
 if(evidence)await mkdir(evidence,{recursive:true});
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/app/settings/backup');
 const input=fileURLToPath(new URL('./fixtures/incumbent-import/edge/unknown-fields.json',import.meta.url));
 await page.getByLabel(/^A file from\b/).setInputFiles(input);await page.getByRole('button',{name:'Preview',exact:true}).click();
 const report=page.locator('.definition-field-report');await report.waitFor();await report.locator(':scope > summary').click();
 assert.match(await report.textContent(),/unsupported/);assert.match(await report.textContent(),/unknown|supplied/i);
 const download=page.getByRole('button',{name:'Download field report JSON',exact:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  await download.focus();assert.equal(await download.evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');assert.equal(await download.evaluate(el=>el===document.activeElement),true,'report download is reachable by keyboard');
  const pending=page.waitForEvent('download');await page.keyboard.press('Enter');const file=await pending,stream=await file.createReadStream();let text='';for await(const bytes of stream)text+=bytes;
  const data=JSON.parse(text);assert.ok(data.fields.length);assert.ok(data.fields.some(field=>field.path.includes('future')||field.path.includes('syntheticExtension')),'unknown supplied keys are named');assert.ok(!text.includes('SYNTHETIC_SOURCE_'));
  const session=await page.context().newCDPSession(page);const tree=await session.send('Accessibility.getFullAXTree');await session.detach();assert.ok(tree.nodes.some(node=>node.role?.value==='button'&&node.name?.value==='Download field report JSON'));
  await audit(page,'incumbent-field-report',evidence,width);
 }
 await page.getByRole('button',{name:/^Apply: create/}).click();await page.locator('#action-notice').filter({hasText:/^Applied:/}).waitFor();
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.locator('.definition-field-report > summary').click();await audit(page,'incumbent-applied-report',evidence,width);if(width===1440)await page.locator('.definition-field-report > summary').click()}
 // Recognition errors preserve the reviewed report and are announced without hiding the message on refresh.
 await page.getByLabel(/^A file from\b/).setInputFiles({name:'malformed.json',mimeType:'application/json',buffer:Buffer.from('{"check":')});
 await page.getByRole('button',{name:'Preview',exact:true}).click();await page.locator('#action-notice').filter({hasText:/JSON/i}).waitFor();assert.ok(await report.isVisible());for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await audit(page,'incumbent-input-error',evidence,width)};
 await page.reload();await page.locator('.definition-batches > li').first().getByRole('button',{name:/^Undo/}).click();await page.getByRole('dialog').getByRole('button',{name:'Undo import',exact:true}).click();await page.locator('#action-notice').filter({hasText:/^Batch undone/}).waitFor();
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await audit(page,'incumbent-undone',evidence,width)}
 for(const path of ['definitions','migrating-pingdom'])for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(origin+'/docs/'+path);await page.locator('main h1').waitFor();await audit(page,'guide-'+path,evidence,width)}
}

// A focused executable for this import screen; the command journey also calls the same flow.
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const {chromium}=await import('playwright'),{migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts}=await import('./notify-acceptance-runtime.mjs'),{browserSignIn}=await import('./auth-test-support.mjs');
 const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;let worker,browser;
 try{({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings:{UPTIME_ORIGIN:origin}}));browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const page=await browser.newPage();await browserSignIn(page,origin);await incumbentReportJourney(page,origin);console.log('Incumbent report owner console passed at 1440/390: keyboard, downloads, focus, accessibility tree, axe, errors, paused apply and undo.');}
 finally{await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
}
