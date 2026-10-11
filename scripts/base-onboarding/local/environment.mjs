import { parseEnv } from 'node:util'

export function localVariables(text) {
  // Node's dotenv parser can consume the next assignment after an unquoted
  // whitespace-only value. Keep such values empty for the preflight checks.
  return parseEnv(text.replace(/(^[\t ]*(?:export[\t ]+)?[A-Za-z_]\w*[\t ]*=)[\t ]+(?=\r?$)/gm, '$1'))
}

// Inherited application bindings never reach a build or migration command.
// The default names are the Base operator-auth and mail bindings.
export const applicationBindings = /^(SESSION_SECRET|SETUP_TOKEN|OWNER_EMAIL|AUTH_|MAIL_|OIDC_)/

export function buildEnvironment(bindings = applicationBindings, inherited = process.env) {
  const env = { ...inherited, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false', WRANGLER_SEND_METRICS: 'false' }
  const declared = Array.isArray(bindings) ? new Set(bindings) : null
  for (const key of Object.keys(env)) if (declared ? declared.has(key) || applicationBindings.test(key) : bindings.test(key)) delete env[key]
  return env
}

// Values printed by a child are redacted when their name marks a credential.
export const secretValues = (vars) => Object.entries(vars).filter(([key]) => /SECRET|TOKEN|API_KEY/.test(key)).map(([, value]) => value).filter(Boolean)

export function localOrigin(vars) {
  let url
  try { url = new URL(vars.AUTH_ORIGIN) } catch { /* Use a fixed, non-secret diagnostic. */ }
  if (vars.AUTH_LOCAL !== 'true' || !url || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.origin !== vars.AUTH_ORIGIN || url.username || url.password) {
    throw new Error('Invalid local origin in .dev.vars; run pnpm local:setup --force.')
  }
  return url
}
