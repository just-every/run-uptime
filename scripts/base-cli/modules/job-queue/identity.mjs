import { createServer, createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chmod, unlink } from 'node:fs/promises';
import { processInfo } from './processes.mjs';

// A lifetime nonce supplements Darwin's second-resolution ps start time.
// It also distinguishes two library clients in the same Node process.
export async function identity() {
  const token = randomUUID(), socket = join(tmpdir(), `rer-job-${token}.sock`);
  // Darwin's TMPDIR can be long; use the short system temporary directory then.
  const path = Buffer.byteLength(socket) < 100 ? socket : `/tmp/rer-job-${token}.sock`;
  const server = createServer(client => { client.end(token); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
  await chmod(path, 0o600);
  const { title, ...processIdentity } = await processInfo(process.pid);
  const info = { ...processIdentity, token, socket: path };
  return { info, async close() {
    await new Promise(resolve => server.close(resolve));
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
  } };
}

export async function alive(owner) {
  const current = await processInfo(owner.pid);
  if (!current || current.zombie || current.start !== owner.start) return false;
  if (!owner.socket || !owner.token) throw Error('Lease lacks lifetime identity');
  return new Promise((resolve, reject) => {
    const connection = createConnection(owner.socket);
    let body = '';
    connection.setTimeout(3000, () => connection.destroy(Error('Owner identity probe timed out; refusing admission')));
    connection.on('data', data => { body += data; if (body.length > 128) connection.destroy(Error('Invalid owner identity')); });
    connection.on('end', () => resolve(body === owner.token));
    connection.on('error', async error => {
      if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) resolve(false);
      else if (error.code === 'ECONNRESET') {
        // Listener shutdown can reset a probe after the initial PID check.
        // Reclaim proven death; otherwise retain the owner until the next sample.
        try {
          const after = await processInfo(owner.pid);
          resolve(Boolean(after && !after.zombie && after.start === owner.start));
        } catch (failure) { reject(failure); }
      }
      else reject(error);
    });
  });
}
