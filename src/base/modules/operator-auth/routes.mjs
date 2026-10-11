import { confirmationResponse } from './confirmation.mjs';
import { AuthError } from './errors.mjs';
import { securityHeaders, requireLoopback } from './http.mjs';
import { readInput, readParameters } from './input.mjs';
function json(value, status = 200) { return Response.json(value, { status, headers: securityHeaders() }); }
function signedIn(value) { return new Response(null, { status: 303, headers: { ...securityHeaders(), 'Set-Cookie': value.cookie, Location: value.returnTo } }); }

/** Fetch-compatible optional HTTP adapter. Returns null for paths it does not own. */
export function createAuthHandler(auth) {
  return async function handleAuth(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/auth/')) return null;
    try {
      if (path === '/auth/review-session') requireLoopback(request);
      if (path === '/auth/confirm' && ['GET', 'HEAD'].includes(request.method)) {
        const token = readParameters(url.searchParams).token ?? null;
        const preview = await auth.previewLink(request, token);
        return await confirmationResponse({ branding: auth.presentation, preview, token, method: request.method });
      }
      if (path === '/auth/session' && request.method === 'GET') {
        const session = await auth.getSession(request);
        return session ? json(session) : json({ error: 'unauthenticated' }, 401);
      }
      if (path === '/auth/operators' && request.method === 'GET') return json(await auth.listOperators(request));
      if (path === '/auth/sessions' && request.method === 'GET') return json(await auth.listSessions(request, readParameters(url.searchParams).operatorId));
      const posts = new Set(['/auth/bootstrap', '/auth/magic-link', '/auth/confirm', '/auth/signout', '/auth/invite', '/auth/invite/cancel', '/auth/review-session', '/auth/operator/status', '/auth/operator/role', '/auth/session/revoke']);
      if (!posts.has(path)) return json({ error: 'not_found' }, 404);
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      const query = readParameters(url.searchParams);
      // POST credentials belong only in the body. Refuse a second credential
      // source even if a proxy or caller would choose one of the two values.
      if (Object.hasOwn(query, 'token')) throw new AuthError('invalid_input');
      const input = await readInput(request);
      switch (path) {
        case '/auth/bootstrap': return signedIn(await auth.bootstrap(request, input));
        case '/auth/magic-link': return json(await auth.requestMagicLink(request, input), 202);
        case '/auth/confirm': return signedIn(await auth.confirmLink(request, input));
        case '/auth/review-session': return signedIn(await auth.issueReviewSession(request, input));
        case '/auth/invite': return json(await auth.invite(request, input), 202);
        case '/auth/invite/cancel': return json(await auth.cancelInvitation(request, input.operatorId));
        case '/auth/signout': {
          const result = await auth.signOut(request);
          return new Response(null, { status: 204, headers: { ...securityHeaders(), 'Set-Cookie': result.cookie } });
        }
        case '/auth/operator/status': return json(await auth.setOperatorStatus(request, input.operatorId, input.status));
        case '/auth/operator/role': return json(await auth.setRole(request, input.operatorId, input.role));
        case '/auth/session/revoke': await auth.revokeSession(request, input.sessionId); return new Response(null, { status: 204, headers: securityHeaders() });
      }
    } catch (error) {
      if (error instanceof AuthError) return json({ error: error.code }, error.status);
      // Do not put SQL, email addresses, setup tokens or provider exceptions on the wire.
      return json({ error: 'auth_unavailable' }, 503);
    }
  };
}
