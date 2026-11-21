import { lstat } from 'node:fs/promises';
import { relative } from 'node:path';
import { RerError, refuse, missing } from '@runeditrun/rer/errors';
async function transfer(context, direction) {
 const { root, path, store, signal, operationToken } = context;
 const location = relative(root, path);
 if (/^(?:\.wrangler\/state|\.seed\/installer|\.rer\/local)(?:\/|$)/.test(location) || location === 'data/local-secrets.json') throw refuse('Archives must remain outside the reset inventory; use exports/ within this checkout.');
 if (!await lstat(root + '/data/local-secrets.json').catch(error => { if (error.code !== 'ENOENT') throw error; })) throw missing('OWNER_EMAIL and installation settings are required. Run rer setup --owner-email EMAIL --non-interactive before importing or exporting.');
 if (direction === 'export') {
  if (await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; })) throw refuse('Export requires a new archive path.');
 }
 await store.run('Applying local data migrations', process.execPath, ['scripts/local/migrate.mjs', '.wrangler/state'], { cwd: root, signal, env: { ...process.env, RER_LOCAL_OPERATION: operationToken, WRANGLER_SEND_METRICS: 'false' } });
 const child = store.spawn('Moving complete Uptime product data', process.execPath, ['scripts/local/transfer.mjs', direction, path], {
  cwd: root, signal, env: { ...process.env, RER_LOCAL_OPERATION: operationToken }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
 });
 let receipt;
 child.on('message', message => { receipt = message; });
 const code = await new Promise(resolve => child.once('close', resolve));
 if (!receipt || typeof receipt.ok !== 'boolean') throw new RerError('transfer_failed', 'Uptime could not confirm the transfer. Inspect the private capture before trying again.', 1);
 const { ok, ...value } = receipt;
 if (code !== 0 || !ok) {
  if (value.reason === 'legacy_archive_unbound') throw refuse('This archive was exported by Uptime 0.1.2 or earlier, before archives bound their metadata, and cannot be imported. Upgrade the source installation to this version and export it again. A console archive (Runner / archive) still restores into an empty installation.');
  if (['session_required','second_factor_required','fresh_second_factor_required'].includes(value.reason)) throw refuse('Archive transfer requires a signed-in owner or administrator and a recent second factor. Start dev, get a native session, and verify a second factor. Set UPTIME_ACCESS_COOKIE to that private cookie, then stop dev and retry within five minutes. Follow Move your data in the Uptime docs.');
  if (value.reason==='permission_required') throw refuse('This session does not have workspace archive permission.');
  if (value.refused) throw refuse('Uptime refused the transfer: preserve the archive, restore only into an empty destination, and inspect the private capture.');
  throw new RerError('transfer_failed', 'Uptime could not finish the transfer. Inspect the private capture before trying again.', 1);
 }
 store.report(direction === 'export' ? `Archived Uptime data to ${location}.` : `Restored Uptime data from ${location}.`);
 return { target: 'local', ...value };
}
export const portability = { export: context => transfer(context, 'export'), import: context => transfer(context, 'import') };
