import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { commandFailure, approvedFailure, installationFailure, installationFailureMessage } from './failures.mjs';
import { withoutLocalVariables } from './local/build.mjs';
import { buildEnvironment } from './local/environment.mjs';
import { localOperation } from './local/operation.mjs';
import { recoverInterrupted } from './local/recovery.mjs';
import { credentialValues } from './redaction.mjs';
import { labels } from './adapter-labels.mjs';
import { chooseOrigin, prepareSettings, readSettings } from './adapter-settings.mjs';
import {listenerPorts} from './process-diagnostics.mjs';
import { owner, signIn } from './adapter-auth.mjs';
export { ownerAccountHosting } from './adapter-hosting.mjs';

// The adapter kit for an existing seed. A seed's scripts/installer/local.mjs
// declares its hooks; the kit runs them in one order through the captured
// command store, with canned failures and owned-process cleanup:
//
//   requirements → prepare → dependencies → secrets → build → migrate →
//   start (spawn, onApp, waitForReady) → owner → signIn → hosting → complete
//
// A hook is a command (`[command, args, options?]`), a function returning one
// (or an array of them), or a function doing its own work through the context.
// `false` or an absent hook skips that phase. See README "Adopting in an
// existing seed".

export { labels } from './adapter-labels.mjs';
const hookNames = ['node', 'tools', 'prepare', 'dependencies', 'origin', 'secrets', 'build', 'migrate', 'start', 'health', 'owner', 'signIn', 'hosting', 'guard', 'failure', 'features', 'localOwner'];

// Feature flags shown by the shared browser flow must describe what this
// adapter really does. localTrialWithoutEmail claims that sign-in works with no
// mail provider, which holds only when the adapter ends at the development
// outbox; hosting needs a hosting hook.
export function adapterFeatures(hooks, features = {}) {
 const result = { hosting: false, github: false, artwork: false, ...features };
 if (result.localTrialWithoutEmail === true && !hooks.signIn) throw new TypeError('localTrialWithoutEmail needs a signIn hook that ends at the development outbox.');
 if (result.hosting === true && !hooks.hosting) throw new TypeError('features.hosting needs a hosting hook.');
 if (hooks.hosting && result.hosting !== true) throw new TypeError('A hosting hook must be declared with features.hosting.');
 return Object.freeze(result);
}

