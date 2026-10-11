import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { contained } from './project.mjs';

// SC-05.auth-copy: the operator-auth layers a seed copied from Base stay the
// bytes of the Base revision it pinned. A seed records its copies in
// base-copies.json (edition authoring) or composition.lock.json /
// foundation.lock.json (composed foundations); each records the SHA-256 of the
// Base bytes it copied. One revision pins every copy, and each drifted, missing
// or unrecorded file is named. A seed that imports Base in place has no copy.
const ORIGIN = 'modules/operator-auth';
const within = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function json(root, path) { try { return JSON.parse(await readFile(await contained(root, path), 'utf8')); } catch { return null; } }

// Every file under a copied directory, so an added file is named too.
async function walk(root, path) {
 let stat; try { stat = await lstat(await contained(root, path)); } catch { return []; }
 if (stat.isFile()) return [path];
 if (!stat.isDirectory()) return [path];
 const files = [];
 for (const entry of await readdir(join(root, path), { withFileTypes: true })) files.push(...await walk(root, `${path}/${entry.name}`));
 return files;
}

// [{ path, revision, files: { local path: sha256 } }] for every recorded auth copy.
async function recordedCopies(root) {
 const copies = [];
 const record = await json(root, 'base-copies.json');
 for (const copy of record?.copies ?? []) {
  if (typeof copy?.originPath === 'string' && within(copy.originPath, ORIGIN) && copy.files && typeof copy.files === 'object') copies.push({ path: copy.path, revision: copy.revision, files: copy.files, directory: copy.originPath === ORIGIN });
 }
 for (const name of ['composition.lock.json', 'foundation.lock.json']) {
  const lock = await json(root, name);
  if (!lock?.files) continue;
  const revision = lock.repositories?.base?.commit ?? lock.base?.commit;
  const files = Object.fromEntries(Object.entries(lock.files).filter(([, file]) => typeof file?.source === 'string' && within(file.source, ORIGIN) && typeof file.sha256 === 'string').map(([path, file]) => [path, file.sha256]));
  const directories = [...new Set(Object.entries(lock.files).filter(([, file]) => typeof file?.source === 'string' && within(file.source, ORIGIN) && !file.source.endsWith('.sql'))
   .map(([path, file]) => path.slice(0, path.length - (file.source.length - ORIGIN.length))))];
  if (Object.keys(files).length) copies.push({ path: directories[0] ?? null, revision, files, directory: directories.length === 1 });
 }
 return copies;
}

export async function authCopyClauses(root) {
 const copies = await recordedCopies(root);
 if (!copies.length) return [];
 const clauses = [];
 const revisions = [...new Set(copies.map(copy => copy.revision))];
 clauses.push(['SC-05.auth-copy.pin', revisions.length === 1 && /^[a-f0-9]{40}$/.test(revisions[0] ?? ''), `Copy every operator-auth layer from one pinned Base revision; the seed records ${revisions.join(', ') || 'none'}.`]);
 for (const copy of copies) {
  for (const [path, expected] of Object.entries(copy.files)) {
   let actual = null; try { actual = sha256(await readFile(await contained(root, path))); } catch {}
   clauses.push([`SC-05.auth-copy.${path}`, actual === expected, actual === null
    ? `${path} is missing; restore it from Base ${copy.revision}.`
    : `${path} differs from Base ${copy.revision}; restore the copied bytes or record a new pin with refresh-base.`]);
  }
  if (copy.directory && copy.path) {
   for (const path of await walk(root, copy.path)) {
    if (!Object.hasOwn(copy.files, path) && !path.split('/').some(part => ['tests', 'node_modules', '.DS_Store'].includes(part))) {
     clauses.push([`SC-05.auth-copy.${path}`, false, `${path} is not part of Base ${copy.revision}'s operator-auth; remove it or keep seed code outside the copied layers.`]);
    }
   }
  }
 }
 return clauses;
}
