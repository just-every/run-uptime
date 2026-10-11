import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { matchesRuntime } from './node-runtime-discovery.mjs';
import { prepareNodeCache, runtimeBinary, runtimeName, recordRuntime, cachedRuntime } from './node-runtime-cache.mjs';

async function download(url, destination, limit, signal) {
 const response = await fetch(url, { signal, redirect: 'error' });
 if (!response.ok || !response.body) throw Error('The official Node release could not be downloaded.');
 let bytes = 0;
 const bounded = new Transform({ transform(chunk, encoding, callback) {
  bytes += chunk.length; callback(bytes > limit ? Error('Node release download exceeds its size limit.') : null, chunk);
 } });
 await pipeline(response.body, bounded, createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal });
}

async function extract(archive, directory, signal) {
 const child = spawn('tar', ['-xzf', archive, '-C', directory], { stdio: 'ignore', signal });
 await new Promise((resolve, reject) => {
  let failure;
  child.once('error', error => { failure = error; });
  child.once('close', code => code === 0 && !failure ? resolve() : reject(failure ?? Error('Verified Node release extraction failed.')));
 });
}

export async function downloadRuntime(version, cancellation) {
 if (!['darwin', 'linux'].includes(process.platform) || !['x64', 'arm64', 'armv7l', 'ppc64', 's390x'].includes(process.arch)) throw Error('Automatic Node download is unavailable on this platform.');
 const cache = await prepareNodeCache(), name = runtimeName(version), filename = `${name}.tar.gz`;
 const url = `https://nodejs.org/dist/v${version}/`;
 const temporary = await mkdtemp(join(cache, '.download-'));
 const signal = AbortSignal.any([cancellation, AbortSignal.timeout(60000)]);
 try {
  const sums = join(temporary, 'SHASUMS256.txt'), archive = join(temporary, filename);
  await download(url + 'SHASUMS256.txt', sums, 1024 * 1024, signal);
  const expected = (await readFile(sums, 'utf8')).split(/\r?\n/).map(line => line.trim().split(/\s+/)).find(parts => parts[1] === filename)?.[0];
  if (!/^[a-f0-9]{64}$/.test(expected ?? '')) throw Error('The official release checksum is missing.');
  await download(url + filename, archive, 150 * 1024 * 1024, signal);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== expected) throw Error('Official Node release checksum verification failed; nothing was extracted or executed.');
  // This is the first point at which any downloaded content can be executed.
  await extract(archive, temporary, signal);
  const extracted = join(temporary, name), binary = runtimeBinary(extracted);
  if (!matchesRuntime(binary, version)) throw Error('Verified Node release did not report the project pin.');
  await chmod(extracted, 0o700);
  await recordRuntime(extracted, version, expected);
  const destination = join(cache, name);
  try { await rename(extracted, destination); }
  catch (error) {
   if (!['EEXIST', 'ENOTEMPTY'].includes(error.code) || !(await cachedRuntime(version))) throw error;
  }
  return runtimeBinary(destination);
 } finally { await rm(temporary, { recursive: true, force: true }); }
}