export function localInstaller(hooks = {}) {
 for (const key of Object.keys(hooks)) if (!hookNames.includes(key)) throw new TypeError(`Unknown installer hook: ${key}`);
 for (const tool of hooks.tools ?? []) if (!['node', 'npm', 'pnpm', 'git'].includes(tool)) throw new TypeError(`Unsupported required tool: ${tool}. Use node, npm, pnpm or git.`);
 const features = adapterFeatures(hooks, hooks.features);
 async function run(root, input, store, onApp, signal, options = {}) {
  const context = Object.assign(createContext(root, input, store, onApp, signal, hooks.guard), options);
  context.manifest=store.setupManifest;
  store.addSecrets?.(credentialValues(process.env,context.manifest?.fields.filter(field=>field.kind==='secret').map(field=>field.name)));
  context.ownerClaim=context.manifest?.steps.find(step=>step.type==='owner-claim');
  options.onContext?.(context);
  const verb = options.verb ?? 'installer';
  if(verb!=='outbox')await store.configureQueue?.({verb});
  await requirements(context, hooks);
  if (['installer', 'setup'].includes(verb) && hooks.prepare) await hooks.prepare(context);
  if (verb === 'installer' && hooks.dependencies !== false) await phase(context, hooks, 'dependencies', hooks.dependencies ?? ['pnpm', ['install', '--frozen-lockfile']]);
  if (['installer', 'setup'].includes(verb) && hooks.secrets) await prepareSettings(context, hooks);
  else { context.origin = await chooseOrigin(context, hooks); if (hooks.secrets) context.vars = (await readSettings(root, hooks.secrets)).values; }
  // Overrides are runtime bindings only; never republish the saved settings.
  if (['dev','preview'].includes(verb) && hooks.secrets?.originKey) context.vars[hooks.secrets.originKey] = context.origin;
  store.addSecrets?.(Object.entries(context.vars).filter(([key]) => /secret|token|password/i.test(key)).map(([, value]) => value));
  if (['installer', 'setup', 'build'].includes(verb) && hooks.build) await build(context, hooks);
  if (['installer', 'setup'].includes(verb) && hooks.migrate) await phase(context, hooks, 'migrate', hooks.migrate);
  if (['installer', 'setup', 'dev', 'preview'].includes(verb) && hooks.start) await start(context, verb === 'preview' ? {...hooks,start:options.preview} : verb === 'dev' && options.dev ? { ...hooks, start: options.dev } : hooks);
  if (['installer', 'setup'].includes(verb) && hooks.owner) {
   if (typeof hooks.owner === 'function' || Array.isArray(hooks.owner)) await phase(context, hooks, 'owner', hooks.owner);
   else await owner(context, hooks.owner);
  }
  if ((['installer', 'setup', 'dev', 'preview'].includes(verb) || (verb === 'outbox' && options.requestSignIn)) && hooks.signIn) await signIn(context, hooks.signIn);
  if (verb === 'installer' && hooks.hosting) await hosting(context, hooks.hosting);
  store.state.appUrl = context.appUrl ?? (context.app ? context.origin : context.hostedUrl ?? context.origin);
  if (context.hostedUrl) store.state.hostedUrl = context.hostedUrl;
  await store.step(labels.complete);
  await store.phase('complete');
  return context;
 }
 async function install(root, input, store, onApp, signal) {
  let app, context, release;
  try {
   let operation;
   if(store.ownCleanup){operation=await recoverInterrupted(root)??await localOperation(root);let released=false;release=async()=>{if(!released){released=true;await operation.release();}};store.ownCleanup(signal,release);}
   await run(root, input, store, child => { app = child; onApp(child); }, signal, { operationToken:operation?.token,onContext(value) { context = value; } });
   if(!app)await release?.();
  } catch (error) {
   // Keep the attempt active until its owned processes and captured pipes
   // close. Publishing failure earlier would allow a retry beside the old app.
   if (app) await store.stop(app);
   await store.stopCommands?.(signal);
   store.state.error = hooks.failure?.(error, context ?? { root, input, store, app }) ?? installationFailureMessage(error);
   await store.phase('failed');
  }
 }
 return { install, features, settings:hooks.secrets, supplied:hooks.secrets?.supplied??[], ownerBootstrap:Boolean(hooks.owner&&typeof hooks.owner==='object'&&!Array.isArray(hooks.owner)), run, hooks: { dependencies: ['pnpm', ['install', '--frozen-lockfile']], health: defaultHealth, ...hooks } };
}

function createContext(root, input, store, onApp, signal, guard) {
 const context = {
  root, input, store, onApp, signal, vars: {},
  // One captured command. An unsuccessful command becomes the canned failure
  // for `step`, keeping the captured exit, output and log path.
  async run(label, command, args = [], { step = 'setup', ...options } = {}) {
   if (guard) await guard(context);
   try { return await store.run(label, command, args, { cwd: root, signal, ...options }); } catch (error) {
    if (signal?.aborted || options.signal?.aborted) throw error;
    throw installationFailure('command_failed', { step, diagnostic: error });
   }
  },
  fail(step) { return installationFailure('command_failed', { step }); },
 };
 return context;
}

async function requirements(context, hooks) {
 if (hooks.node && !atLeast(process.versions.node, hooks.node)) throw installationFailure('node_version', { version: hooks.node });
 for (const tool of hooks.tools ?? ['pnpm']) if (!await onPath(tool)) throw installationFailure('missing_tool', { tool });
}

function atLeast(actual, required) {
 const [a, b] = [actual, required].map(value => value.split('.').map(Number));
 for (let index = 0; index < 3; index++) if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
 return true;
}

async function onPath(tool) {
 const names = process.platform === 'win32' ? ['.exe', '.cmd', ''].map(suffix => tool + suffix) : [tool];
 for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
  for (const name of names) {
   try { await access(join(directory, name), constants.X_OK); return true; } catch {}
  }
 }
 return false;
}

const steps = { dependencies: 'dependencies', build: 'build', migrate: 'setup', start: 'start', owner: 'setup', signIn: 'setup', hosting: 'deploy' };

async function commandsFor(context, hook) {
 const value = typeof hook === 'function' ? await hook(context) : hook;
 if (value === undefined || value === false) return [];
 if (!Array.isArray(value)) throw new TypeError('An installer command hook returns [command, args, options].');
 return typeof value[0] === 'string' ? [value] : value;
}

