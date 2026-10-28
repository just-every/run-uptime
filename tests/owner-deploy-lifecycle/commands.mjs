import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, readdir, rm, symlink, realpath, appendFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = resolve(import.meta.dirname, '../..');
// Resolve the installed, package-pinned pnpm before moving into the isolated
// HOME. pnpm's own exec PATH identifies its real binary, without a test stub.
const commandPath = join(project, 'node_modules/.bin') + delimiter + execFileSync('pnpm', ['exec', process.execPath, '-p', 'process.env.PATH'], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// Keep the already-prepared tool cache when isolating HOME. Otherwise Corepack
// downloads pnpm inside the provider-only network preload before rer can start.
const toolEnvironment = Object.fromEntries(['COREPACK_HOME', 'COREPACK_DEFAULT_TO_LATEST', 'COREPACK_ENABLE_AUTO_PIN', 'COREPACK_ENABLE_DOWNLOAD_PROMPT', 'COREPACK_ENV_FILE']
  .filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
export const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export async function checkout(t) {
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
export async function deploy(root, provider, signal, flags = [], { inputs = true } = {}) {
  // Dependency probes keep NODE_OPTIONS but correctly discard application
  // environment variables. Keep the test transport in this private checkout so
  // the same preload also works in the real npm/pnpm probe processes.
  await mkdir(join(root, '.rer'), { recursive: true, mode: 0o700 });
  await writeFile(join(root, '.rer/owner-deploy-test-transport.json'), JSON.stringify(provider.transport), { mode: 0o600 });
  const env = { PATH: commandPath, HOME: root, CI: 'true', ...toolEnvironment,
    NODE_OPTIONS: `--import=${pathToFileURL(join(root, 'tests/owner-deploy-lifecycle/preload.mjs')).href}`,
    CLOUDFLARE_ACCOUNT_ID: provider.accountId, CLOUDFLARE_API_TOKEN: provider.token,
    // rer's shared production-mail names; Uptime keeps MAIL_API_KEY under the selected provider's own setting.
    ...(inputs ? { OWNER_EMAIL: 'owner@example.test', MAIL_FROM: 'sender@synthetic-uptime.dev', MAIL_PROVIDER: 'sendgrid', MAIL_API_KEY: 'test-only-sendgrid-key' } : {}),
  };
  return new Promise((resolveResult, reject) => {
    const child = spawn('rer', ['deploy', '--json', '--owner-name', 'Lifecycle owner', ...flags], { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
      resolveResult({ code, messages: records.filter(value => value.event === 'error').map(value => value.message), errorCodes: records.filter(value => value.event === 'error').map(value => value.code), failureCodes: records.filter(value => value.event === 'error').flatMap(value => value.message?.match(/: ([a-zA-Z0-9_-]+)(?:[. ]|$)/)?.[1] ?? []), result: records.findLast(value => value.event === 'result') ?? null });
    });
  });
}
