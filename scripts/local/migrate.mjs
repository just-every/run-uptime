import {spawnSync} from 'node:child_process';
const [persist, ...flags] = process.argv.slice(2);
if (!persist || flags.some(flag => flag !== '--bind-existing')) throw Error('Local persistence directory required');
const migrations = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'uptime-local', '--local', '--persist-to', persist], {stdio: 'inherit'});
if (migrations.error || migrations.status !== 0) process.exit(migrations.status || 1);
if (process.env.UPTIME_CREDENTIAL_DIR) {
  const credentials = spawnSync(process.execPath, ['runners/migrations/0001-monitor-credentials.mjs', '--persist-to', persist, ...flags], {stdio: 'inherit'});
  if (credentials.error || credentials.status !== 0) process.exit(credentials.status || 1);
}
