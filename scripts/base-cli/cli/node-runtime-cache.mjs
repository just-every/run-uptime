import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { missing } from './errors.mjs';

export const nodeCache = () => join(homedir(), '.rer', 'node');
export const runtimeName = version => `node-v${version}-${process.platform}-${process.arch}`;
export const runtimeBinary = directory => join(directory, ...(process.platform === 'win32' ? ['node.exe'] : ['bin', 'node']));
export const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

export async function binaryDigest(path) {
 const hash = createHash('sha256');
 for await (const chunk of createReadStream(path)) hash.update(chunk);
 return hash.digest('hex');
}
async function owned(path, directory) {
 const stat = await lstat(path);
 if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o022)) throw Error('Unsafe runtime cache placement.');
}
export async function prepareNodeCache() {
 const cache = nodeCache();
 for (const path of [join(homedir(), '.rer'), cache]) {
  await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  try { await owned(path, true); } catch { throw missing(`Node cache directory must be an owned, non-linked directory without group/other write access: ${path}. Correct its placement and permissions before retrying.`); }
 }
 return cache;
}
export async function cachedRuntime(version) {
 const directory = join(nodeCache(), runtimeName(version));
 try { await lstat(directory); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
 try {
  await owned(join(homedir(), '.rer'), true); await owned(nodeCache(), true); await owned(directory, true);
  const binary = runtimeBinary(directory), receipt = join(directory, '.rer-verified.json');
  if (process.platform !== 'win32') await owned(join(directory, 'bin'), true);
  await owned(binary, false); await owned(receipt, false);
  const record = JSON.parse(await readFile(receipt, 'utf8'));
  if (record.version !== version || !/^[a-f0-9]{64}$/.test(record.releaseSha256) || record.binarySha256 !== await binaryDigest(binary)) throw Error('Node cache integrity mismatch.');
  return binary;
 } catch {
  throw missing(`The cached Node runtime is unsafe or incomplete. Preserve it for inspection with: mv ${shellQuote(directory)} ${shellQuote(directory + '.quarantine-' + Date.now())}. Then rerun the original rer command to acquire a verified release.`);
 }
}
export async function recordRuntime(directory, version, releaseSha256) {
 await writeFile(join(directory, '.rer-verified.json'), JSON.stringify({ version, releaseSha256, binarySha256: await binaryDigest(runtimeBinary(directory)) }) + '\n', { flag: 'wx', mode: 0o600 });
}
