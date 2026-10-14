// Public codes reviewed against this edition's plan and published rer deployment package.
// This is a fixed vocabulary, never a pattern permitting arbitrary error text.
const codes = Object.freeze([
 'deployment-failed', 'usage-deploy-or-health', 'absolute-path-required',
 'missing-RER_DEPLOY_ARTIFACT', 'missing-RER_DEPLOY_ARTIFACT_SHA256',
 'missing-RER_DEPLOY_SOURCE_SHA', 'missing-RER_DEPLOY_RUN_ID',
 'missing-RER_DEPLOY_RUN_ATTEMPT', 'missing-RER_DEPLOY_RECEIPT',
 'missing-CLOUDFLARE_ACCOUNT_ID', 'missing-CLOUDFLARE_API_TOKEN',
 'missing-secret-SESSION_SECRET', 'missing-secret-SETUP_TOKEN',
 'missing-secret-OWNER_EMAIL', 'missing-secret-MAIL_FROM',
 'missing-secret-SENDGRID_API_KEY', 'missing-secret-UPTIME_RUNNER_KEY',
 'missing-or-invalid-CF_THROWAWAY_ACCOUNT_ID', 'missing-or-invalid-CF_THROWAWAY_API_TOKEN',
 'receipt-permissions', 'receipt-custody-mismatch', 'missing-or-invalid-receipt',
 'receipt-target-mismatch', 'repeat-deployment-drift',
 'no-op-requires-authenticated-prior-receipt', 'active-deployment-mismatch',
 'missing-artifact-sha256', 'nonregular-artifact-parent',
 'nonregular-or-oversize-artifact', 'artifact-changed-during-read',
 'artifact-digest-mismatch', 'invalid-artifact-json', 'artifact-custody-mismatch',
 'invalid-artifact-identity', 'invalid-artifact-inventory', 'invalid-local-path',
 'invalid-artifact-file-count', 'invalid-artifact-file', 'artifact-main-missing',
 'unsupported-module-type', 'invalid-plan', 'invalid-plan-resources',
 'duplicate-or-invalid-binding', 'invalid-resource-name', 'duplicate-resource-name',
 'invalid-migrations', 'invalid-secret-environment', 'invalid-cron', 'duplicate-cron',
 'invalid-public-variable', 'migration-order-or-name', 'invalid-migration-bytes',
 'unsafe-migration-control', 'd1-query-failed',
 'legacy-migration-history-needs-reviewed-hash-adoption',
 'changed-or-uncertain-migration-history', 'pending-migrations', 'migration-readback-mismatch',
 'empty-response', 'response-too-large', 'malformed-response',
 'provider-transport-failed', 'provider-request-budget', 'invalid-provider-path',
 'invalid-asset-auth-target', 'provider-unsuccessful-or-malformed',
 'provider-invalid-list', 'provider-list-too-large', 'provider-partial-list',
 'provider-incomplete-pagination', 'provider-pagination-changed',
 'provider-invalid-cursor', 'provider-pagination-limit',
 'provider-http-400', 'provider-http-401', 'provider-http-403', 'provider-http-404',
 'provider-http-409', 'provider-http-413', 'provider-http-422', 'provider-http-429',
 'provider-http-500', 'provider-http-502', 'provider-http-503', 'provider-http-504',
 'provider-http-520', 'provider-http-521', 'provider-http-522', 'provider-http-523',
 'provider-http-524', 'provider-http-525', 'provider-http-526', 'provider-http-530',
 'ambiguous-resource-name', 'missing-d1', 'invalid-d1-identity', 'incompatible-d1',
 'invalid-cron-list', 'cron-drift', 'invalid-worker-settings', 'invalid-deployments',
 'mixed-or-invalid-deployment', 'invalid-active-version', 'missing-deployed-worker',
 'invalid-secret-list', 'missing-deployed-secret', 'invalid-asset-session',
 'invalid-asset-bucket', 'invalid-asset-request', 'incomplete-asset-upload',
 'invalid-account-subdomain', 'invalid-worker-subdomain', 'worker-subdomain-disabled',
 'invalid-provider-bindings', 'binding-readback-mismatch', 'health-origin-mismatch',
 'resource-identity-drift', 'durable-object-identity-drift', 'health-transport-failed',
 'health-http-failed', 'health-identity-mismatch', 'deployment-changed-during-health',
]);
const byMessage = new Map(codes.map(code => [code, code]));
byMessage.set('UPTIME_WORKER_NAME must be a valid Cloudflare Worker name', 'invalid-worker-name');
byMessage.set('UPTIME_ORIGIN must be an exact HTTPS origin', 'invalid-worker-origin');
byMessage.set('Unexpected migration binding', 'unexpected-migration-binding');
const publicCodes = new Set(byMessage.values());

export function isDeploymentFailureCode(code) {
 return typeof code === 'string' && publicCodes.has(code);
}

export function deploymentFailureCode(error) {
 // Base uses ordinary Error instances. Read only an own data property; custom
 // getters, coercion, stacks, causes and provider payloads are never inspected.
 try {
  if (!(error instanceof Error)) return 'deployment-failed';
  const message = Object.getOwnPropertyDescriptor(error, 'message')?.value;
  return typeof message === 'string' ? byMessage.get(message) ?? 'deployment-failed' : 'deployment-failed';
 } catch { return 'deployment-failed'; }
}
