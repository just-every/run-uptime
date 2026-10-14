import { readLocalSettings } from '../local-settings.mjs';
import { startLocalWorker } from '../local-worker.mjs';
import { migrationHistory } from './migration-history.mjs';
import {spawnSync} from 'node:child_process';
const [persist, ...flags] = process.argv.slice(2);
if (!persist || flags.some(flag => flag !== '--bind-existing')) throw Error('Local persistence directory required');
const worker = await startLocalWorker({ persist, bindings: await readLocalSettings(process.env.UPTIME_LOCAL_SETTINGS), assets: false });
let tracked;
try { ({ tracked } = await migrationHistory(await worker.getD1Database('DB'), process.cwd(), { upgrade: true })); }
finally { await worker.dispose(); }
const migrations = tracked ? { status: 0 } : spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'uptime-local', '--local', '--persist-to', persist], {stdio: 'inherit'});
if (migrations.error || migrations.status !== 0) process.exit(migrations.status || 1);
if (process.env.UPTIME_CREDENTIAL_DIR) {
  const credentials = spawnSync(process.execPath, ['runners/migrations/0001-monitor-credentials.mjs', '--persist-to', persist, ...flags], {stdio: 'inherit'});
  if (credentials.error || credentials.status !== 0) process.exit(credentials.status || 1);
}
