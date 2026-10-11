import { randomBytes } from 'node:crypto';
import { lstat, open, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { shared } from './shared.mjs';
import { contained } from './project.mjs';
import { invalid, missing, refuse } from './errors.mjs';
import { loopback } from './parse.mjs';

// The per-checkout key gate. Setup writes RER_DEV_KEY (32 random bytes) to
// owner-only .rer/local/ (directory 0700, file 0600); a repeat setup keeps it,
// reset removes it with the rest of .rer/local. Only local runtimes receive it.
export const DEV_KEY_FILE = '.rer/local/dev-key.env';
export const DEV_KEY_HEADER = 'x-rer-dev-key';
// modules/operator-auth/dev/index.mjs DEV_LAYER_MARKER: present in any output
// that bundles the local-only dev layer.
export const DEV_LAYER_MARKER = 'rer-dev-layer:local-only-never-deploy';
const KEY = /^RER_DEV_KEY=([A-Za-z0-9_-]{43,256})\n?$/;

export async function ensureDevKey(root) {
 const existing = await readDevKey(root);
 if (existing) return existing;
 const { privateDirectory, writePrivateFile } = await shared('private-files.mjs');
 const directory = await privateDirectory(root, ['.rer', 'local']), key = randomBytes(32).toString('base64url');
 await writePrivateFile(join(directory, 'dev-key.env'), `RER_DEV_KEY=${key}\n`);
 return key;
}

export async function readDevKey(root) {
 let path; try { path = await contained(root, DEV_KEY_FILE, { privateFile: true }); } catch (error) { if (error.code === 'missing_input') return null; throw error; }
 const { privateDirectory, readPrivateFile } = await shared('private-files.mjs');
 await privateDirectory(root, ['.rer', 'local']);
 const key = KEY.exec(await readPrivateFile(path))?.[1];
 if (!key) throw refuse(`${DEV_KEY_FILE} is malformed. Run rer reset --yes, then rer setup, for a new key.`);
 return key;
}

export async function requireDevKey(root) {
 const key = await readDevKey(root);
 if (!key) throw missing(`The local dev key ${DEV_KEY_FILE} is missing. Run rer setup to create it.`);
 return key;
}

// RER_OPEN carries the key in the fragment only: browsers never send a
// fragment to a server, and the page removes it from the address bar.
export function openUrl(url, key, { path = '/', as, next } = {}) {
 const fragment = new URLSearchParams({ 'rer-dev': key, ...(as ? { as } : {}), ...(next ? { next } : {}) });
 return `${url}${path}#${fragment}`;
}

export function refuseManagedInstallation(...sources) {
 for (const vars of sources) {
  if (!vars?.RER_INSTALLATION_ID || !vars.RER_MANAGEMENT_ORIGIN) continue;
  let host; try { host = new URL(vars.RER_MANAGEMENT_ORIGIN).hostname.replace(/^\[|\]$/g, ''); } catch {}
  if (!loopback(host)) throw refuse('Dev identity refuses to start beside RER_INSTALLATION_ID with a non-loopback RER_MANAGEMENT_ORIGIN. Remove them from local settings or run rer dev --login.');
 }
}

// The persona list the running app declares, read with the key header.
export async function resolvePersona(url, key, as, signal) {
 const response = await fetch(url + '/__dev/personas', { headers: { [DEV_KEY_HEADER]: key }, signal: AbortSignal.any([signal, AbortSignal.timeout(10000)].filter(Boolean)) });
 if (!response.ok) { await response.body?.cancel(); throw refuse(`The application did not serve dev identity (HTTP ${response.status}). Check its local-only entry.`); }
 const personas = await response.json(), persona = personas.find(entry => entry.as === as);
 if (!persona) throw invalid(`Unknown dev persona ${as}. This app declares: ${personas.map(entry => entry.as).join(', ')}.`);
 return persona;
}

// rer build refuses output that bundles the dev layer, naming the file.
export async function refuseDevLayerOutput(root, devIdentity) {
 if (!devIdentity) return;
 const marker = Buffer.from(DEV_LAYER_MARKER);
 async function walk(path) {
  let status; try { status = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (status.isDirectory()) { for (const entry of (await readdir(path)).sort()) await walk(join(path, entry)); return; }
  if (!status.isFile()) return;
  const file = await open(path, 'r');
  try { if ((await file.readFile()).includes(marker)) throw refuse(`The build output contains the local-only dev layer: ${relative(root, path)}. Import modules/operator-auth/dev only from the local entry ${devIdentity.entry}.`); }
  finally { await file.close(); }
 }
 for (const output of devIdentity.output ?? ['dist']) await walk(await contained(root, output, { optional: true }));
}
