import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { readDeployEnvFile } from '@runeditrun/rer/internal/modules/deploy-kit/env-file.mjs';
import { providerBridge } from './owner-deploy-lifecycle/bridge.mjs';
import { checkout, deploy, git } from './owner-deploy-lifecycle/commands.mjs';

const state = async root => JSON.parse(await readFile(join(root, '.rer/deploy/production.json')));
const migrationRows = provider => provider.state.databases[0].db.prepare('SELECT name, sha256, state FROM d1_migrations ORDER BY name').all().map(row => ({ ...row }));

test('real rer deploy covers fresh custody, automatic legacy upgrade, conflicts, named keys, exact repeat, resume and foreign ownership refusal', { timeout: 20 * 60_000 }, async t => {
  const root = await checkout(t), provider = await providerBridge(t);
  assert.equal(provider.state.databases.length, 0);
  assert.equal(provider.uploads.length, 0);
  provider.delayCreatedDatabaseListing();
  const first = await deploy(root, provider, t.signal);
  assert.equal(first.code, 0, JSON.stringify(first));
  assert.equal(first.result?.ok, true);
  assert.equal(first.result.deployed, true);
  assert.equal(first.result.origin, 'https://uptime-monitor-production.fixture-account.workers.dev');
  await assert.rejects(stat(join(root, '.rer/deploy/production-secrets.json')), { code: 'ENOENT' });
  await assert.rejects(stat(join(root, '.rer/deploy/environments')), { code: 'ENOENT' });
  const receipt = await state(root);
  assert.equal(receipt.owned.worker.status, 'created');
  assert.equal(receipt.owned.d1['uptime-monitor-production-db'].status, 'created');
  assert.ok(receipt.receipt, 'successful provision persists deployment identity');
  assert.equal(provider.state.databases.length, 1);
  assert.ok(provider.state.omittedDatabaseListings > 0, 'the newly created D1 was absent from an inconsistent account listing');
  assert.ok(provider.state.settledDatabaseListings > 0, 'the same first deploy read a settled listing before proceeding');
  assert.equal(provider.state.writes.filter(row => row.path === '/d1/database').length, 1, 'eventual listing never creates another D1');
  assert.equal(provider.uploads.length, 1);
  assert.ok(provider.healthRequests > 0, 'successful deployment verifies the served deployment identity');
  assert.ok(provider.state.assetRequests.length > 0, 'the package verifies an uploaded static asset');
  assert.deepEqual(provider.state.schedules, [{ cron: '* * * * *' }]);
  const uploaded = provider.state.secrets.find(item => item.name === 'SENDGRID_API_KEY');
  assert.equal(uploaded?.value, 'test-only-sendgrid-key', 'MAIL_API_KEY reaches the Worker as the key its selected provider reads');
  assert.ok(!provider.state.secrets.some(item => item.name === 'MAIL_API_KEY'), 'the shared name is a deploy input, not a second Worker secret');
  const migrations = migrationRows(provider);
  assert.ok(migrations.length > 0, 'the real controller records applied migrations');
  assert.ok(migrations.every(row => row.state === 'applied'));
  const writes = provider.state.writes.length;
  const receiptBytes = await readFile(join(root, '.rer/deploy/production.json'));
  // Recreate a 0.3.0 checkout after a successful hosted deploy. The only
  // retained inputs are the two legacy JSON files, never fresh shell answers.
  const production = await readDeployEnvFile(root, '.rer/deploy/production.secrets.env');
  const named = { SESSION_SECRET: randomBytes(32).toString('hex'), SETUP_TOKEN: randomBytes(32).toString('hex'), UPTIME_RUNNER_KEY: randomBytes(32).toString('hex'), CUSTOM_ENV_SETTING: '"literal # and = content"' };
  const legacyProduction = join(root, '.rer/deploy/production-secrets.json');
  const legacyNamed = join(root, '.rer/deploy/environments/staging/secrets.json');
  await mkdir(join(root, '.rer/deploy/environments/staging'), { recursive: true, mode: 0o700 });
  const productionBytes = JSON.stringify(production), namedBytes = JSON.stringify(named);
  await writeFile(legacyProduction, productionBytes, { mode: 0o600 });
  await writeFile(legacyNamed, namedBytes, { mode: 0o600 });
  await rm(join(root, '.rer/deploy/production.secrets.env'));
  await rm(join(root, '.rer/deploy/.legacy-secrets-migrated'));
  const conflictBytes = 'OWNER_EMAIL=different@example.test\n';
  await writeFile(join(root, '.rer/deploy/production.secrets.env'), conflictBytes, { mode: 0o600 });
  const conflict = await deploy(root, provider, t.signal, [], { inputs: false });
  assert.equal(conflict.code, 4);
  assert.ok(conflict.messages.some(message => /conflict.*production\.secrets\.env.*OWNER_EMAIL/.test(message)), 'conflict names the kept file and key plainly');
  assert.ok(conflict.messages.every(message => !Object.values(production).some(value => message.includes(value))), 'conflict never prints saved values');
  assert.ok((await readFile(legacyProduction, 'utf8')) === productionBytes, 'conflict keeps legacy production bytes');
  assert.ok((await readFile(legacyNamed, 'utf8')) === namedBytes, 'conflict keeps every legacy environment');
  assert.ok((await readFile(join(root, '.rer/deploy/production.secrets.env'), 'utf8')) === conflictBytes, 'conflict never overwrites rer custody');
  assert.equal(provider.state.writes.length, writes, 'conflict makes no provider writes');
  await rm(join(root, '.rer/deploy/production.secrets.env'));
  const repeated = await deploy(root, provider, t.signal, [], { inputs: false });
  assert.equal(repeated.code, 0, JSON.stringify({code:repeated.code,errorCodes:repeated.errorCodes}));
  assert.equal(repeated.result?.ok, true);
  assert.equal(repeated.result.deployed, true);
  assert.equal(provider.state.writes.length, writes, 'upgrade repeat performs zero provider writes: ' + JSON.stringify(provider.state.writes.slice(writes).map(({method,path}) => ({method,path}))));
  assert.deepEqual(await readFile(join(root, '.rer/deploy/production.json')), receiptBytes);
  const migrated = await readDeployEnvFile(root, '.rer/deploy/production.secrets.env');
  assert.ok(Object.entries(production).every(([name, value]) => migrated[name] === value), 'upgrade keeps every production key and owner/mail input');
  const staging = await readDeployEnvFile(root, '.rer/deploy/staging.secrets.env');
  assert.ok(Object.entries({ ...production, ...named }).every(([name, value]) => staging[name] === value), 'upgrade keeps every named key and shared owner/mail input');
  for (const path of [legacyProduction, legacyNamed]) await assert.rejects(stat(path), { code: 'ENOENT' });
  const keptBytes = await readFile(join(root, '.rer/deploy/production.secrets.env'));
  await writeFile(legacyProduction, 'old JSON is no longer an input', { mode: 0o600 });
  const afterMove = await deploy(root, provider, t.signal, [], { inputs: false });
  assert.equal(afterMove.code, 0);
  assert.ok((await readFile(legacyProduction, 'utf8')) === 'old JSON is no longer an input', 'completed handoff stops reading old JSON even if a backup is restored');
  await rm(legacyProduction);
  assert.ok((await readFile(join(root, '.rer/deploy/production.secrets.env'))).equals(keptBytes), 'rer-only repeat preserves secret bytes');
  assert.equal(provider.state.writes.length, writes, 'rer-only repeat performs zero provider writes');
  for (const path of [legacyProduction, legacyNamed]) await assert.rejects(stat(path), { code: 'ENOENT' });
  assert.deepEqual(migrationRows(provider), migrations);
  const namedProvider = await providerBridge(t, 'staging');
  const namedDeploy = await deploy(root, namedProvider, t.signal, ['--environment', 'staging'], { inputs: false });
  assert.equal(namedDeploy.code, 0, JSON.stringify({code:namedDeploy.code,errorCodes:namedDeploy.errorCodes}));
  assert.ok(Object.entries(named).filter(([name]) => name !== 'CUSTOM_ENV_SETTING' && name !== 'SETUP_TOKEN').every(([name, value]) => namedProvider.state.secrets.find(item => item.name === name)?.value === value), 'named deploy uses its original environment authority');
  assert.ok((await readDeployEnvFile(root, '.rer/deploy/staging.secrets.env')).CUSTOM_ENV_SETTING === named.CUSTOM_ENV_SETTING, 'undeclared per-environment inputs survive the real command');

  const interruptedRoot = await checkout(t), partialProvider = await providerBridge(t);
  partialProvider.interruptBeforeSecondMigration();
  const interrupted = await deploy(interruptedRoot, partialProvider, t.signal);
  assert.equal(interrupted.code, 1);
  assert.equal(partialProvider.interruptedMigration, true);
  const partial = await state(interruptedRoot);
  assert.equal(partial.owned.d1['uptime-monitor-production-db'].status, 'created');
  assert.equal(partial.owned.worker.status, 'pending');
  assert.equal(partial.receipt, null);
  assert.equal(partialProvider.uploads.length, 0);
  const firstMigration = migrationRows(partialProvider);
  assert.equal(firstMigration.length, 1);
  assert.equal(firstMigration[0].state, 'applied');
  const partialSecrets = await readFile(join(interruptedRoot, '.rer/deploy/production.secrets.env'));
  const resumed = await deploy(interruptedRoot, partialProvider, t.signal);
  assert.equal(resumed.code, 0, JSON.stringify(resumed));
  assert.equal(resumed.result?.ok, true);
  assert.equal(resumed.result.deployed, true);
  assert.equal(partialProvider.state.databases.length, 1);
  assert.equal(partialProvider.state.writes.filter(row => row.path === '/d1/database').length, 1);
  const finalMigrations = migrationRows(partialProvider);
  assert.deepEqual(finalMigrations, migrations);
  assert.deepEqual(finalMigrations[0], firstMigration[0]);
  for (const migration of finalMigrations) {
    assert.equal(partialProvider.state.writes.filter(row => row.body?.sql?.startsWith('INSERT INTO d1_migrations') && row.body.sql.includes(migration.name)).length, 1, 'each migration is claimed once');
  }
  assert.equal(partialProvider.uploads.length, 1);
  assert.ok((await state(interruptedRoot)).receipt);
  assert.ok((await readFile(join(interruptedRoot, '.rer/deploy/production.secrets.env'))).equals(partialSecrets), 'resume preserves secret bytes');
  assert.ok(partialProvider.healthRequests > 0, 'resumed deployment verifies the served deployment identity');
  // Removing only our isolated local ownership proof makes the same provider
  // resource foreign; no controller may adopt it based on its name.
  await rm(join(root, '.rer/deploy/production.json'));
  const collision = await deploy(root, provider, t.signal);
  assert.equal(collision.code, 1);
  assert.equal(collision.result?.ok, false);
  assert.deepEqual(collision.errorCodes, ['owner_deploy_failed']);
  assert.equal(provider.state.writes.length, writes, 'foreign collision refuses before any mutation');
  assert.deepEqual(migrationRows(provider), migrations);
  assert.equal(provider.uploads.length, 1, 'repeat and foreign collision never upload another worker');
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '');
  await writeFile(join(root, '.rer/deploy/production.json'), receiptBytes, { mode: 0o600 });
  const uploadsBeforeRemoval = provider.uploads.length;
  const removed = await deploy(root, provider, t.signal, ['--remove', '--yes']);
  assert.deepEqual({
    code: removed.code, ok: removed.result?.ok, deployed: removed.result?.deployed,
    removed: removed.result?.removed?.toSorted(), worker: provider.state.settings,
    databases: provider.state.databases.length, uploads: provider.uploads.length,
  }, {
    code: 0, ok: true, deployed: false,
    removed: ['d1:uptime-monitor-production-db', 'worker:uptime-monitor-production'],
    worker: null, databases: 0, uploads: uploadsBeforeRemoval,
  }, 'remove uses shared removal without uploading a deployment');
});
