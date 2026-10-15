import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { controlOrigin } from '../runners/src/control-origin.mjs';

const processVariables = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ'];
const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
// Production's runner key is in the shared settings file; every other deploy
// environment has its own (see scripts/deployment/owner-settings.mjs).
const settingsPath = environment => environment === 'production' ? ['.rer', 'deploy', 'production-secrets.json'] : ['.rer', 'deploy', 'environments', environment, 'secrets.json'];
const settingsError = environment => Error(`Runner settings require an owned private regular ${settingsPath(environment).join('/')} file without symlinks.`);

async function runnerKey(root, environment) {
  // Do not repair permissions while reading authority. Parent directories must
  // also refuse links and replacement by another local account.
  let file;
  try {
    const parts = settingsPath(environment);
    for (let depth = 1; depth < parts.length; depth++) {
      const path = join(root, ...parts.slice(0, depth));
      const info = await lstat(path);
      if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o022)) throw settingsError(environment);
    }
    file = await open(join(root, ...parts), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!info.isFile() || info.uid !== process.getuid() || ![0o400, 0o600].includes(info.mode & 0o7777) || info.size > 65536) throw settingsError(environment);
    const bytes = Buffer.alloc(65537);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > 65536) throw settingsError(environment);
    let settings;
    try { settings = JSON.parse(bytes.subarray(0, length).toString('utf8')); }
    finally { bytes.fill(0); }
    const key = settings && !Array.isArray(settings) && settings.UPTIME_RUNNER_KEY;
    if (typeof key !== 'string' || !/^[\x21-\x7e]{32,4096}$/.test(key)) throw Error('Runner settings require a valid UPTIME_RUNNER_KEY.');
    return key;
  } catch {
    // JSON parser and filesystem errors can include private bytes or paths.
    throw settingsError(environment);
  } finally {
    await file?.close();
  }
}

// runnerPath is an explicit function argument for isolated subprocess tests;
// the CLI has no argument or environment override for the executable child.
export async function launchRunner({ root = process.cwd(), env = process.env,
  environment = 'production', runnerPath, signalSource = process, stdio = 'inherit', terminationGraceMs = 30000 } = {}) {
  if (typeof process.getuid !== 'function') throw Error('Runner start requires a Unix owner account.');
  if (typeof environment !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(environment)) throw Error('Runner start requires a valid deploy environment name.');
  try { controlOrigin(env.UPTIME_CONTROL_ORIGIN); }
  catch { throw Error('UPTIME_CONTROL_ORIGIN must be an exact HTTPS origin.'); }
  const directory = await realpath(root);
  const key = await runnerKey(directory, environment);
  const childEnvironment = Object.fromEntries(processVariables
    .filter(name => typeof env[name] === 'string').map(name => [name, env[name]]));
  // Suppress Node's implicit coverage inheritance as well as the explicit env.
  childEnvironment.NODE_V8_COVERAGE = undefined;
  childEnvironment.UPTIME_CONTROL_ORIGIN = env.UPTIME_CONTROL_ORIGIN;
  childEnvironment.UPTIME_RUNNER_KEY = key;
  return await new Promise((accept, reject) => {
    let child;
    try {
      child = spawn(process.execPath, [runnerPath ?? join(directory, 'runners/src/private-runner.mjs')], {
        cwd: directory, env: childEnvironment, stdio,
      });
    } catch { reject(Error('Private runner could not start.')); return; }
    let timer;
    let failed = false;
    const forward = signal => {
      child.kill(signal);
      timer ??= setTimeout(() => child.kill('SIGKILL'), terminationGraceMs);
    };
    const handlers = signals.map(signal => [signal, () => forward(signal)]);
    for (const [signal, handler] of handlers) signalSource.on(signal, handler);
    // Also terminate on an unexpected synchronous parent exit.
    const onExit = () => child.kill('SIGKILL');
    signalSource.on('exit', onExit);
    child.once('error', () => { failed = true; });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      for (const [name, handler] of handlers) signalSource.removeListener(name, handler);
      signalSource.removeListener('exit', onExit);
      if (failed) reject(Error('Private runner could not start.'));
      else accept({ code, signal });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!(args.length === 0 || (args.length === 2 && args[0] === '--environment'))) throw Error('Usage: node scripts/runner-start.mjs [--environment NAME]');
    const result = await launchRunner({ environment: args[1] ?? 'production' });
    if (result.signal) process.kill(process.pid, result.signal);
    else process.exitCode = result.code ?? 1;
  } catch {
    console.error('Runner start failed: check the exact HTTPS UPTIME_CONTROL_ORIGIN and the owner-only deployment settings for the environment containing UPTIME_RUNNER_KEY (for a named environment, run its rer deploy again to save its key).');
    process.exitCode = 1;
  }
}
