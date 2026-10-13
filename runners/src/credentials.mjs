import {openCredential, httpCredential} from './credential-file.mjs';
import {bindingRequired, CredentialBindingRequired} from './credential-diagnostic.mjs';
import {validMonitorId} from '../../src/domain/credential-binding.mjs';
export async function readCredentials(reference, url, method, directory = process.env.UPTIME_CREDENTIAL_DIR, monitorId) {
  if (!validMonitorId(monitorId)) throw Error('Credential unavailable');
  let source;
  try {
    source = await openCredential(directory, reference);
    const {input, root} = source;
    const result = httpCredential(input);
    if (input.origin !== new URL(url).origin || (input.body !== undefined && ['GET','HEAD'].includes(method))) throw Error();
    if (input.monitorId === undefined) throw await bindingRequired(reference, monitorId, root);
    if (input.monitorId !== monitorId) throw Error();
    return result;
  } catch (error) {
    if (error instanceof CredentialBindingRequired) throw error;
    throw Error('Credential unavailable or invalid');
  } finally { await source?.file.close(); }
}
