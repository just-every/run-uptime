import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {hostedBrowserRuntime} from './hosted-browser-runtime.mjs';
import {splitSql} from './migration-support.mjs';

const directory = await mkdtemp(join(tmpdir(), 'uptime-hosted-browser-'));
const mails = [];
const bindings = {UPTIME_LOCAL_REVIEW: 'false', OWNER_EMAIL: 'owner@example.test',
  SESSION_SECRET: 'test-only-native-session-secret-00001', SETUP_TOKEN: 'test-only-onetime-setup-credential-00001',
  MAIL_FROM: 'Uptime <auth@example.test>', SENDGRID_API_KEY: 'test-only-provider-key'};
let runtime, browser;
try {
  runtime = await hostedBrowserRuntime(directory, bindings, async request => {
    assert.equal(request.url, 'https://api.sendgrid.com/v3/mail/send');
    mails.push(await request.json());
    return new Response(null, {status: 202});
  });
  const db = await runtime.worker.getD1Database('DB');
  for (const file of (await readdir('migrations')).filter(file => file.endsWith('.sql')).sort()) {
    for (const sql of splitSql(await readFile(join('migrations', file), 'utf8'))) await db.prepare(sql).run();
  }
  browser = await chromium.launch({headless: true});
  const errors = [];
  const newContext = async () => {
    // Trust only the disposable test server's self-signed certificate. The
    // browser still creates native HTTPS Origin headers and Secure cookies.
    const context = await browser.newContext({ignoreHTTPSErrors: true});
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    return context;
  };
  const nativePost = async (page, path, button) => {
    const response = page.waitForResponse(response => response.url() === runtime.origin + path && response.request().method() === 'POST');
    await page.getByRole('button', {name: button, exact: true}).click();
    const result = await response;
    const received = runtime.requests.filter(request => request.method === 'POST' && request.path === path).at(-1);
    assert.equal(received.origin, runtime.origin, `${path} must carry the browser's native HTTPS Origin`);
    assert.equal(received.referer, runtime.origin + '/', `${path} must omit the path and query from Referer`);
    return result;
  };
  const assertSession = async context => {
    const cookies = await context.cookies();
    const session = cookies.find(cookie => cookie.name === '__Host-operator_session');
    assert.ok(session, 'browser accepted the Base host-only session cookie');
    assert.equal(session.secure, true);
    assert.equal(session.httpOnly, true);
    assert.equal(session.path, '/');
    const result = await context.request.get(runtime.origin + '/auth/session');
    assert.equal(result.status(), 200);
    assert.equal((await result.json()).operator.role, 'owner');
    assert.equal((await context.request.get(runtime.origin + '/api/overview')).status(), 200);
  };
  const bootstrap = await newContext(), setup = await bootstrap.newPage();
  await setup.goto(runtime.origin + '/claim');
  await setup.getByLabel('Setup token').fill(bindings.SETUP_TOKEN);
  await setup.getByLabel('Your name').fill('Native browser owner');
  const bootstrapResponse = await nativePost(setup, '/auth/bootstrap', 'Create owner account');
  assert.equal(bootstrapResponse.status(), 303, bootstrapResponse.status() === 303 ? undefined : await bootstrapResponse.text());
  await setup.waitForURL(runtime.origin + '/setup');
  await setup.getByRole('button', {name: 'Finish setup', exact: true}).click();
  await setup.waitForURL(runtime.origin + '/app');
  await assertSession(bootstrap);
  await bootstrap.close();

  const loginContext = await newContext(), login = await loginContext.newPage();
  assert.equal((await loginContext.request.get(runtime.origin + '/api/overview')).status(), 401);
  await login.goto(runtime.origin + '/login');
  await login.getByLabel('Email address').fill(bindings.OWNER_EMAIL);
  const sent = await nativePost(login, '/auth/magic-link', 'Send sign-in link');
  assert.equal(sent.status(), 200);
  assert.match(sent.headers()['content-type'], /text\/html/);
  await login.getByRole('heading', {name: 'Check your email', exact: true}).waitFor();
  assert.equal(mails.length, 1);
  const link = new URL(mails[0].content.find(content => content.type === 'text/plain').value.match(/https:\/\/[^\s]+/)[0]);
  assert.equal(link.origin, runtime.origin);
  await login.goto(link.href);
  assert.equal((await db.prepare('SELECT consumed_at FROM oa_tokens').first()).consumed_at, null);
  assert.equal((await nativePost(login, '/auth/confirm', 'Confirm')).status(), 303);
  await login.waitForURL(runtime.origin + '/app');
  await assertSession(loginContext);
  assert.ok((await db.prepare('SELECT consumed_at FROM oa_tokens').first()).consumed_at);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(errors, []);
  await loginContext.close();
  console.log('HOSTED-AUTH-BROWSER passed native HTTPS bootstrap, fresh-context magic link and confirmation; actual Origin, origin-only Referer and Secure Base owner session verified; outbound mail captured only in test');
} finally {
  await browser?.close();
  await runtime?.close();
  await rm(directory, {recursive: true, force: true});
}
