import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { privateDirectory, readPrivateFile, writePrivateFile } from '@runeditrun/rer/private-files';
import { readDeployEnvFile } from '@runeditrun/rer/internal/modules/deploy-kit/env-file.mjs';
import { refuse } from '@runeditrun/rer/errors';
import { contained } from '@runeditrun/rer/internal/cli/project.mjs';

export const secretsFile = environment => `.rer/deploy/${environment}.secrets.env`;
const generated = new Set(['SESSION_SECRET', 'SETUP_TOKEN', 'UPTIME_RUNNER_KEY']);
const validName = name => /^[A-Z][A-Z0-9_]*$/.test(name);
const validValue = value => typeof value === 'string' && !/[\r\n\0]/.test(value);
const same = (left, right) => Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([name, value]) => right[name] === value);
const register = (store, values) => store?.addSecrets?.(Object.values(values));
export async function readSecrets(root, environment) {
 try { return await readDeployEnvFile(root, await contained(root, secretsFile(environment), { optional: true, privateFile: true })); }
 catch (error) {
  if (error.code === 'ENOENT') return {};
  throw refuse(`Cannot read ${secretsFile(environment)}: restore an owned private file of NAME=VALUE lines. No legacy settings were removed.`);
 }
}
function merge(kept, incoming, environment, replace = []) {
 kept = Object.fromEntries(Object.entries(kept).filter(([name]) => !replace.includes(name)));
 const conflicts = Object.keys(incoming).filter(name => Object.hasOwn(kept, name) && kept[name] !== incoming[name]);
 if (conflicts.length) throw refuse(`Deployment secret conflict in ${secretsFile(environment)}: ${conflicts.join(', ')} differs from saved Uptime settings. No values were overwritten and no legacy settings were removed. Reconcile the named settings privately, then run the same deploy command again.`);
 return { ...incoming, ...kept };
}
// The legacy hook deployed its saved installation keys over any rer generated beside them, so the
// Worker holds the legacy keys: those replace rer's undeployed copies once. Owner inputs still refuse.
const replacedKeys = (kept, incoming) => [...generated].filter(name => Object.hasOwn(kept, name) && Object.hasOwn(incoming, name) && kept[name] !== incoming[name]);
export async function keepSecrets(root, environment, values, store, replace = []) {
 register(store, values);
 if (Object.entries(values).some(([name, value]) => !validName(name) || !validValue(value))) throw refuse('Invalid deployment secret settings; names and single-line string values are required.');
 const directory = await privateDirectory(root, ['.rer', 'deploy']);
 await writePrivateFile(join(directory, '.gitignore'), '*\n');
 const kept = await readSecrets(root, environment), merged = merge(kept, values, environment, replace);
 if (!same(kept, merged)) {
  // The kit removes one optional outer quote pair; wrapping preserves literal quotes too.
  await writePrivateFile(join(root, secretsFile(environment)), Object.entries(merged).map(([name, value]) => `${name}="${value}"\n`).join(''));
 }
 if (!same(await readSecrets(root, environment), merged)) throw refuse(`Deployment secret move could not be verified in ${secretsFile(environment)}. Legacy settings were kept.`);
 return merged;
}
async function legacy(root, path, store) {
 let contents;
 try { contents = await readPrivateFile(await contained(root, path, { optional: true, privateFile: true })); }
 catch (error) { if (error.code === 'ENOENT') return; throw error; }
 let values;
 try { values = JSON.parse(contents); } catch { throw refuse(`Invalid legacy deployment settings in ${path}: expected a JSON object. Legacy settings were kept.`); }
 if (!values || Array.isArray(values) || typeof values !== 'object' || Object.entries(values).some(([name, value]) => !validName(name) || !validValue(value))) throw refuse(`Invalid legacy deployment settings in ${path}: expected named single-line string values. Legacy settings were kept.`);
 register(store, values);
 return values;
}
export async function migrateSecrets(root, { store, dryRun = false } = {}) {
 const marker = '.rer/deploy/.legacy-secrets-migrated';
 try {
  await readPrivateFile(await contained(root, marker, { optional: true, privateFile: true }));
  return new Map();
 } catch (error) { if (error.code !== 'ENOENT') throw error; }
 const productionPath = '.rer/deploy/production-secrets.json';
 const production = await legacy(root, productionPath, store);
 if (production && [...generated].some(name => typeof production[name] !== 'string' || production[name].length < 32)) throw refuse(`Invalid legacy deployment settings in ${productionPath}: generated installation keys are missing or invalid. Legacy settings were kept; no replacement keys were generated.`);
 const sources = [], targets = new Map();
 if (production) { sources.push(productionPath); targets.set('production', production); }
 let entries;
 try { entries = await readdir(await contained(root, '.rer/deploy/environments', { optional: true }), { withFileTypes: true }); }
 catch (error) { if (error.code !== 'ENOENT') throw error; entries = []; }
 for (const entry of entries) {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(entry.name) || !entry.isDirectory()) throw refuse('Invalid legacy deployment environment directory. Legacy settings were kept.');
  const path = `.rer/deploy/environments/${entry.name}/secrets.json`, values = await legacy(root, path, store);
  if (!values) continue;
  const shared = production ?? await readSecrets(root, 'production');
  sources.push(path);
  targets.set(entry.name, { ...shared, ...values });
 }
 if (production) {
  const records = await readdir(join(root, '.rer/deploy'));
  for (const file of records.filter(name => /^[a-z][a-z0-9-]{0,39}\.json$/.test(name) && name !== 'production-secrets.json')) {
   let record;
   try { record = JSON.parse(await readPrivateFile(await contained(root, `.rer/deploy/${file}`, { privateFile: true }))); }
   catch { throw refuse(`Cannot inspect legacy deployment record ${file}. Legacy settings were kept.`); }

   const environment = file.slice(0, -5);
   if (record.kind === 'rer-deploy-owner-state' && record.environment === environment && !targets.has(environment)) targets.set(environment, production);
  }
 }
 // Check every destination before writing any of them or removing any source.
 const replaced = new Map();
 for (const [environment, values] of targets) {
  const kept = await readSecrets(root, environment), replace = replacedKeys(kept, values);
  replaced.set(environment, replace);
  targets.set(environment, merge(kept, values, environment, replace));
 }
 if (!dryRun) {
  for (const [environment, values] of targets) await keepSecrets(root, environment, values, store, replaced.get(environment));
  for (const [environment, values] of targets) if (!same(await readSecrets(root, environment), values)) throw refuse(`Deployment secret move could not be verified in ${secretsFile(environment)}. Legacy settings were kept.`);
  for (const path of sources) await rm(join(root, path));
  const directory = await privateDirectory(root, ['.rer', 'deploy']);
  await writePrivateFile(join(directory, '.gitignore'), '*\n');
  await writePrivateFile(join(root, marker), 'Legacy Uptime deployment settings have been handed to rer.\n');
  if (sources.length) store?.report(`deploy: moved saved Uptime settings to ${[...targets.keys()].map(secretsFile).join(', ')}; verified every value and removed the legacy JSON files.`);
  for (const [environment, names] of replaced) if (names.length) store?.report(`deploy: ${secretsFile(environment)} now keeps the installation's deployed ${names.join(', ')} from the legacy settings in place of unused copies.`);
 }
 return targets;
}
export async function savedInputs(root, environment, targets = new Map()) {
 const production = targets.get('production') ?? await readSecrets(root, 'production');
 const shared = Object.fromEntries(Object.entries(production).filter(([name]) => !generated.has(name)));
 return { ...shared, ...(targets.get(environment) ?? await readSecrets(root, environment)) };
}
