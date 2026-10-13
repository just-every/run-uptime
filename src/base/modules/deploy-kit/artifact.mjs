import { constants } from 'node:fs';
import { open, lstat, readdir } from 'node:fs/promises';
import { resolve, parse, join, extname } from 'node:path';
import { assert, hash, localPath } from './validation.mjs';
export const MAX_ARTIFACT = 48 * 1024 * 1024;
export async function regularBytes(path, limit = MAX_ARTIFACT) {
  const absolute = resolve(path); let prefix = parse(absolute).root;
  for (const part of absolute.slice(prefix.length).split('/').slice(0,-1)) { prefix = join(prefix,part); assert((await lstat(prefix)).isDirectory(),'nonregular-artifact-parent'); }
  const file = await open(absolute,constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const before = await file.stat(); assert(before.isFile() && before.nlink === 1 && before.size <= limit,'nonregular-or-oversize-artifact');
    const bytes = await file.readFile(); const after = await file.stat(); assert(bytes.length === before.size && before.ino === after.ino && before.mtimeMs === after.mtimeMs,'artifact-changed-during-read'); return bytes;
  } finally { await file.close(); }
}
export async function readArtifact(path, expected) {
  assert(/^[a-f0-9]{64}$/.test(expected.sha256 ?? ''),'missing-artifact-sha256');
  const bytes = await regularBytes(path); assert(hash(bytes) === expected.sha256,'artifact-digest-mismatch');
  let artifact; try { artifact = JSON.parse(bytes); } catch { throw new Error('invalid-artifact-json'); }
  validateArtifact(artifact);
  assert(artifact.source.sha === expected.sourceSha && artifact.run.id === expected.runId && artifact.run.attempt === expected.runAttempt,'artifact-custody-mismatch');
  return artifact;
}
export function validateArtifact(value) {
  assert(value?.version === 1 && /^[a-f0-9]{40}$/.test(value.source?.sha ?? '') && /^[a-f0-9]{40}$/.test(value.source?.tree ?? '') && /^\d+$/.test(value.run?.id ?? '') && /^\d+$/.test(value.run?.attempt ?? ''),'invalid-artifact-identity');
  assert(Array.isArray(value.modules) && value.modules.length > 0 && Array.isArray(value.assets) && Array.isArray(value.migrations), 'invalid-artifact-inventory');
  localPath(value.main);
  for (const list of [value.modules,value.assets]) {
    assert(list.length <= 10000 && new Set(list.map(x => x.path)).size === list.length,'invalid-artifact-file-count');
    for (const item of list) { localPath(item.path); assert(typeof item.base64 === 'string' && Buffer.from(item.base64,'base64').toString('base64') === item.base64 && hash(Buffer.from(item.base64,'base64')) === item.sha256,'invalid-artifact-file'); }
  }
  assert(value.modules.some(x => x.path === value.main),'artifact-main-missing');
  assert(value.modules.every(x => moduleType(x.path) !== undefined), 'unsupported-module-type');
}
export async function collectFiles(root, directory = '', budget = {bytes:0,count:0}) {
  const files = [];
  for (const entry of (await readdir(join(root,directory),{withFileTypes:true})).sort((a,b) => a.name.localeCompare(b.name))) {
    const path = directory ? `${directory}/${entry.name}` : entry.name; localPath(path);
    assert(!entry.isSymbolicLink(),'symlink-in-artifact');
    if (entry.isDirectory()) files.push(...await collectFiles(root,path,budget));
    else { assert(entry.isFile(),'nonregular-artifact'); const bytes = await regularBytes(join(root,path)); budget.bytes += bytes.length; budget.count++; assert(budget.bytes <= MAX_ARTIFACT && budget.count <= 10000,'artifact-inventory-too-large'); files.push({path,sha256:hash(bytes),base64:bytes.toString('base64')}); }
  }
  return files;
}
/** Built files a deployed Worker must serve: everything for the browser except documents
 * (the app answers those; asset html_handling redirects them) and dot paths (never public). */
export const publicAssetPaths = paths => paths.filter(path => !path.split('/').some(part => part.startsWith('.')) && extname(path) !== '.html');
export function moduleType(path) { return ({'.js':'application/javascript+module','.mjs':'application/javascript+module','.wasm':'application/wasm','.txt':'text/plain','.html':'text/plain','.sql':'text/plain','.bin':'application/octet-stream'})[extname(path)]; }
export function assetType(path) { return ({'.html':'text/html','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain'})[extname(path)] ?? 'application/octet-stream'; }
