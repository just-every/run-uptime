import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, readFile, readdir, rm, symlink, realpath, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { providerBridge } from './owner-deploy-lifecycle/bridge.mjs';

const project = resolve(import.meta.dirname, '..');
// Resolve the installed, package-pinned pnpm before moving into the isolated
// HOME. pnpm's own exec PATH identifies its real binary, without a test stub.
const commandPath = execFileSync('pnpm', ['exec', process.execPath, '-p', 'process.env.PATH'], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// Keep the already-prepared tool cache when isolating HOME. Otherwise Corepack
// downloads pnpm inside the provider-only network preload before rer can start.
const toolEnvironment = Object.fromEntries(['COREPACK_HOME', 'COREPACK_DEFAULT_TO_LATEST', 'COREPACK_ENABLE_AUTO_PIN', 'COREPACK_ENABLE_DOWNLOAD_PROMPT', 'COREPACK_ENV_FILE']
  .filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function checkout(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'uptime-owner-lifecycle-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tracked = git(project, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  // Include the new harness while it is being reviewed before its first commit.
  const harness = ['tests/owner-deploy-lifecycle.mjs', ...(await readdir(join(project, 'tests/owner-deploy-lifecycle'))).map(name => `tests/owner-deploy-lifecycle/${name}`)];
  for (const path of new Set([...tracked, ...harness])) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await cp(join(project, path), join(root, path));
  }
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Uptime test', '-c', 'user.email=test@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Isolated owner deployment lifecycle');
  await symlink(join(project, 'node_modules'), join(root, 'node_modules'));
  await appendFile(join(root, '.git/info/exclude'), '\n/node_modules\n');
  return root;
}
async function deploy(root, provider, signal) {
  const env = { PATH: commandPath, HOME: root, CI: 'true', ...toolEnvironment, ...provider.env,
    NODE_OPTIONS: `--import=${pathToFileURL(join(root, 'tests/owner-deploy-lifecycle/preload.mjs')).href}`,
    CLOUDFLARE_ACCOUNT_ID: provider.accountId, CLOUDFLARE_API_TOKEN: provider.token,
    OWNER_EMAIL: 'owner@example.test', MAIL_FROM: 'sender@example.test', SENDGRID_API_KEY: 'test-only-sendgrid-key',
  };
  return new Promise((resolveResult, reject) => {
    const child = spawn('pnpm', ['run', 'deploy', '--', '--json'], { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already reaped. */ } };
    signal.addEventListener('abort', stop, { once: true });
    let output = '', errors = '';
    child.stdout.on('data', bytes => { output += bytes; });
    child.stderr.on('data', bytes => { errors += bytes; });
    child.on('error', reject);
    child.on('close', code => {
      signal.removeEventListener('abort', stop);
      const records = (output + '\n' + errors).split('\n').filter(line => line.startsWith('{')).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
      // Never expose raw child output: generated installation keys are private.
      resolveResult({ code, errorCodes: records.filter(value => value.event === 'error').map(value => value.code), result: records.findLast(value => value.event === 'result') ?? null });
    });
  });
}
const state = async root => JSON.parse(await readFile(join(root, '.rer/deploy/production.json')));
const migrationRows = provider => provider.state.databases[0].db.prepare('SELECT name, sha256, state FROM _rer_deploy_migrations ORDER BY name').all().map(row => ({ ...row }));

test('five real pnpm run deploy cycles cover provision, exact repeat, partial migration resume and foreign ownership refusal', { timeout: 20 * 60_000 }, async t => {
  const root = await checkout(t), provider = await providerBridge(t);
  const first = await deploy(root, provider, t.signal);
  assert.equal(first.code, 0, JSON.stringify(first));
  assert.equal(first.result?.ok, true);
  assert.equal(first.result.deployed, true);
  assert.equal(first.result.origin, 'https://uptime-monitor-production.fixture-account.workers.dev');
  const receipt = await state(root);
  assert.equal(receipt.owned.worker.status, 'created');
  assert.equal(receipt.owned.d1['uptime-monitor-production-db'].status, 'created');
  assert.ok(receipt.receipt, 'successful provision persists deployment identity');
  assert.equal(provider.state.databases.length, 1);
  assert.equal(provider.uploads.length, 1);
  assert.ok(provider.healthRequests > 0, 'successful deployment verifies the served deployment identity');
  assert.deepEqual(provider.state.schedules, [{ cron: '* * * * *' }]);
  const migrations = migrationRows(provider);
  assert.ok(migrations.length > 0, 'the real controller records applied migrations');
  assert.ok(migrations.every(row => row.state === 'applied'));
  const writes = provider.state.writes.length;
  const secrets = await readFile(join(root, '.rer/deploy/production-secrets.json'));
  const receiptBytes = await readFile(join(root, '.rer/deploy/production.json'));
  const repeated = await deploy(root, provider, t.signal);
  assert.equal(repeated.code, 0);
  assert.equal(repeated.result?.ok, true);
  assert.equal(repeated.result.deployed, true);
  assert.equal(provider.state.writes.length, writes, 'exact successful repeat performs zero provider writes');
  assert.deepEqual(await readFile(join(root, '.rer/deploy/production.json')), receiptBytes);
  assert.ok((await readFile(join(root, '.rer/deploy/production-secrets.json'))).equals(secrets), 'repeat preserves secret bytes');
  assert.deepEqual(migrationRows(provider), migrations);

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
  const partialSecrets = await readFile(join(interruptedRoot, '.rer/deploy/production-secrets.json'));
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
    assert.equal(partialProvider.state.writes.filter(row => row.body?.sql?.startsWith('INSERT INTO _rer_deploy_migrations') && row.body.sql.includes(migration.name)).length, 1, 'each migration is claimed once');
  }
  assert.equal(partialProvider.uploads.length, 1);
  assert.ok((await state(interruptedRoot)).receipt);
  assert.ok((await readFile(join(interruptedRoot, '.rer/deploy/production-secrets.json'))).equals(partialSecrets), 'resume preserves secret bytes');
  assert.ok(partialProvider.healthRequests > 0, 'resumed deployment verifies the served deployment identity');
  // Removing only our isolated local ownership proof makes the same provider
  // resource foreign; no controller may adopt it based on its name.
  await rm(join(root, '.rer/deploy/production.json'));
  const collision = await deploy(root, provider, t.signal);
  assert.equal(collision.code, 1);
  assert.equal(collision.result?.ok, false);
  assert.deepEqual(collision.errorCodes, ['command_failed']);
  assert.equal(provider.state.writes.length, writes, 'foreign collision refuses before any mutation');
  assert.deepEqual(migrationRows(provider), migrations);
  assert.equal(provider.uploads.length, 1, 'repeat and foreign collision never upload another worker');
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '');

});
