import {publicTarget} from './public-target.mjs';
import { configureClaim } from '../base/modules/owner-claim/verify.mjs';

// Shared by Worker entry points and Node launchers. Diagnostics contain names only.
const text = value => typeof value === 'string' && value.length > 0 && value === value.trim() && !/[\r\n\0]/.test(value);
const email = value => text(value) && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const sender = value => email(value) || (text(value) && /^[^<>]+ <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/.test(value));
const secret = minimum => value => text(value) && value.length >= minimum && value.length <= 1024;
const port = value => typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 65535;
const local = env => env.UPTIME_LOCAL_REVIEW === 'true';
function origin(value, env, runner = false) {
 try {
  const url = new URL(value);
  if (!text(value) || url.origin !== value || url.username || url.password) return false;
  if (!local(env)) return url.protocol === 'https:';
  if (runner) return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1' && port(url.port));
  return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
 } catch { return false; }
}
const externalOrigin = (value, env) => origin(value, { ...env, UPTIME_LOCAL_REVIEW: 'false' }) || (local(env) && origin(value, env));
const claimNames = ['RER_OWNER_CLAIM_ISSUER', 'RER_OWNER_CLAIM_INSTALLATION_ID', 'RER_OWNER_CLAIM_APP_ORIGIN', 'RER_OWNER_CLAIM_PUBLIC_KEYS'];
const editorNames = ['RER_MANAGEMENT_ORIGIN', 'RER_INSTALLATION_ID'];
const any = names => env => names.some(name => env[name] !== undefined);
const app = ['worker', 'settings', 'deploy'];
// Requiredness is evaluated against actual bindings, never a request URL or a defaulted secret.
export const configurationTable = Object.freeze([
 { name: 'DB', scopes: ['worker'], required: 'always', valid: value => value && typeof value.prepare === 'function' && typeof value.batch === 'function' },
 { name: 'UPTIME_ORIGIN', scopes: ['worker', 'settings'], required: 'always', valid: origin },
 { name: 'OWNER_EMAIL', scopes: app, required: 'always', valid: email },
 { name: 'SESSION_SECRET', scopes: app, required: 'always', valid: secret(32) },
 { name: 'SETUP_TOKEN', scopes: app, required: 'always', valid: secret(32) },
 { name: 'UPTIME_RUNNER_KEY', scopes: [...app, 'runner'], required: 'always', valid: secret(24) },
 { name: 'MAIL_FROM', scopes: app, required: 'always', valid: sender },
 { name: 'SENDGRID_API_KEY', scopes: app, required: 'conditional', when: env => !local(env) && (env.MAIL_PROVIDER ?? 'sendgrid') === 'sendgrid', valid: value => text(value) && !/\s/.test(value) },
 { name: 'MAIL_PROVIDER_API_KEY', scopes: app, required: 'conditional', when: env => env.MAIL_PROVIDER === 'resend', valid: value => text(value) && !/\s/.test(value) },
 { name: 'CLOUDFLARE_MAIL_API_KEY', scopes: app, required: 'conditional', when: env => env.MAIL_PROVIDER === 'cloudflare', valid: value => text(value) && !/\s/.test(value) },
 { name: 'MAIL_ACCOUNT_ID', scopes: app, required: 'conditional', when: env => env.MAIL_PROVIDER === 'cloudflare', valid: value => text(value) && !/\s/.test(value) },
 { name: 'UPTIME_HEARTBEAT_URL', scopes: app, required: 'optional', valid: value => {try{return publicTarget(value).protocol==='https:'}catch{return false}} },
 ...['UPTIME_HEARTBEAT_INTERVAL_MS','UPTIME_RUNNER_STALE_MS','UPTIME_DIGEST_INTERVAL_MS'].map(name=>({name,scopes:app,required:'optional',valid:value=>text(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0})),
 ...['UPTIME_WATCH_AFTER_MS','UPTIME_WATCH_REPEAT_MS'].map(name=>({name,scopes:[...app,'runner'],required:'optional',valid:value=>text(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0})),
 ...['UPTIME_WATCH_WEBHOOK_URL','UPTIME_WATCH_SLACK_URL'].map(name=>({name,scopes:['runner'],required:'optional',valid:value=>{try{return publicTarget(value).protocol==='https:'}catch{return false}}})),
 {name:'UPTIME_RUNNER_ID',scopes:['runner'],required:'optional',valid:text},
 {name:'UPTIME_NETWORK_LABEL',scopes:['runner'],required:'optional',valid:value=>text(value)&&value.length<=80},
 { name: 'MAIL_PROVIDER', scopes: app, required: 'local', valid: (value, env) => ['sendgrid','resend','cloudflare'].includes(value) || (local(env) && value === 'development') },
 { name: 'UPTIME_LOCAL_REVIEW', scopes: [...app, 'runner'], required: 'optional', valid: value => ['true', 'false'].includes(value) },
 { name: 'AUTH_ORIGIN', scopes: ['settings'], required: 'optional', valid: origin },
 { name: 'UPTIME_LOCAL_ORIGIN', scopes: ['local-worker'], required: 'always', valid: value => origin(value, { UPTIME_LOCAL_REVIEW: 'true' }) },
 { name: 'UPTIME_LOCAL_PORT', scopes: ['local-worker'], required: 'always', valid: port },
 { name: 'UPTIME_LOCAL_HOST', scopes: ['local-worker'], required: 'optional', valid: value => ['127.0.0.1', 'localhost', '::1'].includes(value) },
 { name: 'UPTIME_LOCAL_SETTINGS', scopes: ['local-worker'], required: 'optional', valid: text },
 { name: 'UPTIME_LOCAL_PERSIST', scopes: ['local-worker'], required: 'optional', valid: text },
 { name: 'RER_DEV_ORIGIN', scopes: ['local-worker'], required: 'optional', valid: value => origin(value, { UPTIME_LOCAL_REVIEW: 'true' }) },
 { name: 'UPTIME_CONTROL_ORIGIN', scopes: ['runner'], required: 'always', valid: (value, env) => origin(value, env, true) },
 { name: 'RER_DEV_IDENTITY', scopes: ['worker', 'settings'], required: 'optional', valid: (value, env) => local(env) && ['on', 'off'].includes(value) },
 { name: 'RER_DEV_KEY', scopes: ['worker', 'settings'], required: 'conditional', when: env => env.RER_DEV_IDENTITY === 'on', valid: secret(32) },
 { name: 'UPTIME_SYNTHETIC_PORT', scopes: ['worker', 'settings', 'local-worker'], required: 'optional', valid: port },
 ...claimNames.map(name => ({ name, scopes: ['worker', 'settings'], required: 'conditional', when: any(claimNames), valid: name.endsWith('PUBLIC_KEYS') ? (value, env) => { try { configureClaim({ issuer: env.RER_OWNER_CLAIM_ISSUER, installationId: env.RER_OWNER_CLAIM_INSTALLATION_ID, appOrigin: env.RER_OWNER_CLAIM_APP_ORIGIN, expectedEmail: env.OWNER_EMAIL?.toLowerCase(), publicKeys: JSON.parse(value) }); return true; } catch { return false; } } : name.endsWith('ISSUER') || name.endsWith('APP_ORIGIN') ? externalOrigin : value => text(value) && value.length <= 256 })),
 ...editorNames.map(name => ({ name, scopes: ['worker', 'settings'], required: 'conditional', when: any(editorNames), valid: name.endsWith('ORIGIN') ? externalOrigin : text })),
 { name: 'ASSETS', scopes: ['worker'], required: 'optional', valid: value => value && typeof value.fetch === 'function' },
 { name: 'RER_DEPLOY_SOURCE', scopes: ['worker'], required: 'optional', valid: text },
 { name: 'RER_DEPLOY_FINGERPRINT', scopes: ['worker'], required: 'optional', valid: text },
 { name: 'RER_VERSION', scopes: ['worker'], required: 'optional', valid: value => value && typeof value.id === 'string' },
 { name: 'UPTIME_LATER_JOURNAL', scopes: ['import'], required: 'optional', valid: text },
 { name: 'UPTIME_GRANT_FILE', scopes: ['runner'], required: 'optional', valid: text },
 { name: 'UPTIME_CREDENTIAL_DIR', scopes: ['runner'], required: 'optional', valid: text },
 { name: 'CLOUDFLARE_ACCOUNT_ID', scopes: ['deploy'], required: 'always', valid: value => text(value) && /^[a-f0-9]{32}$/i.test(value) },
 { name: 'CLOUDFLARE_API_TOKEN', scopes: ['deploy'], required: 'always', valid: value => text(value) && !/\s/.test(value) },
]);
export function requiredConfiguration(env, scope = 'worker') {
 return configurationTable.filter(rule => rule.scopes.includes(scope) && (rule.required === 'always' || rule.required === (local(env) ? 'local' : 'hosted') || rule.when?.(env)));
}
export function validateConfiguration(env, { scope = 'worker', suppliedOnly = false } = {}) {
 const required = new Set(requiredConfiguration(env, scope).map(rule => rule.name));
 for (const rule of configurationTable) {
  if (!rule.scopes.includes(scope)) continue;
  const value = env[rule.name];
  if (value === undefined && (suppliedOnly || !required.has(rule.name))) continue;
  if (!rule.valid(value, env)) throw new Error(`Invalid or missing configuration: ${rule.name}`);
 }
 // Distinct secrets preserve installation-local authority boundaries.
 const keys = ['SESSION_SECRET', 'SETUP_TOKEN', 'UPTIME_RUNNER_KEY'].filter(name => typeof env[name] === 'string');
 for (let i = 0; i < keys.length; i++) for (let j = 0; j < i; j++) if (env[keys[i]] === env[keys[j]]) throw new Error(`Invalid configuration: ${keys[i]} must differ from ${keys[j]}`);
}
export function configurationResponse(env) {
 try { validateConfiguration(env); return null; }
 catch (error) { return new Response(error.message, { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }); }
}
