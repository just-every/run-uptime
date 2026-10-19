import { keepSecrets, savedInputs } from './secret-custody.mjs';

export const secretNames = ['SESSION_SECRET', 'SETUP_TOKEN', 'OWNER_EMAIL', 'MAIL_FROM', 'SENDGRID_API_KEY', 'UPTIME_RUNNER_KEY'];
const allowedNames = [...secretNames, 'MAIL_PROVIDER', 'MAIL_API_KEY', 'MAIL_RELAY_URL', 'MAIL_PROVIDER_API_KEY', 'CLOUDFLARE_MAIL_API_KEY', 'MAIL_ACCOUNT_ID', 'UPTIME_HEARTBEAT_URL', 'UPTIME_START_URL'];
const string = value => typeof value === 'string' && value.trim() && !/[\r\n\0]/.test(value);
const missing = names => Object.assign(new Error('missing-input'), { inputs: names });
export function validateAccount(env, store) {
 store?.addSecrets?.([env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN].filter(value => typeof value === 'string'));
 const absent = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'].filter(name => !string(env[name]));
 if (absent.length) throw missing(absent);
 if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID) || /\s/.test(env.CLOUDFLARE_API_TOKEN)) throw new Error('invalid-cloudflare-input');
}
export async function ownerSecrets(root, environment, { env = process.env, store } = {}) {
 const supplied = Object.fromEntries(allowedNames.filter(name => env[name] !== undefined).map(name => [name, env[name]]));
 return keepSecrets(root, environment, { ...supplied, ...await savedInputs(root, environment) }, store);
}

// Only these credentials may cross the hosting command boundary. NODE_OPTIONS,
// NODE_PATH, Wrangler login state, unrelated provider keys and local secrets do
// not inherit into the controller.
export function ownerEnvironment(env) {
  return Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', ...allowedNames]
    .filter(name => typeof env[name] === 'string').map(name => [name, env[name]]));
}
export function buildEnvironment(env = process.env) {
  return { ...(env.PATH ? { PATH: env.PATH } : {}), ...(env.TMPDIR ? { TMPDIR: env.TMPDIR } : {}), ...(env.COREPACK_HOME ? { COREPACK_HOME: env.COREPACK_HOME } : {}), COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', COREPACK_ENABLE_AUTO_PIN: '0', COREPACK_ENV_FILE: '0', CI: 'true', GIT_CONFIG_NOSYSTEM: '1', WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' };
}
