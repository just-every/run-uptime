import { assert, stable } from './validation.mjs';
import { activeWorker } from './worker.mjs';

/** A named service entrypoint's authority is stored by the service owner. Cloudflare
 * settings and immutable deployment identity are both checked; no omitted props waiver. */
export async function verifyServiceGrants(api, plan) {
  for (const binding of plan.services ?? []) {
    if (!binding.grant) continue;
    const current = await activeWorker(api, binding.service), expected = binding.grant;
    assert(current && ['versionId','deploymentId','etag'].every(key => current[key] === expected.provider[key]), 'service-grant-deployment-drift');
    const values = {};
    for (const name of ['EGRESS_GRANTS','RER_DEPLOY_SOURCE','RER_DEPLOY_FINGERPRINT']) {
      const rows = current.settings.bindings.filter(b => b.name === name);
      assert(rows.length === 1 && rows[0].type === 'plain_text' && typeof rows[0].text === 'string', 'service-grant-readback-mismatch');
      values[name] = rows[0].text;
    }
    assert(values.RER_DEPLOY_SOURCE === expected.sourceSha && values.RER_DEPLOY_FINGERPRINT === expected.fingerprint, 'service-grant-deployment-drift');
    let grants; try { grants = JSON.parse(values.EGRESS_GRANTS); } catch { throw new Error('service-grant-readback-mismatch'); }
    assert(Array.isArray(grants) && grants.length && grants.every(row => row && Object.keys(row).sort().join() === 'allowedHosts,entrypoint'
      && typeof row.entrypoint === 'string' && (row.allowedHosts === null || Array.isArray(row.allowedHosts)))
      && new Set(grants.map(row => row.entrypoint)).size === grants.length, 'service-grant-readback-mismatch');
    const rows = grants.filter(row => row.entrypoint === binding.entrypoint);
    assert(rows.length === 1 && stable(rows[0].allowedHosts) === stable(expected.allowedHosts), 'service-grant-readback-mismatch');
  }
}
