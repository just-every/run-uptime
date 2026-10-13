import {open, rename, rm, lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openCredential} from '../src/credential-file.mjs';
import {validMonitorId} from '../../src/domain/credential-binding.mjs';
export async function atomicJson(root, path, input, mode = 0o600, beforeRename = async () => {}) {
  const temporary = join(root, `.credential-${randomUUID()}.tmp`);
  let destination;
  try {
    destination = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await destination.writeFile(JSON.stringify(input) + '\n');
    await destination.chmod(mode); await destination.sync(); await destination.close(); destination = undefined;
    await beforeRename(); await rename(temporary, path);
  } finally { await destination?.close(); await rm(temporary, {force: true}); }
}
export async function bindCredential(directory, reference, monitorId) {
  if (!validMonitorId(monitorId)) throw Error('Invalid monitor identity');
  const source = await openCredential(directory, reference);
  try {
    const {input, stat, root, path} = source;
    if (input.monitorId !== undefined) {
      if (input.monitorId !== monitorId) throw Error('Already bound');
      return false; // Reruns preserve even the original bytes and inode.
    }
    await atomicJson(root, path, {...input, monitorId}, stat.mode & 0o777, async () => {
      const current = await lstat(path);
      if (current.dev !== stat.dev || current.ino !== stat.ino || current.mtimeMs !== stat.mtimeMs || current.size !== stat.size) throw Error('Credential changed during migration');
    });
    return true;
  } finally { await source.file.close(); }
}
