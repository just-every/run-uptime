import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const descriptor = JSON.parse(await readFile(new URL('../OPERATIONS.json', import.meta.url), 'utf8'));
// Construct an environment from non-secret job plumbing only, even when the
// test runner itself was started by pnpm or has unrelated controller secrets.
const jobEnvironment = home => ({PATH: `${dirname(process.execPath)}:${process.env.PATH}`, HOME: home, CI: 'true'});
const run = (argv, env, cwd = root) => spawnSync(argv[0] === 'node' ? process.execPath : argv[0], argv.slice(1), {
  cwd, env, encoding: 'utf8', timeout: 30_000,
});

test('package-script environment injection cannot cross the credential-free boundary', async () => {
  const home = await mkdtemp(join(tmpdir(), 'uptime-invocation-'));
  try {
    // Exercise the installed, pinned pnpm binary with a disposable package, not
    // a simulated environment or a copy of Base's credential guard.
    await writeFile(join(home, 'package.json'), JSON.stringify({private: true, scripts: {probe: 'node probe.mjs'}}));
    const guard = new URL('../src/base/modules/deploy-kit/prepare.mjs', import.meta.url).href;
    await writeFile(join(home, 'probe.mjs'), `import {assertCredentialFree} from ${JSON.stringify(guard)};
try { assertCredentialFree(process.env); console.log('credential-free'); }
catch (error) { console.error(JSON.stringify({code:error.message,nodePathPresent:Boolean(process.env.NODE_PATH)})); process.exitCode=1; }
`);
    const direct = run(['node', 'probe.mjs'], jobEnvironment(home), home);
    assert.equal(direct.status, 0, direct.stderr);
    assert.equal(direct.stdout.trim(), 'credential-free');
    // pnpm's symlinked-executable mode populates NODE_PATH on POSIX. The
    // action-installed pnpm launcher can also add it before pnpm starts. Use
    // the real option to reproduce the boundary on npm-installed pnpm too.
    const packageScript = run(['pnpm', '--config.prefer-symlinked-executables=true', 'run', 'probe'], jobEnvironment(home), home);
    assert.equal(packageScript.status, 1);
    assert.match(packageScript.stderr, /"code":"prepare-node-injection-forbidden","nodePathPresent":true/);
  } finally { await rm(home, {recursive: true, force: true}); }
});

test('declared direct commands reach their real input checks and reject explicit Node injection', async () => {
  const home = await mkdtemp(join(tmpdir(), 'uptime-command-boundary-'));
  try {
    const env = {...jobEnvironment(home), RER_PREPARE_ISOLATION: 'ephemeral-credential-free-job'};
    const prepare = run(descriptor.commands['artifact-prepare'].argv, env);
    assert.equal(prepare.status, 1);
    // Stop before filesystem mutation/build on either supported CI Linux or a
    // developer platform. Reaching this error proves pnpm did not inject state.
    assert.match(prepare.stderr, process.platform === 'linux' ? /artifact-must-be-outside-checkout/ : /prepare-requires-isolated-linux-job/);
    for (const action of ['artifact-deploy', 'artifact-health']) {
      const controller = run(descriptor.commands[action].argv, env);
      assert.equal(controller.status, 1);
      assert.deepEqual(JSON.parse(controller.stderr), {ok: false, code: 'missing-RER_DEPLOY_ARTIFACT'});
    }
    for (const injection of [{NODE_PATH: '/synthetic/untrusted/modules'}, {NODE_OPTIONS: '--no-warnings'}]) {
      const prepared = run(descriptor.commands['artifact-prepare'].argv, {...env, ...injection});
      assert.equal(prepared.status, 1);
      assert.match(prepared.stderr, /prepare-node-injection-forbidden/);
      for (const action of ['artifact-deploy', 'artifact-health']) {
        const controller = run(descriptor.commands[action].argv, {...env, ...injection});
        assert.equal(controller.status, 1);
        assert.deepEqual(JSON.parse(controller.stderr), {ok: false, code: 'deployment-failed'});
      }
    }
  } finally { await rm(home, {recursive: true, force: true}); }
});

test('Base inspector reports controller custody and credentials absent from preparation', async () => {
  const {inspectOperations} = await import('@runeditrun/rer/operations');
  const preparation = Object.fromEntries(descriptor.commands['artifact-prepare'].requiredEnvironment.map(name => [name, 'synthetic-input']));
  const result = await inspectOperations(root, preparation);
  assert.equal(result.ok, false);
  assert.ok(result.commands.every(command => command.available));
  for (const name of ['RER_DEPLOY_ARTIFACT_SHA256', 'RER_DEPLOY_RECEIPT', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'UPTIME_WORKER_NAME', 'UPTIME_ORIGIN', 'SESSION_SECRET', 'OWNER_EMAIL']) {
    assert.ok(result.missingEnvironment.includes(name), `${name} must remain a declared controller requirement`);
  }
  assert.deepEqual(result.loops.find(loop => loop.id === 'operator-sign-in-mail').missingEnvironment, ['SENDGRID_API_KEY']);
  const controller = Object.fromEntries(descriptor.requiredEnvironment.map(name => [name, 'synthetic-input']));
  assert.equal((await inspectOperations(root, controller)).ok, true, 'Base validates local input presence, not provider acceptance');
});
