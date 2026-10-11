// Local dev identity. SERVER-ONLY and LOCAL-ONLY: load this layer only from a
// local-only Worker entry (a `wrangler dev` or Vite-serve entry), never from the
// deployed main. `rer build` refuses any build output containing the marker.
import { configure } from '../config.mjs';
import { AuthStore } from '../accounts/store.mjs';
import { hashToken, opaqueToken } from '../crypto.mjs';
import { readCookie, sessionCookie, isLoopbackHost } from '../http.mjs';
import { safeReturnTo } from '../policy.mjs';
import { isActiveOperator } from '../accounts/roles.mjs';
import { devGate, devNotFound, DEV_GATE_COOKIE } from '../dev-gate.mjs';
import { registerDevAdmission } from '../dev-admission.mjs';
import { definePersonas } from './personas.mjs';
import { decorate } from './badge.mjs';

export const DEV_LAYER_MARKER = 'rer-dev-layer:local-only-never-deploy';
const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow', 'x-rer-dev-layer': DEV_LAYER_MARKER };
const text = (status, body) => new Response(body, { status, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });

// RER Managed sets RER_INSTALLATION_ID with its management origin. Dev identity
// never runs inside such an installation, even one reached from this computer.
export function managedInstallation(env) {
  if (!env.RER_INSTALLATION_ID || !env.RER_MANAGEMENT_ORIGIN) return false;
  try { return !isLoopbackHost(new URL(env.RER_MANAGEMENT_ORIGIN).hostname); } catch { return true; }
}

/**
 * Wraps a seed's Worker with dev sign-in (`/auth/dev/enter?as=…`), the persona
 * list (`/__dev/personas`) and the dev-only badge. Every surface needs the key
 * gate and answers 404 without it. `config(env)` is the seed's own AuthConfig
 * and `personas()` its devPersonas() declaration.
 */
export function withDevIdentity(worker, { bindings = env => env, config: authConfig, personas = () => [] }) {
  const declared = definePersonas(personas());
  return {
    ...worker,
    async fetch(request, original, execution) {
      const env = bindings(original);
      if (managedInstallation(env)) {
        // Never admit a dev credential here; with dev identity on, serve nothing.
        registerDevAdmission(null);
        if (env.RER_DEV_IDENTITY !== 'off') return text(503, 'Dev identity refuses to run beside RER_INSTALLATION_ID with a non-loopback RER_MANAGEMENT_ORIGIN. Remove those bindings from local settings or use rer dev --login.');
        return new URL(request.url).pathname === '/auth/dev/enter' || new URL(request.url).pathname === '/__dev/personas' ? devNotFound() : worker.fetch(request, original, execution);
      }
      const gate = devGate({ key: env.RER_DEV_KEY, origin: env.AUTH_ORIGIN, local: env.AUTH_LOCAL === 'true' });
      registerDevAdmission(gate ? r => gate.admits(r) : null);
      const path = new URL(request.url).pathname;
      if (path === '/auth/dev/enter' || path === '/__dev/personas') {
        if (!gate || env.RER_DEV_IDENTITY === 'off' || !await gate.admits(request)) return devNotFound();
        const context = identity(env, authConfig, declared);
        return path === '/__dev/personas' ? Response.json(context.list(), { headers }) : enter(request, gate, context);
      }
      const response = await worker.fetch(request, original, execution);
      if (!gate || request.method !== 'GET' || path.startsWith('/__dev/')) return response;
      const admitted = await gate.admits(request);
      const badge = admitted && env.RER_DEV_IDENTITY !== 'off' ? await identity(env, authConfig, declared).badge(request) : null;
      return decorate(response, { exchange: path === '/', badge });
    },
  };
}

function identity(env, authConfig, declared) {
  const config = configure(authConfig(env)), store = new AuthStore(env.DB);
  const hash = token => hashToken(config.SESSION_SECRET, 'session', token);
  const everyone = () => [{ as: 'owner', email: config.OWNER_EMAIL }, ...declared];
  async function current(request) {
    const token = readCookie(request, config);
    if (!token) return null;
    const session = await store.session(await hash(token), Date.now());
    return session && isActiveOperator(session.operator, config.allowList) ? session : null;
  }
  return {
    config, store, hash, current, everyone,
    list: () => [...everyone().map(({ as, email, role }) => ({ as, email, ...(role ? { role } : {}) })), { as: 'signed-out' }],
    async badge(request) { return { session: await current(request), choices: everyone() }; },
  };
}

async function enter(request, gate, { config, store, hash, current, everyone }) {
  if (request.method !== 'GET') return text(405, 'Method not allowed');
  const url = new URL(request.url), as = url.searchParams.get('as') ?? 'owner';
  const reply = new Headers(headers);
  // A harness presenting the key header also receives the browser cookie.
  if (!(request.headers.get('cookie') ?? '').includes(`${DEV_GATE_COOKIE}=`)) reply.append('set-cookie', await gate.setCookie());
  const existing = await current(request);
  if (as === 'signed-out') {
    const token = readCookie(request, config);
    if (token) await store.run('UPDATE oa_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE token_hash=?', [Date.now(), await hash(token)]);
    reply.append('set-cookie', sessionCookie('', config, 0));
    reply.set('location', '/');
    return new Response(null, { status: 303, headers: reply });
  }
  const persona = everyone().find(p => p.as === as);
  if (!persona) return devNotFound();
  let operator = await store.byEmail(persona.email);
  // Personas are real operators, created only here, in local dev.
  if (!operator && persona.role) {
    await store.run(`INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,?,'active',?) ON CONFLICT(email) DO NOTHING`,
      [crypto.randomUUID(), persona.email, persona.displayName, persona.role, Date.now()]);
    operator = await store.byEmail(persona.email);
  }
  if (!operator) return text(409, 'The owner that rer setup claimed is not in this database. Run rer setup.');
  if (!isActiveOperator(operator, config.allowList)) return text(403, `${as} is not an active operator in this app.`);
  if (existing?.kind !== 'dev' || existing.operator.id !== operator.id) {
    const token = opaqueToken(), session = { id: crypto.randomUUID(), hash: await hash(token), expiresAt: Date.now() + config.sessionSeconds * 1000 };
    const issued = await store.issue({ operatorId: operator.id, expectedVersion: operator.version, session, now: Date.now(), kind: 'dev' });
    if (!issued) return text(409, 'The operator changed while signing in. Try again.');
    reply.append('set-cookie', sessionCookie(token, config, config.sessionSeconds));
  }
  reply.set('location', safeReturnTo(url.searchParams.get('returnTo')));
  return new Response(null, { status: 303, headers: reply });
}
