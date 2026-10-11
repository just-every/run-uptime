import { readLocalSettings } from '../local-settings.mjs';
import { startLocalWorker } from '../local-worker.mjs';
const origin = process.env.UPTIME_LOCAL_ORIGIN;
const settings = await readLocalSettings(process.env.UPTIME_LOCAL_SETTINGS);
const worker = await startLocalWorker({
 host: process.env.UPTIME_LOCAL_HOST, port: Number(process.env.UPTIME_LOCAL_PORT), persist: process.env.UPTIME_LOCAL_PERSIST,
 bindings: { ...settings, AUTH_ORIGIN: origin, UPTIME_ORIGIN: origin, MAIL_PROVIDER: 'development', UPTIME_SYNTHETIC_PORT: process.env.UPTIME_SYNTHETIC_PORT },
});
const stop = async () => { await worker.dispose(); process.exit(0); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
