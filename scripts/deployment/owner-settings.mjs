import { randomBytes } from 'node:crypto';
import { lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { privateDirectory, readPrivateFile, writePrivateFile } from '@runeditrun/rer/private-files';

export const secretsFile = ['.rer', 'deploy', 'production-secrets.json'].join('/');
export const secretNames = ['SESSION_SECRET', 'SETUP_TOKEN', 'OWNER_EMAIL', 'MAIL_FROM', 'SENDGRID_API_KEY', 'UPTIME_RUNNER_KEY'];
const allowedNames=[...secretNames, 'MAIL_PROVIDER', 'MAIL_API_KEY', 'MAIL_RELAY_URL', 'MAIL_PROVIDER_API_KEY', 'CLOUDFLARE_MAIL_API_KEY', 'MAIL_ACCOUNT_ID', 'UPTIME_HEARTBEAT_URL', 'UPTIME_START_URL'];
const generatedNames = ['SESSION_SECRET', 'SETUP_TOKEN', 'UPTIME_RUNNER_KEY'];
const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const string = value => typeof value === 'string' && value.trim() && !/[\r\n\0]/.test(value);
const missing = names => Object.assign(new Error('missing-input'), { inputs: names });

export function validateAccount(env, store) {
  store?.addSecrets?.([env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN].filter(value => typeof value === 'string'));
  const names = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
  const absent = names.filter(name => !string(env[name]));
  if (absent.length) throw missing(absent);
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID) || /\s/.test(env.CLOUDFLARE_API_TOKEN)) throw new Error('invalid-cloudflare-input');
}

function mailInputs(values) {
 const provider=values.MAIL_PROVIDER??'sendgrid';if(!['sendgrid','resend','cloudflare','rer'].includes(provider))throw new Error('invalid-mail-provider');
 return provider==='rer'?['MAIL_API_KEY','MAIL_RELAY_URL']:provider==='sendgrid'?['SENDGRID_API_KEY']:provider==='resend'?['MAIL_PROVIDER_API_KEY']:['CLOUDFLARE_MAIL_API_KEY','MAIL_ACCOUNT_ID'];
}
function validateSecrets(values) {
  const absent = [...generatedNames,'OWNER_EMAIL','MAIL_FROM',...mailInputs(values)].filter(name => !string(values[name]));
  if (absent.length) throw missing(absent);
  if (generatedNames.some(name => values[name].length < 32) || !email.test(values.OWNER_EMAIL) || !email.test(values.MAIL_FROM)) throw new Error('invalid-owner-secret-input');
  if (Object.keys(values).some(name => !allowedNames.includes(name))) throw new Error('invalid-owner-secret-file');
}

export async function ownerSecrets(root, { env = process.env, store } = {}) {
  const supplied = Object.fromEntries(allowedNames.filter(name => env[name] !== undefined).map(name => [name, env[name]]));
  store?.addSecrets?.(Object.values(supplied).filter(value => typeof value === 'string'));
  const directory = await privateDirectory(root, ['.rer', 'deploy']);
  await writePrivateFile(join(directory, '.gitignore'), '*\n');
  const path = join(root, secretsFile);
  const read = async () => {
    const values = JSON.parse(await readPrivateFile(path));
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('invalid-owner-secret-file');
    store?.addSecrets?.(Object.values(values).filter(value => typeof value === 'string'));
    validateSecrets(values);
    return values;
  };
  try { return await read(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Validate owner inputs before generating or publishing anything. Hosted keys
  // have their own custody; local-installation values are never consulted.
  const absent = ['OWNER_EMAIL', 'MAIL_FROM', ...mailInputs(supplied)].filter(name => !string(supplied[name]));
  if (absent.length) throw missing(absent);
  const values = { ...supplied };
  for (const name of generatedNames) if (values[name] === undefined) values[name] = randomBytes(32).toString('hex');
  store?.addSecrets?.(Object.values(values));
  validateSecrets(values);
  try { await writePrivateFile(path, JSON.stringify(values, null, 2) + '\n', true); }
  catch (error) { if (error.code !== 'EEXIST') throw error; return read(); }
  return values;
}

// Production deploys the generated secrets in the shared settings file. Every
// other environment has its own SESSION_SECRET, SETUP_TOKEN and UPTIME_RUNNER_KEY,
// generated on its first deploy and kept for repeats, so a session, setup token or
// runner key from one environment is never valid on another. An environment
// deployed before this change keeps the values it was deployed with, because the
// kit never replaces a secret its Worker already has: one deployed with every
// shared value (its kit record exists) keeps them all, and one with only its own
// SETUP_TOKEN keeps the shared SESSION_SECRET and UPTIME_RUNNER_KEY.
export const environmentNames = ['SESSION_SECRET', 'SETUP_TOKEN', 'UPTIME_RUNNER_KEY'];
export const environmentSecretsFile = environment => `.rer/deploy/environments/${environment}/secrets.json`;
export async function environmentSecrets(root, environment, shared, { store } = {}) {
  const pick = values => Object.fromEntries(environmentNames.map(name => [name, values[name]]));
  if (environment === 'production') return pick(shared);
  const path = join(await privateDirectory(root, ['.rer', 'deploy', 'environments', environment]), 'secrets.json');
  const read = async () => {
    const values = JSON.parse(await readPrivateFile(path));
    const names = values && typeof values === 'object' && !Array.isArray(values) ? Object.keys(values).sort().join() : '';
    if (![environmentNames.join(), 'SETUP_TOKEN'].includes(names) || Object.values(values).some(value => !string(value) || value.length < 32)) throw new Error('invalid-owner-secret-file');
    store?.addSecrets?.(Object.values(values));
    return values;
  };
  const write = async (values, exclusive) => {
    store?.addSecrets?.(Object.values(values));
    await writePrivateFile(path, JSON.stringify(pick(values), null, 2) + '\n', exclusive);
    return pick(values);
  };
  const deployed = await lstat(join(root, '.rer', 'deploy', `${environment}.json`)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  // Without the kit record no Worker holds this file's values: `rer deploy --remove`
  // drops the record but runs no Uptime hook, so a removed environment's file (which
  // may hold the shared values) is replaced and the recreated environment starts fresh.
  if (!deployed) await rm(path, { force: true });
  let saved;
  try { saved = await read(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (saved?.SESSION_SECRET) return pick(saved);
  if (saved) return write({ ...shared, SETUP_TOKEN: saved.SETUP_TOKEN }, false);
  const values = deployed ? shared : Object.fromEntries(environmentNames.map(name => [name, randomBytes(32).toString('hex')]));
  try { return await write(values, true); }
  catch (error) { if (error.code !== 'EEXIST') throw error; return pick(await read()); }
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
