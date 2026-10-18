import {constants} from 'node:fs';
import {lstat, open, realpath} from 'node:fs/promises';
import {isAbsolute, join, resolve as absolutePath} from 'node:path';
import {Resolver} from 'node:dns/promises';
import {isIP} from 'node:net';
import {normalizePrivateGrant, privateGrantAllows, privateTarget} from '../../src/domain/private-target.mjs';
import {ProbeError} from './probe-error.mjs';

const MAX_GRANT_BYTES = 16 * 1024;
const RUNNER_ID = /^self-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deny = reason => { throw new ProbeError('grant', reason); };
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const hostOf = url => url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
const portOf = url => Number(url.port || (url.protocol === 'https:' ? 443 : 80));

function protectedDirectory(info, uid) {
  return info.isDirectory() && !info.isSymbolicLink() && info.uid === uid && (info.mode & 0o7777) === 0o700;
}

function protectedFile(info, uid) {
  return info.isFile() && info.uid === uid && info.nlink === 1 &&
    (info.mode & 0o7777) === 0o600 && info.size > 0 && info.size <= MAX_GRANT_BYTES;
}

async function readPrivateGrant(directory, reference) {
  let folder, file;
  try {
    if (typeof process.getuid !== 'function' || typeof directory !== 'string' || !isAbsolute(directory)) deny('Private grant directory is unavailable.');
    const uid = process.getuid(), path = absolutePath(directory);
    // An ancestor symlink is refused too, including a symlink to the same owned directory.
    if (await realpath(path) !== path) deny('Private grant directory is not protected.');
    const before = await lstat(path);
    if (!protectedDirectory(before, uid)) deny('Private grant directory is not protected.');
    folder = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    if (!sameFile(before, await folder.stat())) deny('Private grant directory changed.');
    file = await open(join(path, `${reference}.json`), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!protectedFile(info, uid)) deny('Private grant file is not protected.');
    const currentDirectory = await lstat(path);
    if (!protectedDirectory(currentDirectory, uid) || !sameFile(before, currentDirectory) || await realpath(path) !== path) deny('Private grant directory changed.');
    // Read through the inspected descriptor, with a bound even if another writer grows it.
    const bytes = Buffer.alloc(MAX_GRANT_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const {bytesRead} = await file.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await file.stat(), afterDirectory = await lstat(path);
    if (!protectedFile(after, uid) || !sameFile(info, after) || length !== info.size ||
        after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs ||
        !protectedDirectory(afterDirectory, uid) || !sameFile(before, afterDirectory) || await realpath(path) !== path) deny('Private grant changed while being read.');
    return normalizePrivateGrant(JSON.parse(bytes.subarray(0, length).toString('utf8')));
  } catch {
    // Filesystem errors and policy errors may carry paths or untrusted JSON; never forward them.
    deny('Private grant is missing, invalid, or not protected.');
  } finally {
    await file?.close().catch(() => {});
    await folder?.close().catch(() => {});
  }
}

/** A claim-scoped resolver. Each target or redirect obtains a fresh local grant and socket pin. */
export function createPrivateAccess(task, probe, {directory = process.env.UPTIME_PRIVATE_GRANT_DIR, now = Date.now, controlOrigin} = {}) {
  const definition = task?.definition;
  const runnerId = definition?.assignments?.[probe]?.runnerId;
  const monitorId = task?.monitorId, acceptUntil = task?.acceptUntil;
  const reference = definition?.privateGrantRef;
  if (typeof task?.id !== 'string' || !task.id.trim() || typeof monitorId !== 'string' || !monitorId.trim() ||
      typeof probe !== 'string' || !Array.isArray(task.probes) || !task.probes.includes(probe) ||
      definition?.network !== 'private' || typeof runnerId !== 'string' || !RUNNER_ID.test(runnerId) ||
      typeof reference !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(reference) ||
      !Number.isSafeInteger(acceptUntil) || typeof now !== 'function') deny('Private runner claim is invalid.');
  // Snapshot authority from the authenticated claim; later definition mutations cannot widen it.
  const claimTime = () => {
    const time = now();
    if (!Number.isSafeInteger(time) || time < 0 || time >= acceptUntil) deny('Private runner claim has expired.');
    return time;
  };
  claimTime();
  let control;
  if (controlOrigin !== undefined) {
    try {
      control = new URL(controlOrigin);
      if (!['http:', 'https:'].includes(control.protocol)) deny('Private control origin is invalid.');
    } catch { deny('Private control origin is invalid.'); }
  }
  return async function resolve(url, signal) {
    claimTime();
    let target;
    try { target = privateTarget(url instanceof URL ? url.href : url); }
    catch { deny('Private target is forbidden.'); }
    const host = hostOf(target), port = portOf(target);
    if (control && (target.origin === control.origin || (host === hostOf(control) && port === portOf(control)))) deny('Private target cannot be the control service.');
    const checkSignal = () => {
      if (signal?.aborted) throw new ProbeError('dns', 'Private hostname resolution was cancelled.');
    };
    checkSignal();
    const grant = await readPrivateGrant(directory, reference);
    const checkGrant = () => {
      const time = claimTime();
      if (grant.runnerId !== runnerId || grant.monitorId !== monitorId || time >= grant.expiresAt ||
          !grant.hosts.includes(host) || !grant.ports.includes(port)) deny('Private grant does not cover this claim and target.');
      return time;
    };
    checkGrant();
    checkSignal();
    let addresses;
    if (isIP(host)) addresses = [host];
    else {
      const resolver = new Resolver({timeout: 1000, tries: 1});
      const cancel = () => resolver.cancel();
      signal?.addEventListener('abort', cancel, {once: true});
      try {
        checkSignal();
        const results = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]);
        checkGrant();
        checkSignal();
        if (results.some(result => result.status === 'rejected' && !['ENODATA', 'ENOTFOUND'].includes(result.reason?.code))) throw new ProbeError('dns', 'Private hostname resolution failed.');
        addresses = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
        if (!addresses.length) throw new ProbeError('unresolved', 'The private hostname has no address records.');
      } finally { signal?.removeEventListener('abort', cancel); }
    }
    checkGrant();
    checkSignal();
    // Every answer must be allowed before any one answer can be returned to a transport.
    if (addresses.some(address => !isIP(address) || !privateGrantAllows(grant, {host, address, port, runnerId, monitorId, now: claimTime()}))) deny('Private grant does not allow every resolved address.');
    checkGrant();
    return {address: addresses[0], family: isIP(addresses[0])};
  };
}