async function phase(context, hooks, name, hook) {
 await context.store.step(labels[name]);
 for (const [command, args = [], options = {}] of await commandsFor(context, hook)) {
  await context.run(labels[name], command, args, { step: steps[name], ...options });
 }
}

// The build runs with all declared private files moved aside so a bundler cannot copy local
// credentials into its output. A seed build that wraps itself in the same
// local runner inherits this operation through RER_LOCAL_OPERATION.
async function build(context, hooks) {
 const { root, store } = context;
 await store.step(labels.build);
 let restoreFailure;
 await withoutLocalVariables(root, async ({ operation, restore }) => {
  const commands=await commandsFor(context,hooks.build);
  for (const [index,[command, args = [], options = {}]] of commands.entries()) {
   await context.run(labels.build, command, args, { step: 'build', ...options, afterCommand: result => (result?.code!==0 || index===commands.length-1) ? restore() : undefined, env: { ...buildEnvironment(context.manifest?.fields.map(field=>field.name),options.env??process.env), RER_LOCAL_OPERATION: operation.token } });
  }
 }, { settings: [...(context.privateSettings ?? ['.dev.vars', '.dev.vars.previous']), hooks.secrets?.file ?? '.dev.vars'], nested: context.operationToken ?? null, report: message => { restoreFailure = message; store.report?.(message); } });
 if (restoreFailure) throw installationFailure('command_failed', { step: 'build' });
}

// Health is the application's own /health: HTTP 200 with JSON status "ok"
// unless the seed supplies another check. Each probe honours its signal.
export async function defaultHealth(url, signal) {
 const response = await fetch(url, { signal });
 if (!response.ok) {
  await response.body?.cancel();
  return { ready: false, message: `HTTP ${response.status}` };
 }
 let status;
 try { status = (await response.json())?.status; } catch {
  return { ready: false, message: `HTTP ${response.status}; invalid health JSON` };
 }
 return { ready: status === 'ok', message: `HTTP ${response.status}; health status ${status === 'ok' ? 'ok' : 'not ok'}` };
}

async function start(context, hooks) {
 const { store, onApp, signal } = context;
 await store.step(labels.start);
 const [[command, args = [], options = {}]] = await commandsFor(context, hooks.start);
 const { health = '/health', ready, timeoutMs, softAfterMs, intervalMs, ...spawnOptions } = options;
 if (hooks.guard) await hooks.guard(context);
 let child;
 try { child = store.spawn(labels.start, command, args, { cwd: context.root, signal, ...spawnOptions }); } catch (error) {
  if (signal?.aborted) throw error;
  throw installationFailure('command_failed', { step: 'start', diagnostic: error });
 }
 context.app = child;
 await onApp(child);
 const url = new URL(health, context.origin).href;
 const expectedPort=context.runtimePort??Number(new URL(context.origin).port||80);
 const readinessLabel=`${labels.start} (expected internal port ${expectedPort})`;
 try {
  await store.waitForReady(readinessLabel, child, ready ? probeSignal => ready(url, probeSignal, context) : probeSignal => (hooks.health ?? defaultHealth)(url, probeSignal, context), { signal, timeoutMs: ['dev','preview'].includes(context.verb)?Math.min(timeoutMs??60000,120000):(timeoutMs??900000), ...(softAfterMs ? { softAfterMs } : {}), ...(intervalMs ? { intervalMs } : {}) });
 } catch (error) {
  if (signal?.aborted) throw error;
  const ports=await listenerPorts(child.pid);
  if(ports.length){
   const message=store.redact(`Application listened on port ${ports.join(', ')}; readiness failed for expected internal port ${expectedPort}. Check application health and the runtime target's port binding.`);
   store.report(message);const prior=approvedFailure(error);error=commandFailure(`${prior?.message??readinessLabel}\n${message}`,prior??{});
  }
  throw installationFailure('command_failed', { step: 'start', diagnostic: error });
 }
}

async function hosting(context, hook) {
 await context.store.step(labels.hosting);
 for (const [command, args = [], options = {}] of await commandsFor(context, hook)) await context.run(labels.hosting, command, args, { step: 'deploy', ...options });
}


export { freePort, readSettings } from './adapter-settings.mjs';
