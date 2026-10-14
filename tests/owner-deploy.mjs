import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, cp, rm, stat, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerPlan, ownerTarget } from '@runeditrun/rer/modules/deploy-kit/owner';
import { cloudflare } from '@runeditrun/rer/modules/deploy-kit/provider';
import { packageBuild } from '@runeditrun/rer/modules/deploy-kit/prepare';
import { ownerSecrets, secretsFile, secretNames } from '../scripts/deployment/owner-settings.mjs';
import { prepareOwnerBuild, ownerProduct } from '../scripts/deployment/owner-prepare.mjs';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const declaration = JSON.parse(await readFile(join(project, 'deploy.json')));
const account = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-cloudflare-token' };
const supplied = { OWNER_EMAIL: 'owner@example.test', MAIL_FROM: 'sender@example.test', SENDGRID_API_KEY: 'test-only-sendgrid-key' };
const source = { sha: '1'.repeat(40), tree: '2'.repeat(40) };
const origin = 'https://uptime-monitor-production.fixture-account.workers.dev';
async function directory(t) {
  const temporary = resolve(project, '..', 'tmp');
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'owner-deploy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const store = () => ({ registered: [], steps: [], addSecrets(values) { this.registered.push(...values); }, async step(text) { this.steps.push(text); } });
async function fixtureBuild(root) {
  for (const path of ['dist/server', 'dist/client']) await mkdir(join(root, path), { recursive: true });
  await writeFile(join(root, 'dist/server/wrangler.json'), JSON.stringify({ main: 'index.js', no_bundle: true, rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }] }));
  await writeFile(join(root, 'dist/server/index.js'), 'export default {fetch(){return new Response("test-only fixture")}};');
  await writeFile(join(root, 'dist/client/index.html'), '<h1>Test fixture</h1>');
  await cp(join(project, 'migrations'), join(root, 'migrations'), { recursive: true });
}

test('real owner declaration packages every product migration and derives its account resources', async t => {
  const root = await directory(t);
  await fixtureBuild(root);
  await prepareOwnerBuild(root);
  const artifact = await packageBuild({ root, source, runIdentity: { id: '0', attempt: '1' }, productDirectory: ownerProduct });
  const calls = [];
  const api = cloudflare({ accountId: account.CLOUDFLARE_ACCOUNT_ID, token: account.CLOUDFLARE_API_TOKEN, fetch: async (url, options) => {
    calls.push(url);
    assert.equal(new URL(url).pathname, `/client/v4/accounts/${account.CLOUDFLARE_ACCOUNT_ID}/workers/subdomain`);
    assert.equal(options.headers.Authorization, `Bearer ${account.CLOUDFLARE_API_TOKEN}`);
    return Response.json({ success: true, errors: [], result: { subdomain: 'fixture-account' } });
  } });
  const target = await ownerTarget(api, { project: declaration.project, environment: 'production' });
  const plan = ownerPlan(target, declaration, artifact);
  assert.equal(calls.length, 1);
  assert.equal(plan.worker, 'uptime-monitor-production');
  assert.equal(plan.d1[0].binding, 'DB');
  assert.equal(plan.d1[0].name, 'uptime-monitor-production-db');
  assert.deepEqual(plan.vars, { UPTIME_ORIGIN: origin });
  assert.deepEqual(plan.crons, ['* * * * *']);
  assert.deepEqual(plan.secrets, secretNames.map(binding => ({ binding, environment: binding })));
  assert.deepEqual(artifact.migrations.map(item => item.name), (await readdir(join(project, 'migrations'))).sort());
  for (const migration of artifact.migrations) assert.equal(migration.sql, await readFile(join(project, 'migrations', migration.name), 'utf8'));
});

test('hosted secrets are private, self-ignored, generated once, registered, and byte-identical on resume', async t => {
  const root = await directory(t), output = store();
  const first = await ownerSecrets(root, { env: supplied, store: output });
  const before = await readFile(join(root, secretsFile));
  assert.equal((await stat(join(root, secretsFile))).mode & 0o777, 0o600);
  for (const name of ['SESSION_SECRET', 'SETUP_TOKEN', 'UPTIME_RUNNER_KEY']) assert.match(first[name], /^[a-f0-9]{64}$/);
  assert.equal(new Set(Object.values(first)).size, secretNames.length);
  for (const value of Object.values(first)) assert.ok(output.registered.includes(value));
  assert.deepEqual(await ownerSecrets(root, { env: { ...supplied, SESSION_SECRET: 'replacement'.repeat(4), OWNER_EMAIL: 'different@example.test' }, store: output }), first);
  assert.deepEqual(await readFile(join(root, secretsFile)), before);
  execFileSync('git', ['init', '-q'], { cwd: root });
  assert.equal(execFileSync('git', ['check-ignore', secretsFile], { cwd: root, encoding: 'utf8' }).trim(), secretsFile);
});

test('invalid saved secret files and symlinks are preserved and refused', async t => {
  const root = await directory(t);
  await ownerSecrets(root, { env: supplied });
  const path = join(root, secretsFile), invalid = JSON.stringify({ SESSION_SECRET: 'broken' });
  await writeFile(path, invalid);
  await assert.rejects(ownerSecrets(root, { env: supplied }), /missing-input/);
  assert.equal(await readFile(path, 'utf8'), invalid);
  const target = join(root, 'keep.json');
  await writeFile(target, 'do not replace');
  await rm(path); await symlink(target, path);
  await assert.rejects(ownerSecrets(root, { env: supplied }));
  assert.equal(await readFile(target, 'utf8'), 'do not replace');
});
