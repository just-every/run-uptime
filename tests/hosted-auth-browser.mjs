import {completeBrowserSecondFactor} from './mfa-auth-support.mjs';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {testAuthBindings} from './auth-test-support.mjs';
import {hostedBrowserRuntime} from './hosted-browser-runtime.mjs';
import {splitSql} from './migration-support.mjs';

const mails = [];
const {surfaces: {app: {signIn}}} = JSON.parse(await readFile('management/integration/deployment-spec.json', 'utf8'));
assert.equal(signIn.loginHint, true, 'Open app can carry the owner email');
const directory = await mkdtemp(join(tmpdir(), 'uptime-hosted-browser-'));
const bindings = {...testAuthBindings, MAIL_PROVIDER: 'sendgrid', UPTIME_LOCAL_REVIEW: 'false', OWNER_EMAIL: 'maya@northstar.example',
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
  browser = await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
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
  await completeBrowserSecondFactor(setup,runtime.origin);
  await setup.goto(runtime.origin+'/setup');
  await setup.waitForURL(runtime.origin + '/setup');
  await setup.getByRole('button', {name: 'Continue', exact: true}).click();
  await setup.waitForURL(url => url.pathname.startsWith('/app'));
  await assertSession(bootstrap);
  await bootstrap.close();

  const loginContext = await newContext(), login = await loginContext.newPage();
  assert.equal((await loginContext.request.get(runtime.origin + '/api/overview')).status(), 401);
  for (const width of [1440, 390]) {
    await login.setViewportSize({width, height: 900});
    for (const path of [signIn.path, '/signin']) {
      for (const hint of ['', 'not-an-email', '"><script>alert(1)</script>@example.test']) {
        await login.goto(runtime.origin + path + (hint ? '?login_hint=' + encodeURIComponent(hint) : ''));
        assert.equal(await login.getByRole('textbox', {name: /^Email/}).inputValue(), '', 'only a complete explicit hint prefills');
      }
    }
    await login.goto(runtime.origin + signIn.path + '?login_hint=' + encodeURIComponent(bindings.OWNER_EMAIL));
    assert.equal(await login.getByLabel('Email address', {exact: true}).inputValue(), bindings.OWNER_EMAIL);
    await login.evaluate(() => document.fonts.ready);
    assert.equal(await login.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(mails.filter(m=>m.subject.startsWith('Your sign-in link')).length, 0, 'opening Open app never sends mail');
    assert.equal((await db.prepare('SELECT count(*) n FROM oa_tokens').first()).n, 0);
    if (process.env.UPTIME_AUTH_SHOTS) {
      await mkdir(process.env.UPTIME_AUTH_SHOTS, {recursive: true});
      await login.screenshot({path: join(process.env.UPTIME_AUTH_SHOTS, `login-hint-${width}.png`), fullPage: true});
    }
  }
  const sent = await nativePost(login, '/auth/magic-link', 'Send sign-in link');
  assert.equal(sent.status(), 303, 'native form redirects to its acknowledgement');
  const acknowledgement = new URL(sent.headers().location, runtime.origin);
  assert.equal(acknowledgement.origin, runtime.origin);
  assert.equal(acknowledgement.pathname, '/login');
  assert.equal(acknowledgement.searchParams.get('notice'), 'sent');
  await login.waitForURL(acknowledgement.href);
  await login.getByRole('status').waitFor();
  assert.equal(mails.filter(m=>m.subject.startsWith('Your sign-in link')).length, 1);
  const link = new URL(mails.find(m=>m.subject.startsWith('Your sign-in link')).content.find(content => content.type === 'text/plain').value.match(/https:\/\/[^\s]+/)[0]);
  assert.equal(link.origin, runtime.origin);
  await login.goto(link.href);
  assert.equal((await db.prepare('SELECT consumed_at FROM oa_tokens').first()).consumed_at, null);
  assert.equal((await nativePost(login, '/auth/confirm', 'Confirm')).status(), 303);
  await completeBrowserSecondFactor(login,runtime.origin);await login.goto(runtime.origin+'/app');
  await login.waitForURL(runtime.origin + '/app/monitors');
  await assertSession(loginContext);
  assert.ok((await db.prepare('SELECT consumed_at FROM oa_tokens').first()).consumed_at);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(errors, []);
  await loginContext.close();
  console.log('HOSTED-AUTH-BROWSER passed native HTTPS bootstrap, Open app login_hint prefill at 1440/390 without auto-submit, fresh-context magic link and confirmation; actual Origin, origin-only Referer and Secure Base owner session verified; outbound mail captured only in test');
} finally {
  await browser?.close();
  await runtime?.close();
  await rm(directory, {recursive: true, force: true});
}
