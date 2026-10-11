import { readFile, lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readOperations } from '../operations/operations.mjs';
import { invalid, missing, refuse } from './errors.mjs';

export async function contained(root, path, { optional = false, privateFile = false } = {}) {
 if (typeof path !== 'string' || !path || isAbsolute(path) || path.split(/[\\/]/).some(part => part === '..' || part === '')) throw refuse('Path must be a contained checkout path without traversal.');
 const checkout = await realpath(root), destination = resolve(checkout, path), parts = relative(checkout, destination).split(sep);
 let current = checkout;
 for (let i = 0; i < parts.length; i++) {
  current = resolve(current, parts[i]);
  let status; try { status = await lstat(current); } catch (error) { if (error.code === 'ENOENT' && optional) return destination; if (error.code === 'ENOENT') throw missing(`Missing input file: ${path}. See the project operating documentation.`); throw error; }
  if (status.isSymbolicLink()) throw refuse(`Symlink refused at ${path}; preserve it and resolve placement first.`);
  if (i < parts.length - 1 && !status.isDirectory()) throw refuse(`Unsafe path ancestor for ${path}.`);
  if (privateFile && i === parts.length - 1 && (!status.isFile() || status.nlink !== 1 || (status.mode & 0o077) !== 0 || (process.getuid && status.uid !== process.getuid()))) throw refuse(`Input must be an owned regular private file (0600): ${path}.`);
 }
 return destination;
}

export async function resolveProject(root) {
 root = await realpath(root);
 let loaded;
 try { loaded = await readOperations(root); } catch (error) {
  if (error.code === 'ENOENT') throw missing('OPERATIONS.json or a declared input is missing. See the project operating documentation.');
  throw invalid('Malformed operations descriptor or unsafe input. Correct OPERATIONS.json and its contained inputs.');
 }
 const marker = loaded.descriptor.seedContract;
 let adapter;
 if (marker) {
  await contained(root, marker.adapter);
  try { adapter = (await import(pathToFileURL(resolve(root, marker.adapter)))).commandAdapter; }
  catch { throw invalid('The declared adapter could not be loaded. Restore its portable sources.'); }
 }
 return { root, ...loaded, profile: marker ? 'first-party' : 'independent', adapter };
}

// Only the descriptor marker distinguishes package forwarding from a raw
// independent tail. Schema validation and adapter imports happen after parsing.
export async function parsingProfile(root) {
 try { const descriptor=JSON.parse(await readFile(resolve(root,'OPERATIONS.json'),'utf8'));return descriptor.version===2&&!descriptor.seedContract?'independent':'first-party'; }
 catch { return 'first-party'; } // Help still works with absent/broken metadata.
}

export async function readPackage(root) {
 try { return JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')); }
 catch { return {}; }
}
