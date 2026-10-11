import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { commandAdapter } from '../scripts/installer/local.mjs';
import { loadInstallerSeed } from '../scripts/base-onboarding/setup-manifest.mjs';
import { cp } from 'node:fs/promises';
import { createCommands } from '../scripts/base-onboarding/commands.mjs';
import { prepareSettings } from '../scripts/base-onboarding/adapter-settings.mjs';
import { generatedNames, readLocalSettings, settingsDefinition } from '../scripts/local-settings.mjs';
import { authRoute, developmentMail, operatorSession } from '../src/domain/operator-auth.server.ts';
import { createD1DevelopmentOutbox } from '../src/base/modules/mail/src/development/index.mjs';
import { createDestination } from '../src/domain/notification-destinations.server.ts';
import { testDestination, notificationOverview } from '../src/domain/notifications.server.ts';
import { dispatchNotificationMail } from '../src/domain/notification-mail.server.ts';
import { notificationTestDB } from './notify-unit-database.mjs';
import { sessionCookie } from './auth-test-support.mjs';

const sender = 'selected-sender@example.test';
const selected = () => ({ MAIL_PROVIDER: 'sendgrid', MAIL_FROM: sender, SENDGRID_API_KEY: randomBytes(32).toString('base64url') });
const draftFor = changes => ({ displayName: 'Local owner', OWNER_EMAIL: 'local-owner@example.test', ...changes });
async function installation(t) {
 const temporary = resolve('../tmp'); await mkdir(temporary, { recursive: true });
 const root = await mkdtemp(join(temporary, 'local-mail-settings-'));
 await cp('scripts/installer/ui', join(root, 'scripts/installer/ui'), { recursive: true });
 await cp('src/branding.json', join(root, 'src/branding.json'));
 await cp('rer-setup.json', join(root, 'rer-setup.json'));
 const seed = await loadInstallerSeed(root, commandAdapter);
 await mkdir(join(root, 'capture'), { mode: 0o700 });
 const store = await createCommands(join(root, 'capture'), { logs: [] }, { terminal: () => {} });
 store.setupManifest = seed.manifest;
 store.step = async label => store.report(label);
 t.after(async () => { await store.closeCommands(); await rm(root, { recursive: true, force: true }); });
 return { root, async prepare(draft) {
  const input = seed.model.validateInput(draft);
  const context = { root, input, store, manifest: seed.manifest, origin: 'http://127.0.0.1:8787' };
  await prepareSettings(context, { secrets: settingsDefinition() });
  const first = await readFile(join(root, 'data/local-secrets.json'));
  await prepareSettings(context, { secrets: settingsDefinition() });
  assert.ok((await readFile(join(root, 'data/local-secrets.json'))).equals(first));
  assert.equal((await stat(join(root, 'data/local-secrets.json'))).mode & 0o777, 0o600);
  return context.vars;
 } };
}
test('saved local SendGrid inputs keep actual sign-in in the outbox and configure notification mail', async t => {
 const originalFetch = globalThis.fetch;
 let requests = 0;
 // A provider request during preparation or sign-in is a test failure.
 globalThis.fetch = async () => { requests++; throw Error('Unexpected provider request during local setup or sign-in'); };
 t.after(() => { globalThis.fetch = originalFetch; });
 const local = await installation(t), saved = await local.prepare(draftFor(selected()));
 const DB = notificationTestDB(), env = { ...saved, MAIL_PROVIDER: 'development', DB, UPTIME_LOCAL_REVIEW: 'true' };
 t.after(() => DB.close());
 const request = (path, body, cookie) => new Request(saved.UPTIME_ORIGIN + path, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { host: new URL(saved.UPTIME_ORIGIN).host, origin: saved.UPTIME_ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
 });
 assert.equal(developmentMail(env), true);
 sessionCookie(await authRoute(env, request('/auth/bootstrap', { token: saved.SETUP_TOKEN, displayName: 'Local owner' })));
 const outbox = createD1DevelopmentOutbox({ db: DB });
 assert.equal((await outbox.list()).length, 0);
 assert.equal((await authRoute(env, request('/auth/magic-link', { email: saved.OWNER_EMAIL, returnTo: '/' }))).status, 202);
 const messages = await outbox.list();
 assert.equal(messages.length, 1, 'ordinary sign-in stores a real development-outbox message');
 const link = messages[0].message.text.match(/http:\/\/127\.0\.0\.1:\d+\/auth\/confirm\?[^\s]+/);
 assert.ok(link, 'stored message contains the real confirmation link');
 const token = new URL(link[0]).searchParams.get('token');
 const cookie = sessionCookie(await authRoute(env, request('/auth/confirm', { token })));
 const session = await operatorSession(env, request('/', undefined, cookie));
 assert.equal(session?.operator.email, saved.OWNER_EMAIL);
 assert.equal(session?.operator.role, 'owner');
 assert.equal(requests, 0, 'settings preparation, local bootstrap and outbox sign-in contact no mail provider');

 // Exercise the actual notification queue and Base SendGrid serializer. Only
 // its final transport is replaced, so no network or real email can occur.
 globalThis.fetch = async (url, options) => {
  requests++;
  assert.equal(url, 'https://api.sendgrid.com/v3/mail/send');
  assert.ok(new Headers(options.headers).get('authorization') === `Bearer ${saved.SENDGRID_API_KEY}`, 'notification uses the persisted key');
  const body = JSON.parse(options.body);
  assert.equal(body.from.email, saved.MAIL_FROM);
  assert.equal(body.personalizations[0].to[0].email, 'recipient@example.test');
  return new Response(null, { status: 202 });
 };
 const destination = await createDestination(env, { kind: 'email', name: 'Local email', address: 'recipient@example.test' });
 const delivery = await testDestination(env, destination.id);
 await dispatchNotificationMail({...env,MAIL_PROVIDER:saved.MAIL_PROVIDER});
 assert.equal(requests, 1);
 const result = (await notificationOverview(env)).deliveries.find(item => item.id === delivery.deliveryId);
 assert.equal(result?.state, 'accepted');
 assert.equal(result?.attempts, 1);
 assert.equal((await outbox.list()).length, 1, 'notification dispatch did not add a sign-in message');
});
