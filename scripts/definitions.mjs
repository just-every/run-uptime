#!/usr/bin/env node
// Monitor definition files for a local installation, through the same engine as the console's Import view:
//   node scripts/definitions.mjs validate --input uptime.monitors.json   (writes nothing; exits 1 if any entry is refused or unsupported)
//   node scripts/definitions.mjs preview  --input FILE [--source auto|uptime.monitors|uptimerobot|uptimerobot-log]
//   node scripts/definitions.mjs apply    --input FILE --digest PLAN_DIGEST [--source SOURCE]
//   node scripts/definitions.mjs export   --output uptime.monitors.json   (read-only; a new file only)
//   node scripts/definitions.mjs batches
//   node scripts/definitions.mjs undo     --batch BATCH_ID
// Add --json for machine output. Stop rer dev or preview first: like export and import, this holds the local operation.
import { lstat, open, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLocalSettings } from './local-settings.mjs';
import { startLocalWorker } from './local-worker.mjs';
import { localOperation } from '@runeditrun/rer/local/operation';
import { privateFile, promote } from '@runeditrun/rer/modules/portability/cli-options';
import { decodeDefinitionBytes, DEFINITION_BYTES } from '../src/domain/definitions/format.ts';
import { previewDefinitions, applyDefinitions, exportDefinitions, listBatches, undoBatch } from '../src/domain/definitions/index.server.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const commands = { validate: ['--input', '--source'], preview: ['--input', '--source'], apply: ['--input', '--source', '--digest'], export: ['--output'], batches: [], undo: ['--batch'] };
const actor = { kind: 'feature', ref: 'local-cli' };

function parse(argv) {
 const [command, ...rest] = argv, options = {};
 if (!Object.hasOwn(commands, command)) throw usage(`Unknown command. Use one of: ${Object.keys(commands).join(', ')}.`);
 for (let i = 0; i < rest.length; i++) {
  const flag = rest[i];
  if (flag === '--json') { options.json = true; continue; }
  if (!commands[command].includes(flag) || options[flag.slice(2)] !== undefined) throw usage(`Unsupported or repeated flag ${String(flag).slice(0, 40)} for ${command}.`);
  const value = rest[++i];
  if (value === undefined || value.startsWith('--')) throw usage(`A value is required for ${flag}.`);
  options[flag.slice(2)] = value;
 }
 for (const required of { validate: ['input'], preview: ['input'], apply: ['input', 'digest'], export: ['output'], undo: ['batch'] }[command] ?? []) if (options[required] === undefined) throw usage(`${command} needs --${required}.`);
 return { command, options };
}
const usage = message => Object.assign(Error(message), { exitCode: 2 });

async function readInput(path) {
 const file = await open(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const stat = await file.stat();
  if (!stat.isFile()) throw usage('The input must be a regular file.');
  if (stat.size > DEFINITION_BYTES) return decodeDefinitionBytes(new Uint8Array(stat.size));
  return decodeDefinitionBytes(new Uint8Array(await file.readFile()));
 } finally { await file.close(); }
}
async function migrate() {
 const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'uptime-local', '--local', '--persist-to', '.wrangler/state'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
 let errors = ''; child.stderr.on('data', bytes => { errors += bytes; });
 const code = await new Promise(done => child.once('close', done));
 if (code !== 0) throw Error(`Local data migrations failed (exit ${code}).`);
}
async function syntheticGrant() {
 try { const grant = JSON.parse(await readFile(join(root, '.wrangler/state/synthetic-grant.json'), 'utf8')); return Number.isInteger(grant.port) ? { UPTIME_SYNTHETIC_PORT: String(grant.port) } : {}; } catch { return {}; }
}

function printPreview(result) {
 if (result.kind === 'history') { console.log(result.note); return; }
 const c = result.counts;
 console.log(`${result.sourceLabel}: ${c.create} create, ${c.unchanged} unchanged, ${c.change} change, ${c.refused} refused, ${c.unsupported} unsupported.`);
 console.log(`Source entries: ${result.outcomes.importable} importable, ${result.outcomes.withDifferences} importable with listed differences, ${result.outcomes.unsupported} unsupported, ${result.outcomes.refused} refused.`);
 for (const e of result.entries) {
  console.log(`- ${e.action.padEnd(11)} ${e.reason ?? (e.name ? `“${e.name}”` : e.label)}`);
  for (const change of e.changes ?? []) console.log(`    ${change.field}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`);
  for (const difference of e.differences) console.log(`    note: ${difference}`);
 }
 console.log(`Plan digest: ${result.digest}`);
}

export async function run(argv = process.argv.slice(2)) {
 const { command, options } = parse(argv);
 await lstat(join(root, 'data/local-secrets.json')).catch(() => { throw usage('Run rer setup --owner-email EMAIL --non-interactive first.'); });
 const text = options.input === undefined ? null : await readInput(options.input);
 if (command === 'export') await lstat(resolve(options.output)).then(() => { throw usage('Export writes a new file; choose a path that does not exist.'); }, error => { if (error.code !== 'ENOENT') throw error; });
 const operation = await localOperation(root, process.env.RER_LOCAL_OPERATION);
 let worker;
 try {
  if (['apply', 'undo'].includes(command)) await migrate();
  const settings = await readLocalSettings();
  worker = await startLocalWorker({ bindings: { ...settings, ...await syntheticGrant() }, assets: false });
  const env = { ...settings, ...await syntheticGrant(), DB: await worker.getD1Database('DB') };
  if (command === 'validate' || command === 'preview') {
   const result = await previewDefinitions(env, text, options.source);
   if (options.json) console.log(JSON.stringify(result)); else printPreview(result);
   return command === 'validate' && result.kind === 'definitions' && (result.counts.refused || result.counts.unsupported) ? 1 : 0;
  }
  if (command === 'apply') {
   const result = await applyDefinitions(env, text, options.source, options.digest, actor);
   if (options.json) console.log(JSON.stringify(result)); else console.log(`Applied batch ${result.batchId}: ${result.created.length} created (paused), ${result.changed.length} changed. Undo with: node scripts/definitions.mjs undo --batch ${result.batchId}`);
   return 0;
  }
  if (command === 'export') {
   const temporary = resolve(options.output) + '.partial', file = await privateFile(temporary, false);
   try { await file.writeFile(JSON.stringify(await exportDefinitions(env), null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
   await promote(temporary, resolve(options.output));
   if (!options.json) console.log(`Wrote ${options.output}.`); else console.log(JSON.stringify({ output: options.output }));
   return 0;
  }
  if (command === 'batches') { const result = await listBatches(env); console.log(options.json ? JSON.stringify(result) : result.map(b => `${b.id} ${new Date(b.createdAt).toISOString()} ${b.source} ${b.entries.length} entries${b.undoneAt ? ' (undone)' : b.restoredAt ? ' (from archive)' : ''}`).join('\n') || 'No batches.'); return 0; }
  const result = await undoBatch(env, options.batch, actor);
  if (options.json) console.log(JSON.stringify(result)); else for (const o of result.outcomes) console.log(`- ${o.outcome.padEnd(13)} ${o.name ? `“${o.name}”` : o.monitorId}: ${o.reason}`);
  return 0;
 } finally { await worker?.dispose(); await operation.release(); }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
 try { process.exitCode = await run(); }
 catch (error) { console.error(/NOT NULL constraint failed: uptime_audit\.id/.test(error.message) ? 'The installation changed during this command. Nothing was saved; try again.' : error.message); process.exitCode = error.exitCode ?? 1; }
}
