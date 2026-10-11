import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
export class LocalStateSafetyError extends Error {}
async function physicalPath(path) {
 const absolute = resolve(path), parent = resolve(absolute, '..');
 if (parent === absolute) return realpath(absolute);
 const physicalParent = await physicalPath(parent), candidate = resolve(physicalParent, relative(parent, absolute));
 let status; try { status = await lstat(candidate); } catch (error) { if (error.code === 'ENOENT') return candidate; throw error; }
 if (status.isSymbolicLink()) { try { return await realpath(candidate); } catch { throw new LocalStateSafetyError('Local state safety: unresolved symlink. Preserve it and resolve placement before retrying.'); } }
 return candidate;
}
function contains(parent, path) { const suffix = relative(parent, path); return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('..' + sep)); }
export async function selectLocalState(root, persistTo = process.env.RER_LOCAL_STATE_PATH ?? '.wrangler/state') {
 if (typeof persistTo !== 'string' || !persistTo.trim()) throw new LocalStateSafetyError('Local state safety: choose an explicit nonempty persistence directory.');
 const checkout = await realpath(root), lexical = resolve(checkout, persistTo), state = await physicalPath(lexical);
 for (const name of ['dist', '.output', '.tanstack', 'node_modules', '.wrangler/deploy']) {
  const output = resolve(checkout, name), physical = await physicalPath(output);
  for (const [a, b] of [[lexical, output], [state, physical]]) if (contains(a, b) || contains(b, a)) throw new LocalStateSafetyError(`Local state safety: persistence overlaps generated ${name}. Preserve data and resolve placement.`);
 }
 if (lexical !== resolve(checkout, '.wrangler/state') || state !== lexical) throw new LocalStateSafetyError('Local state safety: canonical persistence must be contained at .wrangler/state without symlinks. Preserve existing data and recover it explicitly.');
 for (const name of ['.wrangler/reference', 'dist/server/.wrangler/state', 'dist/.wrangler/state', '.output/server/.wrangler/state']) {
  const legacy = resolve(checkout, name); await physicalPath(legacy);
  try { await lstat(legacy); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  throw new LocalStateSafetyError(`Local state safety: legacy state exists at ${name}. Preserve it and explicitly recover its data; nothing was moved or deleted.`);
 }
 for (const name of ['.wrangler', '.wrangler/state']) {
  let status; try { status = await lstat(resolve(checkout, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (status && (!status.isDirectory() || status.isSymbolicLink())) throw new LocalStateSafetyError('Local state safety: state must be a directory without symlinks. Preserve it and resolve placement.');
 }
 return state;
}
