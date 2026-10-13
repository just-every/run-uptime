// The buyer's move-in path inside the command journey: from the console navigation, upload the synthetic UptimeRobot
// file, read the preview counts and rows, apply exactly that preview, see the new monitors paused, and undo the batch;
// at 1440 and 390, with axe and horizontal-overflow checks. Screenshots go to UPTIME_DEFINITIONS_EVIDENCE when set.
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
  { width: 1440, file: fixture, counts: { Create: '5', Unchanged: '0', Change: '0', Refused: '2', Unsupported: '5' }, apply: 'Apply: create 5, change 0', created: ['Shop home', 'Docs', 'Checkout keyword', 'Nightly backup', 'Partner API'] },
  { width: 390, file: { name: 'uptime.monitors.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'uptime.monitors', version: 1, monitors: [{ name: 'Phone import', url: 'https://phone.example.test/' }, { name: 'Shop home', url: 'https://shop.example.com/', method: 'GET', timeoutMs: 10000, freshnessMs: 900000, intervalMs: 300000 }] })) }, counts: { Create: '1', Unchanged: '1', Change: '0', Refused: '0', Unsupported: '0' }, apply: 'Apply: create 1, change 0', created: ['Phone import'] },
 ];
 for (const step of cases) {
  await page.setViewportSize({ width: step.width, height: 900 });
  await page.goto(origin + '/app');
  await page.getByRole('link', { name: 'Definitions', exact: true }).click();
  await page.getByRole('heading', { name: 'Monitor definitions' }).waitFor();
  await page.getByLabel('Definition file, UptimeRobot monitor list or log export (2 MiB max)').setInputFiles(step.file);
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
   const row = page.locator('tr.monitor-row').filter({ has: page.locator('.monitor-name', { hasText: name }) });
   await row.locator('.ui-pill.state').filter({ hasText: 'Paused' }).waitFor();
  }
  if (evidence) await page.screenshot({ path: join(evidence, `definitions-monitors-paused-${step.width}.png`), fullPage: true });
  await page.getByRole('link', { name: 'Definitions', exact: true }).click();
  await page.locator('.definition-batches > li').first().getByRole('button', { name: 'Undo this batch' }).click();
  await page.locator('#action-notice').filter({ hasText: /^Batch undone/ }).waitFor();
  for (const name of step.created) await page.locator('.definition-batches > li').first().getByText(`${name} — created; Paused, history kept`, { exact: true }).waitFor();
  await audit(page, 'definitions-undone', evidence, step.width);
 }
}
