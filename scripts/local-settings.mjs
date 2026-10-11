import setupManifest from '../rer-setup.json' with { type: 'json' };
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { prepareSettings, readSettings } from './base-onboarding/adapter-settings.mjs';
import { freePort, portValue } from './local-ports.mjs';
export const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
export const defaultSettingsPath = resolve(rootDirectory, 'data/local-secrets.json');
export const generatedNames = setupManifest.fields.filter(field => field.kind === 'secret' && field.generate).map(field => field.name);
export const settingsDefinition = ({ file = 'data/local-secrets.json' } = {}) => ({
 file, format: 'json', originKey: 'AUTH_ORIGIN',
 values: ({ input, origin }) => ({
  AUTH_ORIGIN: origin, UPTIME_ORIGIN: origin, OWNER_EMAIL: input.OWNER_EMAIL ?? input.email,
  MAIL_PROVIDER: 'development', MAIL_FROM: input.MAIL_FROM ?? 'auth@localhost.test',
 }),
});
function settingsLocation(path) {
 path = resolve(path);
 const root = path === defaultSettingsPath ? rootDirectory : dirname(path);
 return { root, file: relative(root, path) };
}
export async function readLocalSettings(path = defaultSettingsPath) {
 const { root, file } = settingsLocation(path);
 const { values } = await readSettings(root, settingsDefinition({ file }));
 if (!generatedNames.every(name => typeof values[name] === 'string' && values[name].length >= 32) || new Set(generatedNames.map(name => values[name])).size !== generatedNames.length) throw Error('Independent installation credentials required; run setup.');
 return values;
}
export function savedOrigin(values, requestedPort) {
 let url;
 try { url = new URL(values.UPTIME_ORIGIN); } catch {}
 if (!url || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port || url.origin !== values.UPTIME_ORIGIN) throw Error('A saved loopback origin is required; run setup.');
 if (requestedPort !== undefined && requestedPort !== '' && portValue(requestedPort) !== Number(url.port)) throw Error('The requested control port differs from the saved installation origin; use the saved port.');
 return url.origin;
}
export async function prepareLocalSettings({ path = defaultSettingsPath, input = {}, controlPort, store = { step: async () => {}, addSecrets() {} } } = {}) {
 path = resolve(path); const { root, file } = settingsLocation(path); await mkdir(root, { recursive: true, mode: 0o700 });
 const secrets = settingsDefinition({ file });
 const context = { root, input: { ...input, OWNER_EMAIL: input.OWNER_EMAIL ?? input.email }, store, manifest: setupManifest, operationToken: path === defaultSettingsPath ? process.env.RER_LOCAL_OPERATION : undefined };
 const hooks = { secrets, origin: async () => {
  const { values } = await readSettings(root, secrets);
  if (values.UPTIME_ORIGIN) return savedOrigin(values, controlPort);
  return `http://127.0.0.1:${await freePort(controlPort)}`;
 } };
 await prepareSettings(context, hooks);
 return { ...context, vars: await readLocalSettings(path) };
}
