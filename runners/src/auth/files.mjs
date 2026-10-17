import {open, realpath, lstat, mkdir, rename, rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {credentialError} from './validation.mjs';
export async function ownedDirectory(path, create = false) {
  if (create) await mkdir(path, {mode: 0o700}).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || stat.mode & 0o077) throw credentialError();
  return realpath(path);
}
export async function readOwned(path, maxBytes) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.mode & 0o077 || stat.nlink !== 1 || stat.size > maxBytes) throw credentialError();
    const buffer = Buffer.alloc(maxBytes + 1), {bytesRead} = await file.read(buffer, 0, buffer.length, 0), after = await file.stat();
    if (bytesRead > maxBytes || bytesRead !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw credentialError();
    return {file, stat, bytes: buffer.subarray(0, bytesRead)};
  } catch (error) { await file.close(); throw error; }
}
export async function writeOwned(root, path, value) {
  const temporary = join(root, `.auth-${randomUUID()}.tmp`); let file;
  try {
    const bytes = JSON.stringify(value); if (Buffer.byteLength(bytes) > 65536) throw credentialError();
    file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await file.writeFile(bytes); await file.sync(); await file.close(); file = undefined;
    await rename(temporary, path);
    const directory = await open(root, constants.O_RDONLY); try { await directory.sync(); } finally { await directory.close(); }
  } finally { await file?.close(); await rm(temporary, {force: true}); }
}
