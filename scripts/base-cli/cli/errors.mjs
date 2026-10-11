export class RerError extends Error {
 constructor(code, message, exitCode, details = {}) { super(message); Object.assign(this, { code, exitCode, ...details }); }
}
export const invalid = message => new RerError('invalid_invocation', message, 2);
export const missing = message => new RerError('missing_input', message, 3);
export const refuse = message => new RerError('safety_refusal', message, 4);

export async function lifecycleError(error, store) {
 if(error instanceof RerError)return error;
 const {shared}=await import('./shared.mjs');
 const {approvedFailure}=await shared('failures.mjs');
 const approved=approvedFailure(error);
 return new RerError(approved?.code==='owner_conflict'?'safety_refusal':'command_failed', approved?.message ?? `${store?.state?.step ?? 'Local lifecycle'} failed. Inspect the private redacted capture log.`, approved?.exitCode ?? 1, {childExitCode:approved?.childExitCode,signal:approved?.signal});
}
