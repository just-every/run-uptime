import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {splitSql} from './migration-support.mjs';
import {ownerOutboxBrowserRuntime} from './owner-outbox-browser-runtime.mjs';
import {openGate, openOutboxMessage, testDevKey, testAuthBindings} from './auth-test-support.mjs';

const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'uptime-owner-outbox-browser-'));
const evidenceRoot = resolve(process.env.UPTIME_OWNER_OUTBOX_EVIDENCE ?? 'data/owner-outbox-browser-evidence');
await mkdir(evidenceRoot, {recursive: true, mode: 0o700});
const evidence = await mkdtemp(join(evidenceRoot, 'run-'));
await chmod(evidence, 0o700);
const bindings = {
  ...testAuthBindings,
  UPTIME_LOCAL_REVIEW: 'true', MAIL_PROVIDER: 'development', RER_DEV_KEY: testDevKey,
  OWNER_EMAIL: 'operator@example.test', MAIL_FROM: 'Uptime <auth@example.test>',
  SENDGRID_API_KEY: 'test-only-owner-outbox-must-never-submit',
};
let runtime, browser;
let externalMailCalls = 0;
try {
  runtime = await ownerOutboxBrowserRuntime(directory, bindings, request => {
    externalMailCalls++;
    throw new Error('External email is forbidden in this local browser test');
  });
  assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.origin), 'runtime uses one exact IPv4 loopback origin');

  const db = await runtime.worker.getD1Database('DB');
  for (const file of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) {
    for (const sql of splitSql(await readFile(join('migrations', file), 'utf8'))) await db.prepare(sql).run();
  }

  browser = await chromium.launch({headless: true, args: ['--disable-gpu'],
    ...(process.env.UPTIME_BROWSER_EXECUTABLE ? {executablePath: process.env.UPTIME_BROWSER_EXECUTABLE} : {})});
  const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
  const errors = [], consoleTypes = new Map(), externalOrigins = new Set(), audits = [];
  async function newContext(width) {
    const context = await browser.newContext({viewport: {width, height: 900}});
    context.on('page', page => {
      page.on('pageerror', error => errors.push(error?.name ?? 'Error'));
      page.on('console', message => {
        const reportedType = message.type();
        const type = /^[a-z][a-z0-9_-]{0,31}$/i.test(reportedType) ? reportedType : 'other';
        consoleTypes.set(type, (consoleTypes.get(type) ?? 0) + 1);
      });
    });
    context.route('**/*', route => {
      const requestOrigin = new URL(route.request().url()).origin;
      if (requestOrigin === runtime.origin) return route.continue();
      externalOrigins.add(requestOrigin);
      return route.abort();
    });
    await context.addInitScript(axeSource);
    return context;
  }
  async function audit(page, surface, width) {
    await page.setViewportSize({width, height: 900});
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const extent = await page.evaluate(() => ({viewport: innerWidth,
      document: document.documentElement.scrollWidth, body: document.body.scrollWidth}));
    assert.ok(extent.document <= width + 1 && extent.body <= width + 1,
      `${surface} at ${width}px has no horizontal overflow`);
    const result = await page.evaluate(() => axe.run(document, {
      runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']},
    }));
    const violations = result.violations.map(item => ({id: item.id, impact: item.impact,
      targets: item.nodes.map(node => node.target)}));
    const label = `${surface}-${width}`;
    const screenshot = join(evidence, `${label}.png`);
    await page.screenshot({path: screenshot, fullPage: true, mask: [
      page.locator('form input:not([type="hidden"])'),
      page.locator('a.open'), page.locator('pre'),
    ]});
    await chmod(screenshot, 0o600);
    await writeFile(join(evidence, `${label}-axe.json`),
      JSON.stringify({surface, width, axeViolations: violations, passes: result.passes.length}, null, 2),
      {mode: 0o600});
    audits.push({surface, width, axeViolations: violations.length, overflow: false});
    assert.deepEqual(violations, [], `${surface} at ${width}px has zero axe violations, including moderate impact`);
  }
  async function auditBoth(page, surface) {
    await audit(page, surface, 1440);
    await audit(page, surface, 390);
    await page.setViewportSize({width: 1440, height: 900});
  }
  async function signOutThroughUI(context, page) {
    const response = page.waitForResponse(candidate => candidate.url() === runtime.origin + '/api/auth/sign-out' &&
      candidate.request().method() === 'POST');
    await page.getByRole('link', {name: /SIGN OUT/i}).click();
    assert.equal((await response).status(), 200, 'the visible sign-out control reaches Base revocation');
    await page.waitForURL(runtime.origin + '/login');
    assert.equal((await context.request.get(runtime.origin + '/api/overview')).status(), 401,
      'sign-out revokes private API access in the same browser context');
    assert.equal((await context.request.get(runtime.origin + '/auth/session')).status(), 401,
      'sign-out revokes Base session lookup in the same browser context');
    assert.equal((await context.cookies(runtime.origin)).some(cookie => cookie.name === '__Host-operator_session'), false,
      'sign-out clears the browser session cookie');
  }

  const setupContext = await newContext(1440), setup = await setupContext.newPage();
  await setup.goto(runtime.origin + '/claim');
  await setup.getByLabel('Setup token').fill(bindings.SETUP_TOKEN);
  await setup.getByLabel('Your name').fill('Browser owner');
  await auditBoth(setup, 'setup');
  const bootstrapRequest = setup.waitForResponse(response => response.url() === runtime.origin + '/auth/bootstrap' &&
    response.request().method() === 'POST');
  await setup.getByRole('button', {name: 'Create owner account', exact: true}).click();
  const bootstrap = await bootstrapRequest;
  assert.equal(bootstrap.status(), 303, 'first owner bootstrap succeeds through the native setup form');
  await setup.waitForURL(runtime.origin + '/setup');
  await auditBoth(setup, 'first-run');
  await setup.getByRole('button', {name: 'Finish setup', exact: true}).click();
  await setup.waitForURL(runtime.origin + '/app');
  await setup.locator('.signed-in').waitFor();
  assert.equal((await setupContext.request.get(runtime.origin + '/api/overview')).status(), 200,
    'first owner can read the private API');
  await auditBoth(setup, 'signed-in-first-owner');

  const duplicateContext = await newContext(390), duplicate = await duplicateContext.newPage();
  await duplicate.goto(runtime.origin + '/claim');
  await duplicate.getByLabel('Setup token').fill(bindings.SETUP_TOKEN);
  await duplicate.getByLabel('Your name').fill('Duplicate attempt');
  await audit(duplicate, 'setup-duplicate', 390);
  const duplicateRequest = duplicate.waitForResponse(response => response.url() === runtime.origin + '/auth/bootstrap' &&
    response.request().method() === 'POST');
  await duplicate.getByRole('button', {name: 'Create owner account', exact: true}).click();
  assert.equal((await duplicateRequest).status(), 409, 'a second first-owner bootstrap is refused');
  assert.equal((await duplicateContext.request.get(runtime.origin + '/api/overview')).status(), 401,
    'duplicate bootstrap does not create an owner session');
  await duplicateContext.close();

  await signOutThroughUI(setupContext, setup);
  await setupContext.close();

  const loginContext = await newContext(1440), login = await loginContext.newPage();
  assert.equal((await loginContext.request.get(runtime.origin + '/api/overview')).status(), 401,
    'fresh browser context starts without private access');
  await login.goto(runtime.origin + '/login');
  await login.getByLabel('Email address').fill(bindings.OWNER_EMAIL);
  await auditBoth(login, 'sign-in');
  const magicRequest = login.waitForResponse(response => response.url() === runtime.origin + '/auth/magic-link' &&
    response.request().method() === 'POST');
  await login.getByRole('button', {name: 'Send sign-in link', exact: true}).click();
  const sent = await magicRequest;
  assert.equal(sent.status(), 303, 'Base redirects the browser to its acknowledgement');
  const acknowledgement = new URL(sent.headers().location, runtime.origin);
  assert.equal(acknowledgement.origin, runtime.origin);
  assert.equal(acknowledgement.pathname, '/login');
  assert.equal(acknowledgement.searchParams.get('notice'), 'sent');
  await login.waitForURL(acknowledgement.href);
  await login.getByRole('status').waitFor();
  await auditBoth(login, 'sent');

  const captured = await db.prepare('SELECT COUNT(*) AS count FROM rer_mail_development_outbox').first();
  assert.equal(captured.count, 1, 'the actual Base D1 development outbox stores the message');
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM oa_tokens WHERE consumed_at IS NULL AND revoked_at IS NULL').first()).count,
    1, 'the outbox message contains one live Base sign-in token');
  assert.equal(externalMailCalls, 0, 'local sign-in never calls an external email service');

  await openGate(loginContext, runtime.origin);
  await login.getByRole('link', {name: 'Open development outbox', exact: true}).click();
  assert.equal(new URL(login.url()).pathname, '/__dev/outbox', 'browser opens the emitted Worker development outbox');
  await auditBoth(login, 'outbox-list');
  await openOutboxMessage(login, runtime.origin, {email: bindings.OWNER_EMAIL, key: bindings.RER_DEV_KEY});
  await auditBoth(login, 'outbox-message');
  const actualLink = new URL(await login.getByRole('link', {name: 'Open this link', exact: true}).getAttribute('href'));
  assert.ok(actualLink.origin === runtime.origin && actualLink.pathname === '/auth/confirm' &&
    actualLink.searchParams.has('token'), 'outbox page exposes the actual loopback Base confirmation link');
  await login.getByRole('link', {name: 'Open this link', exact: true}).click();
  await login.getByRole('heading', {name: /Confirm sign-in to/}).waitFor();
  assert.equal(new URL(login.url()).pathname, '/auth/confirm', 'the outbox link opens Base confirmation in the browser');
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM oa_tokens WHERE consumed_at IS NULL AND revoked_at IS NULL').first()).count,
    1, 'previewing the link does not consume it');
  await auditBoth(login, 'confirmation');
  const confirmRequest = login.waitForResponse(response => response.url() === runtime.origin + '/auth/confirm' &&
    response.request().method() === 'POST');
  await login.getByRole('button', {name: 'Confirm', exact: true}).click();
  assert.equal((await confirmRequest).status(), 303, 'browser confirmation consumes the actual outbox link');
  await login.waitForURL(runtime.origin + '/app');
  await login.locator('.signed-in').waitFor();
  await auditBoth(login, 'signed-in-magic-link');
  const session = await loginContext.request.get(runtime.origin + '/auth/session');
  assert.equal(session.status(), 200, 'Base establishes a browser session');
  assert.equal((await session.json()).operator.role, 'owner', 'magic-link session has owner authority');
  assert.equal((await loginContext.request.get(runtime.origin + '/api/overview')).status(), 200,
    'magic-link sign-in grants private API access');
  await signOutThroughUI(loginContext, login);
  await loginContext.close();

  assert.deepEqual(runtime.requests.filter(request => ['/auth/bootstrap', '/auth/magic-link', '/auth/confirm', '/api/auth/sign-out'].includes(request.path))
    .map(request => ({path: request.path, method: request.method, host: request.host, origin: request.origin})),
    [
      {path: '/auth/bootstrap', method: 'POST', host: new URL(runtime.origin).host, origin: runtime.origin},
      {path: '/auth/bootstrap', method: 'POST', host: new URL(runtime.origin).host, origin: runtime.origin},
      {path: '/api/auth/sign-out', method: 'POST', host: new URL(runtime.origin).host, origin: runtime.origin},
      {path: '/auth/magic-link', method: 'POST', host: new URL(runtime.origin).host, origin: runtime.origin},
      {path: '/auth/confirm', method: 'GET', host: new URL(runtime.origin).host, origin: undefined},
      {path: '/auth/confirm', method: 'POST', host: new URL(runtime.origin).host, origin: runtime.origin},
      {path: '/api/auth/sign-out', method: 'POST', host: new URL(runtime.origin).host, origin: runtime.origin},
    ], 'browser sends native Host and Origin values to the emitted Worker');
  assert.deepEqual(errors, [], 'browser flow has no page errors');
  assert.deepEqual(runtime.errors, [], 'loopback bridge has no request errors');
  assert.deepEqual([...externalOrigins], [], 'browser flow makes no external network request');
  assert.equal(externalMailCalls, 0, 'browser sign-in sends no external email');
  const consoleEventsByType = Object.fromEntries([...consoleTypes].sort(([left], [right]) => left.localeCompare(right)));
  const consoleEventCount = Object.values(consoleEventsByType).reduce((total, count) => total + count, 0);
  await writeFile(join(evidence, 'RESULTS.json'), JSON.stringify({
    source: 'emitted dist/server Worker and dist/client assets', origin: 'exact ephemeral IPv4 loopback',
    localReview: true, mailProvider: 'development', externalNetwork: false, externalEmailCalls: externalMailCalls,
    checks: audits, pageErrors: errors.length,
    browserConsole: {
      policy: 'Retain numeric counts by console type only; expected resource errors from deliberately rejected private or bootstrap requests are reported, not failed by a blanket zero-console-error rule. Page errors must remain zero. Message text, source locations, and URLs are not retained.',
      total: consoleEventCount,
      assertionEvents: consoleEventsByType.assert ?? 0,
      byType: consoleEventsByType,
    },
  }, null, 2), {mode: 0o600});
  console.log(`OWNER-OUTBOX-BROWSER passed: emitted Worker first-owner and Base development-outbox browser journey, 1440/390 accessibility and reflow evidence at ${evidence}; pageErrors=${errors.length}; consoleEvents=${consoleEventCount}; consoleTypes=${JSON.stringify(consoleEventsByType)}`);
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      await runtime?.close();
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  }
}
