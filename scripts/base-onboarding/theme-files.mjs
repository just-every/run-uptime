import { lstat, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { readTheme } from './theme.mjs';

const types = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const limit = 8 * 1024 * 1024;

async function regularFile(root, relative) {
 let path = resolve(root);
 const parts = relative.split('/');
 for (const [index, part] of parts.entries()) {
  path = join(path, part);
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw Error(`${relative} is a symlink.`);
  if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) throw Error(`${relative} is not a regular file.`);
 }
 return readFile(path);
}

// `file` is root-relative and sits at the root of the directory the app serves
// as "/", so every url("/path") in the theme names a file beside it there.
// Returns the served files keyed by installer path, read once at start.
export async function loadSeedTheme(root, file) {
 if (typeof file !== 'string' || !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.css$/.test(file) || file.split('/').some(part => part === '..' || part === '.'))
  throw Error(`Declare the seed theme as a root-relative .css path without .. (got ${JSON.stringify(file)}).`);
 const text = (await regularFile(root, file).catch(error => { throw Error(`Cannot read seed theme ${file}: ${error.message}`); })).toString('utf8');
 const theme = readTheme(text, file), served = dirname(file);
 const files = new Map([['/rer-theme.css', { type: 'text/css', bytes: Buffer.from(text) }]]);
 let total = text.length;
 for (const path of theme.assets) {
  const bytes = await regularFile(root, join(served, path.slice(1))).catch(error => { throw Error(`Seed theme ${file} names ${path}, which the app does not serve from ${served}/: ${error.message}`); });
  total += bytes.length;
  if (total > limit) throw Error(`Seed theme ${file} and its files exceed 8 MiB.`);
  files.set(path, { type: types[path.slice(path.lastIndexOf('.'))], bytes });
 }
 return { ...theme, files };
}
