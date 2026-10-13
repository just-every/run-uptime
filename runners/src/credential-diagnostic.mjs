import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {bindingReason, validMonitorId, validBindingDiagnostic} from '../../src/domain/credential-binding.mjs';
export const INVENTORY_FILE = '.monitor-credential-migration.json';
export class CredentialBindingRequired extends Error {
  constructor(diagnostic) { super(bindingReason(diagnostic)); this.diagnostic = diagnostic; }
}
// This report is diagnostic only. It never grants access or binds a credential.
export async function bindingRequired(reference, monitorId, root) {
  let file, ids = [];
  try {
    file = await open(join(root, INVENTORY_FILE), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o077) || stat.uid !== process.getuid() || stat.size > 2 * 1024 * 1024) throw Error();
    const input = JSON.parse(await file.readFile('utf8'));
    const saved = input[reference];
    if (Array.isArray(saved) && saved.length <= 100 && saved.every(validMonitorId)) ids = saved;
  } catch { /* No report is required to refuse an unbound credential. */ }
  finally { await file?.close(); }
  const diagnostic = {reference, monitorId, monitorIds: [...new Set([...ids, monitorId])]};
  if (!validBindingDiagnostic(diagnostic)) throw Error('Credential unavailable or invalid');
  return new CredentialBindingRequired(diagnostic);
}
