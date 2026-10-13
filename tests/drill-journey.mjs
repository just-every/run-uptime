// The owner's alert drill inside the command journey: add an email destination, run its drill, read the separate lines,
// open the captured message in the development outbox as the recipient (no session), confirm, and see "Last proven";
// at 1440 and 390, with axe and horizontal-overflow checks. Screenshots go to UPTIME_DRILL_EVIDENCE when set.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const axeSource = require('node:fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

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
// The newest captured drill message for this recipient, read through the key-gated outbox the page context holds.
async function drillLink(page, origin, address) {
 const listing = await (await page.request.get(origin + '/__dev/outbox')).text();
 const article = [...listing.matchAll(/<article>([\s\S]*?)<\/article>/g)].map(match => match[1]).find(article => /<h2>Alert drill: Uptime<\/h2>/.test(article) && article.includes(`To: ${address}`));
 assert.ok(article, 'the drill message is captured for its recipient');
 const detail = await (await page.request.get(origin + decode(article.match(/href="([^"]+\?message=[^"]+)"/)[1]))).text();
 return decode(detail.match(/class="open" href="([^"]+)"/)[1]);
}

export async function drillJourney(page, origin) {
 const evidence = process.env.UPTIME_DRILL_EVIDENCE;
 if (evidence) await mkdir(evidence, { recursive: true });
 for (const width of [1440, 390]) {
  const name = `Drill inbox ${width}`, address = `drill-${width}@example.test`;
  await page.setViewportSize({ width, height: 900 });
  await page.goto(origin + '/app');
  await page.getByRole('link', { name: 'Notifications', exact: true }).click();
  await page.getByRole('button', { name: 'Add destination' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Email address').fill(address);
  await dialog.getByRole('button', { name: 'Create destination' }).click();
  const card = page.locator('.destination-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await page.waitForFunction(id=>{const control=document.getElementById(id);return control&&!control.disabled},await card.getByRole('button', { name: 'Run alert drill' }).getAttribute('id'));
  await card.getByText(/^Never proven/).waitFor();
  await card.getByRole('button', { name: 'Run alert drill' }).click();
  await page.locator('#action-notice').filter({ hasText: /^Alert drill queued/ }).waitFor();
  const line = term => card.locator('.drill-lines > div').filter({ has: page.locator('dt', { hasText: term }) }).locator('dd');
  await line('Acknowledged').filter({ hasText: 'Captured in the local outbox. No email was sent.' }).waitFor({ timeout: 120000 });
  await line('Submitted').filter({ hasText: 'Uptime started sending it.' }).waitFor();
  await line('Recipient confirmed').filter({ hasText: /^Not confirmed yet/ }).waitFor();
  assert.equal(await card.locator('.drill-lines dt').count(), 3, 'three separate lines; acting on it is not measured');
  await card.getByText('Whether anyone acted on it is not measured.').waitFor();
  await audit(page, 'drill-sent', evidence, width);
  // The recipient is not signed in: a fresh context with no session or outbox key.
  const link = await drillLink(page, origin, address);
  const recipient = await page.context().browser().newContext({ viewport: { width, height: 900 } });
  try {
   const view = await recipient.newPage();
   await view.goto(link);
   await view.getByRole('heading', { name: 'Alert drill' }).waitFor();
   await audit(view, 'drill-recipient-page', evidence, width);
   await view.getByRole('button', { name: 'Confirm I received this drill' }).click();
   await view.getByRole('heading', { name: 'Thank you' }).waitFor();
   await audit(view, 'drill-recipient-confirmed', evidence, width);
   await view.goto(link);
   await view.getByRole('heading', { name: 'Page not found' }).waitFor();
  } finally { await recipient.close(); }
  await line('Recipient confirmed').filter({ hasText: 'Reported by the recipient.' }).waitFor({ timeout: 30000 });
  await card.getByText(/^Last proven .+ · reported by a recipient$/).waitFor();
  await audit(page, 'drill-proven', evidence, width);
 }
}
