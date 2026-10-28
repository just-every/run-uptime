#!/usr/bin/env node
import {isHistoryFile,localHistoryCommand,remoteHistoryCommand,printHistory} from './definitions-history.mjs';
// Monitor definition files for a local installation, through the same import door as the console's Definitions view:
//   node scripts/definitions.mjs validate --input uptime.monitors.json   (writes nothing; exits 1 if any entry is refused or unsupported)
//   node scripts/definitions.mjs preview  --input FILE [--source auto|uptime.monitors|uptimerobot|pingdom|betterstack-heartbeats|site24x7|uptimerobot-log]
//   node scripts/definitions.mjs apply    --input FILE --digest PLAN_DIGEST [--source SOURCE]   (plans through the door; applies only that reviewed plan)
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
import { createHash, randomUUID } from 'node:crypto';
import { decodeDefinitionBytes, DEFINITION_BYTES } from '../src/domain/definitions/format.ts';
import { recogniseFile, exportDefinitions, undoBatch } from '../src/domain/definitions/index.server.ts';
import { operatorImport } from '../src/domain/business-import/door.server.ts';
import { ensureFirstRunner } from '../src/domain/runner-registration.server.ts';
import { doorPlanView, previewDefinitions } from '../src/domain/business-import/plan-view.server.ts';
import { importHistory } from '../src/domain/business-import/history.server.ts';
import {remoteDefinitions} from './definitions-http.mjs';
import { importPlaywright } from './playwright-import/cli.mjs';
import {permission,accessFence} from '../src/domain/access.server.ts';
import {authorizedDatabase,auditAccess} from '../src/domain/access-database.server.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const commands = { 'history-batches': [], 'history-remove': ['--batch'], 'history-cutover': ['--monitor','--at'], 'import-playwright': ['--input', '--fixtures', '--lock', '--output', '--base'], validate: ['--input', '--source','--source-monitor','--extracted-at','--from','--to'], test: ['--input','--source','--source-monitor','--extracted-at','--from','--to'], preview: ['--input', '--source','--source-monitor','--extracted-at','--from','--to'], apply: ['--input', '--source', '--digest','--source-monitor','--extracted-at','--from','--to'], export: ['--output'], batches: [], undo: ['--batch'] };

function parse(argv) {
 const [command, ...rest] = argv, options = {};
 if (!Object.hasOwn(commands, command)) throw usage(`Unknown command. Use one of: ${Object.keys(commands).join(', ')}.`);
 for (let i = 0; i < rest.length; i++) {
  const flag = rest[i];
  if (flag === '--json') { options.json = true; continue; }
  if (!(commands[command].includes(flag) || flag === '--origin' || flag === '--environment') || options[flag.slice(2)] !== undefined) throw usage(`Unsupported or repeated flag ${String(flag).slice(0, 40)} for ${command}.`);
  const value = rest[++i];
  if (value === undefined || value.startsWith('--')) throw usage(`A value is required for ${flag}.`);
  options[flag.slice(2)] = value;
 }
 for (const required of { validate: ['input'], test:['input'], preview: ['input'], apply: ['input', 'digest'], export: ['output'], undo: ['batch'], 'history-remove':['batch'], 'history-cutover':['monitor','at'] }[command] ?? []) if (options[required] === undefined) throw usage(`${command} needs --${required}.`);
 return { command, options };
}
const usage = message => Object.assign(Error(message), { exitCode: 2 });

