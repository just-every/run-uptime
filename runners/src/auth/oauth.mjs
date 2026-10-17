import {withOAuthState} from './oauth-state.mjs';
import {text, integer, active, credentialError} from './validation.mjs';
export async function oauthAuthorization(credential, {signal, tokenRequest, forceRefresh}) {
  if (typeof tokenRequest !== 'function') throw credentialError();
  return withOAuthState(credential, signal, async (state, save, identity, exchanging) => {
    const now = Date.now();
    if (!forceRefresh && state && state.expiresAt > now) return `Bearer ${state.accessToken}`;
    const auth = credential.auth, params = new URLSearchParams({grant_type: auth.grant});
    const headers = {'content-type': 'application/x-www-form-urlencoded', accept: 'application/json'};
    if (auth.grant === 'refresh_token') params.set('refresh_token', state?.refreshToken ?? auth.refreshToken);
    if (auth.scope?.length) params.set('scope', auth.scope.join(' '));
    if (auth.clientAuthentication === 'basic') {
      // OAuth client password syntax percent-encodes each component before Basic.
      const encode = value => new URLSearchParams({v: value}).toString().slice(2);
      headers.authorization = 'Basic ' + Buffer.from(`${encode(auth.clientId)}:${encode(auth.clientSecret)}`).toString('base64');
    } else { params.set('client_id', auth.clientId); params.set('client_secret', auth.clientSecret); }
    active(signal);
    if (auth.grant === 'refresh_token') exchanging();
    const response = await tokenRequest({url: auth.tokenUrl, headers, body: params.toString(), signal});
    active(signal);
    if (!response || response.status !== 200) throw credentialError();
    const raw = response.body instanceof Uint8Array ? new TextDecoder('utf-8', {fatal: true}).decode(response.body) : response.body;
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384) throw credentialError();
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object' || typeof value.token_type !== 'string' || value.token_type.toLowerCase() !== 'bearer') throw credentialError();
    text(value.access_token, 8192); integer(value.expires_in, 1, 86400);
    if (value.refresh_token !== undefined) text(value.refresh_token, 8192);
    const refreshToken = value.refresh_token ?? state?.refreshToken ?? (auth.grant === 'refresh_token' ? auth.refreshToken : undefined);
    const next = {version: 1, identity, accessToken: value.access_token, expiresAt: Date.now() + value.expires_in * 1000, ...(refreshToken !== undefined ? {refreshToken} : {})};
    await save(next); // Persist rotated refresh authority before returning the access token.
    return `Bearer ${next.accessToken}`;
  });
}
