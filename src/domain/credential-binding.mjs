// Non-secret, bounded migration diagnostics shared by the runner and evidence validator.
export const validReference = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
export const validMonitorId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,512}$/.test(value);
export const BINDING_DIAGNOSTIC_BYTES = 56000;
export function bindingCommand(reference, monitorId) {
  if (!validReference(reference) || !validMonitorId(monitorId)) throw Error('Invalid binding identity');
  return `node runners/migrations/0001-monitor-credentials.mjs --directory "$UPTIME_CREDENTIAL_DIR" --reference ${reference} --monitor-id ${monitorId}`;
}
export function validBindingDiagnostic(value) {
  return value && typeof value === 'object' && Object.keys(value).sort().join(',') === 'monitorId,monitorIds,reference' &&
    validReference(value.reference) && validMonitorId(value.monitorId) && Array.isArray(value.monitorIds) &&
    value.monitorIds.length >= 1 && value.monitorIds.length <= 101 && value.monitorIds.every(validMonitorId) &&
    new Set(value.monitorIds).size === value.monitorIds.length && value.monitorIds.includes(value.monitorId) &&
    JSON.stringify(value).length <= BINDING_DIAGNOSTIC_BYTES;
}
export const bindingReason = value => `Credential ${value.reference} is unbound. Stop the runner, review the intended monitor, then run: ${bindingCommand(value.reference, value.monitorId)}`;
// Keep the ordinary signed-result byte limit. Only valid bounded diagnostics earn
// their own serialized space; unrelated payload padding never enlarges the limit.
export function runnerResultLimit(text) {
  try {
    const input = JSON.parse(text);
    if (!Array.isArray(input.attempts) || input.attempts.length > 9) return 40000;
    const diagnostics = input.attempts.map(o => o?.credentialBinding).filter(value => value !== undefined);
    if (!diagnostics.every(validBindingDiagnostic)) return 40000;
    return 40000 + diagnostics.reduce((bytes, value) => bytes + JSON.stringify(value).length, 0);
  } catch { return 40000; }
}
