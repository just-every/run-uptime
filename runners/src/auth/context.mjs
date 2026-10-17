import {createHash} from 'node:crypto';
import {credentialError, active} from './validation.mjs';
export const credentialContext = Symbol('runner credential custody');
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function attachCredentialContext(credential, context) { Object.defineProperty(credential, credentialContext, {value: Object.freeze(context)}); return credential; }
export function assertCredentialOrigin(credential, url, signal) {
  active(signal);
  const context = credential[credentialContext];
  if (!context || new URL(url).origin !== context.origin || credential.expiresAt !== undefined && Date.now() >= credential.expiresAt) throw credentialError();
  return context;
}
