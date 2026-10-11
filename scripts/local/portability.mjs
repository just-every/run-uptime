import { lstat } from 'node:fs/promises';
import { relative } from 'node:path';
import { RerError, refuse, missing } from '../base-cli/cli/errors.mjs';
async function transfer(context, direction) {
 const { root, path, store, signal, operationToken } = context;
 const location = relative(root, path);
 if (/^(?:\.wrangler\/state|\.seed\/installer|\.rer\/local)(?:\/|$)/.test(location) || location === 'data/local-secrets.json') throw refuse('Archives must remain outside the reset inventory; use .exports within this checkout.');
 if (direction === 'export') {
  if (await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; })) throw refuse('Export requires a new archive path.');
  if (!await lstat(root + '/data/local-secrets.json').catch(error => { if (error.code !== 'ENOENT') throw error; })) throw missing('Private installation settings are missing. Run setup before exporting.');
 }
 await store.run('Applying local data migrations', 'pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'uptime-local', '--local', '--persist-to', '.wrangler/state'], { cwd: root, signal, env: { ...process.env, RER_LOCAL_OPERATION: operationToken, WRANGLER_SEND_METRICS: 'false' } });
 let receipt = '';
 const child = store.spawn('Moving complete Uptime product data', process.execPath, ['scripts/local/transfer.mjs', direction, path], { cwd: root, signal, env: { ...process.env, RER_LOCAL_OPERATION: operationToken } });
 child.stdout.on('data', bytes => { receipt += bytes; });
 const result = await new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
 let value; try { value = JSON.parse(receipt.trim().split('\n').at(-1)); } catch { throw new RerError('transfer_failed', 'The product transfer returned no integrity receipt.', 1); }
 if (result.code !== 0 || !value.ok) {
  if (value.refused) throw refuse('Uptime refused the transfer: preserve the archive, restore only into an empty destination, and inspect the private capture.');
  throw new RerError('transfer_failed', `The Uptime transfer failed (${/^[a-zA-Z_]+$/.test(value.reason) ? value.reason : 'product_transfer_failed'}); inspect the private capture.`, 1);
 }
 delete value.ok;
 return { target: 'local', ...value };
}
export const portability = { export: context => transfer(context, 'export'), import: context => transfer(context, 'import') };
