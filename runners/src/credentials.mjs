import {openCredential, httpCredential} from './credential-file.mjs';
import {bindingRequired, CredentialBindingRequired} from './credential-diagnostic.mjs';
import {validMonitorId} from '../../src/domain/credential-binding.mjs';
import {attachCredentialContext, digest} from './auth/context.mjs';
import {credentialError} from './auth/validation.mjs';
export async function readCredentials(reference, url, method, directory = process.env.UPTIME_CREDENTIAL_DIR, monitorId) {
  if (!validMonitorId(monitorId)) throw credentialError();
  let source;
  try {
    source = await openCredential(directory, reference);
    const {input, root} = source;
    const result = httpCredential(input);
    if (input.origin !== new URL(url).origin || (input.body !== undefined && ['GET','HEAD'].includes(method)) || input.expiresAt !== undefined && Date.now() >= input.expiresAt) throw credentialError();
    if (input.monitorId === undefined) throw await bindingRequired(reference, monitorId, root);
    if (input.monitorId !== monitorId) throw await bindingRequired(reference, monitorId, root, true);
    return attachCredentialContext(result, {origin: input.origin, monitorId, reference, root, path: source.path, fingerprint: digest(source.bytes)});
  } catch (error) {
    if (error instanceof CredentialBindingRequired) throw error;
    throw credentialError();
  } finally { await source?.file.close(); }
}
