import {publicTarget} from '../../../src/domain/public-target.mjs';
import {fields, text, credentialError} from './validation.mjs';
import {validateJwt} from './jwt.mjs';
export function validateAuth(auth) {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) throw credentialError();
  if (auth.type === 'bearer') { fields(auth, ['type', 'token']); text(auth.token); return; }
  if (auth.type === 'basic' || auth.type === 'digest') {
    fields(auth, ['type', 'username', 'password', ...(auth.type === 'digest' ? ['realm'] : [])]);
    text(auth.username, 1024, auth.type === 'basic'); text(auth.password, 4096, true);
    if (auth.type === 'basic' && auth.username.includes(':')) throw credentialError();
    if (auth.type === 'digest') text(auth.realm, 1024);
    return;
  }
  if (auth.type === 'jwt') { validateJwt(auth); return; }
  if (auth.type !== 'oauth2' || !['client_credentials', 'refresh_token'].includes(auth.grant)) throw credentialError();
  fields(auth, ['type', 'grant', 'tokenUrl', 'clientId', 'clientSecret', 'clientAuthentication', ...(auth.grant === 'refresh_token' ? ['refreshToken'] : [])], ['scope']);
  text(auth.clientId, 1024); text(auth.clientSecret, 4096);
  if (!['basic', 'body'].includes(auth.clientAuthentication)) throw credentialError();
  const url = publicTarget(auth.tokenUrl);
  if (url.protocol !== 'https:' || url.href !== auth.tokenUrl) throw credentialError();
  if (auth.grant === 'refresh_token') text(auth.refreshToken, 8192);
  if (auth.scope !== undefined && (!Array.isArray(auth.scope) || auth.scope.length > 32 || new Set(auth.scope).size !== auth.scope.length || auth.scope.some(scope => typeof scope !== 'string' || !/^[\x21\x23-\x5b\x5d-\x7e]{1,256}$/.test(scope)))) throw credentialError();
}