async function readInput(path) {
 const file = await open(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const stat = await file.stat();
  if (!stat.isFile()) throw usage('The input must be a regular file.');
  if (stat.size > DEFINITION_BYTES) return decodeDefinitionBytes(new Uint8Array(stat.size));
  const bytes=new Uint8Array(await file.readFile());
  if(/\.(?:ts|mts)$/i.test(path)){const {loadTypeScriptDefinitions}=await import('./definitions-typescript.mjs');return loadTypeScriptDefinitions(resolve(path),bytes)}
  return decodeDefinitionBytes(bytes);
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

// Holding local storage does not replace the live identity or second factor.
// The same permission and transaction fence apply to each resumed import step.
const ownerRequest = (env, path, init = {}) => new Request(new URL(path, env.UPTIME_ORIGIN), { ...init, headers: { host:new URL(env.UPTIME_ORIGIN).host, origin: env.UPTIME_ORIGIN, cookie: process.env.UPTIME_ACCESS_COOKIE ?? '', 'content-type': 'application/json', ...init.headers } });
const localAccess=env=>permission(env,ownerRequest(env,'/api/operator/import/local',{method:'POST'}),undefined,{action:'import',workspace:true});
const ownerAuthority = env => async () => accessFence(await localAccess(env));
// History reads the owner's import history with the same local authority.
async function door(env, namespace, step, body) {
 const response = await operatorImport(env, ownerRequest(env, `/api/operator/import/${step}`, { method: 'POST', headers: { 'x-import-source': namespace }, body: JSON.stringify(body) }), ownerAuthority(env));
 const result = await response.json();
 if (!response.ok) throw Object.assign(Error(`The import door refused ${step}: ${result.error}.`), { exitCode: 1 });
 return result;
}
async function until(env, namespace, step, body, done) {
 for (let call = 0; call < 100; call++) { const { job } = await door(env, namespace, step, body); if (job?.state === done) return job; if (!['queued', 'applying', 'undoing'].includes(job?.state)) throw Error(`The import stopped (${job?.error ?? job?.state}).`); }
 throw Error('The import did not finish; run the command again to continue.');
}
async function applyThroughDoor(env, file, source = 'auto', digest) {
 // An import never creates a runner; the local command establishes the first one, as opening the console does.
 await ensureFirstRunner(env);
 // The file uploads as the console's does: recognised, with its request secrets withheld.
 const { source: recognised, text } = recogniseFile(file, source), namespace = recognised === 'uptime.monitors' ? `uptime.monitors:${randomUUID()}` : recognised;
 const bytes = Buffer.from(JSON.stringify(text) + '\n'), hash = value => createHash('sha256').update(value).digest('hex'), totalChunks = Math.ceil(bytes.length / 65536);
 let uploadId;
 for (let index = 0; index < totalChunks; index++) { const chunk = bytes.subarray(index * 65536, (index + 1) * 65536); uploadId = (await door(env, namespace, 'uploads', { ...(uploadId ? { uploadId } : {}), name: 'definitions.ndjson', bundleSha256: hash(bytes), totalBytes: bytes.length, totalChunks, index, chunkSha256: hash(chunk), base64: chunk.toString('base64') })).uploadId; }
 const planned = await door(env, namespace, 'plan', { uploadId }).catch(error => /catchup_required/.test(error.message) ? door(env, namespace, 'plan', { uploadId, catchup: true }) : Promise.reject(error));
 const preview = await doorPlanView(env, planned.planId);
 // A plan that is not applied is cancelled at once, and the door keeps nothing of it.
 const refuse = async message => { if (!preview.applied) await door(env, namespace, 'undo', { planId: planned.planId }); throw Object.assign(Error(message), { exitCode: 1 }); };
 if (preview.kind !== 'definitions') await refuse('A log export is history only; there is nothing to apply.');
 // Apply exactly what was reviewed: the door's plan must read as the preview whose digest was given.
 if (preview.reviewDigest !== digest) await refuse('The installation or the file changed since this preview. Nothing was applied; preview again.');
 if (!preview.counts.create && !preview.counts.change) { if (!preview.applied) await door(env, namespace, 'undo', {planId: planned.planId}); return {unchanged: true, preview}; }
 const job = await until(env, namespace, 'apply', { planId: planned.planId, reviewedFingerprint: planned.fingerprint }, 'completed');
 const report = await door(env, namespace, 'reconcile', { planId: planned.planId });
 if (!report.ok) throw Error('The import finished, but Uptime does not hold what was reviewed. Undo this batch.');
 return { batchId: `business:${planned.planId}`, job, preview };
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
 console.log(`Plan digest: ${result.reviewDigest}`);
}

export async function run(argv = process.argv.slice(2)) {
 const { command, options } = parse(argv);
 if (options.origin) {
  const text=options.input===undefined?null:await readInput(options.input);
  if(command.startsWith('history-')||text!==null&&isHistoryFile(text,options.source,options['source-monitor'])){const result=await remoteHistoryCommand(command,options,text);if(options.json)console.log(JSON.stringify(result));else printHistory(result);return 0;}
  const result = await remoteDefinitions(command, options, text);
  if (options.json) console.log(JSON.stringify(result)); else if (command === 'preview' || command === 'validate' || command === 'test') printPreview(result); else console.log(result.unchanged ? 'The reviewed definitions are unchanged.' : 'Definitions command completed.');
  return ['validate','test'].includes(command) && result.kind === 'definitions' && (result.counts.refused || result.counts.unsupported) ? 1 : 0;
 }
 if(process.env.UPTIME_CI_TOKEN)throw usage('CI credentials require --origin and an explicit --environment.');
 if (command === 'import-playwright') { console.log(JSON.stringify(await importPlaywright(options))); return 0; }
 await lstat(join(root, 'data/local-secrets.json')).catch(() => { throw usage('Run rer setup --owner-email EMAIL --non-interactive first.'); });
 const text = options.input === undefined ? null : await readInput(options.input);
 if (command === 'export') await lstat(resolve(options.output)).then(() => { throw usage('Export writes a new file; choose a path that does not exist.'); }, error => { if (error.code !== 'ENOENT') throw error; });
 const operation = await localOperation(root, process.env.RER_LOCAL_OPERATION);
 let worker;
 try {
  if (['apply', 'undo','history-remove','history-cutover'].includes(command)) await migrate();
  const settings = await readLocalSettings();
  worker = await startLocalWorker({ bindings: { ...settings, ...await syntheticGrant() }, assets: false });
  const localEnv = { ...settings, UPTIME_LOCAL_REVIEW:'true', ...await syntheticGrant(), DB: await worker.getD1Database('DB') };
  const access=command==='export'?await permission(localEnv,ownerRequest(localEnv,'/api/definitions/export'),undefined,{action:'export',workspace:true}):await localAccess(localEnv);
  const env={...localEnv,DB:authorizedDatabase(localEnv,access)};
  const actor={kind:'operator',ref:access.session.operator.id};
  if(command.startsWith('history-')||text!==null&&isHistoryFile(text,options.source,options['source-monitor'])){const result=await localHistoryCommand(env,command,options,text);if(options.json)console.log(JSON.stringify(result));else printHistory(result);return 0;}
  if (command === 'validate' || command === 'preview' || command === 'test') {
   const result = await previewDefinitions(env, text, options.source);
   if(command==='test')result.test={kind:'schema-and-plan-validation',runtimeProbesExecuted:false};
   if (options.json) console.log(JSON.stringify(result)); else printPreview(result);
   return ['validate','test'].includes(command) && result.kind === 'definitions' && (result.counts.refused || result.counts.unsupported) ? 1 : 0;
  }
  if (command === 'apply') {
   const result = await applyThroughDoor(env, text, options.source, options.digest);
   if (options.json) console.log(JSON.stringify(result)); else console.log(result.unchanged ? 'The reviewed definitions are unchanged.' : `Applied batch ${result.batchId}: ${result.preview.counts.create} created (paused), ${result.preview.counts.change} changed. Undo with: node scripts/definitions.mjs undo --batch ${result.batchId}`);
   return 0;
  }
  if (command === 'export') {
   await auditAccess(localEnv,access);
   const temporary = resolve(options.output) + '.partial', file = await privateFile(temporary, false);
   try { await file.writeFile(JSON.stringify(await exportDefinitions(env), null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
   await promote(temporary, resolve(options.output));
   if (!options.json) console.log(`Wrote ${options.output}.`); else console.log(JSON.stringify({ output: options.output }));
   return 0;
  }
  if (command === 'batches') { const result = await importHistory(env, await ownerAuthority(env)()); console.log(options.json ? JSON.stringify(result) : result.map(b => `${b.id} ${new Date(b.createdAt).toISOString()} ${b.source} ${b.entries.length} entries${b.undone || b.undoneAt ? ' (undone)' : b.restoredAt ? ' (from archive)' : ''}`).join('\n') || 'No batches.'); return 0; }
  if (options.batch.startsWith('business:')) {
   const planId = options.batch.slice('business:'.length), batch = (await importHistory(env, await ownerAuthority(env)())).find(b => b.id === options.batch);
   if (!batch) throw usage('No such batch.');
   const job = await until(env, batch.namespace, 'undo', { planId }, 'undone');
   if (options.json) console.log(JSON.stringify({ batchId: options.batch, job })); else console.log(`Undid batch ${options.batch}.`);
   return 0;
  }
  const result = await undoBatch(env, options.batch, actor);
  if (options.json) console.log(JSON.stringify(result)); else for (const o of result.outcomes) console.log(`- ${o.outcome.padEnd(13)} ${o.name ? `“${o.name}”` : o.monitorId}: ${o.reason}`);
  return 0;
 } finally { await worker?.dispose(); await operation.release(); }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
 try { process.exitCode = await run(); }
 catch (error) { console.error(/NOT NULL constraint failed: uptime_audit\.id/.test(error.message) ? 'The installation changed during this command. Nothing was saved; try again.' : error.message); process.exitCode = error.exitCode ?? 1; }
}
