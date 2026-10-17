import {assertCredentialOrigin} from './context.mjs';
import {jwtAuthorization} from './jwt.mjs';
import {oauthAuthorization} from './oauth.mjs';
import {credentialError, active} from './validation.mjs';
export {digestChallengeAuthorization} from './digest.mjs';
/** Secrets remain within this invocation and the runner's transport callback.
 * The parent transport owns TLS trust and permanently drops the whole credential
 * context on an origin change. Token requests never inherit target TLS options. */
export async function prepareAuthentication(credential, {url, method, body, signal, tokenRequest, forceRefresh = false}) {
  try {
    assertCredentialOrigin(credential, url, signal);
    if (typeof method !== 'string' || !/^[A-Z]+$/.test(method) || body !== undefined && typeof body !== 'string' && !(body instanceof Uint8Array) || typeof forceRefresh !== 'boolean') throw credentialError();
    const headers = {...credential.headers};
    if (credential.auth?.type === 'jwt') headers.authorization = jwtAuthorization(credential.auth);
    if (credential.auth?.type === 'oauth2') headers.authorization = await oauthAuthorization(credential, {signal, tokenRequest, forceRefresh});
    active(signal); assertCredentialOrigin(credential, url, signal);
    return {headers, ...(credential.tls ? {tls: {...credential.tls}} : {})};
  } catch { throw credentialError(); }
}
