import { check, fail } from './errors.mjs';
export function storage(db) {
  return {
    async limit(bucket, expiresAt, maximum) {
      try {
        const row = await db.prepare('INSERT INTO oa_oidc_limits (bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket, expiresAt).first();
        check(row && row.count <= maximum, 'oidc_rate_limited', 429);
      } catch (e) { if (e.code === 'oidc_rate_limited') throw e; fail('oidc_storage_unavailable', 503); }
    },
    async put(row) {
      try { await db.prepare('INSERT INTO oa_oidc_transactions (state_hash,binding_hash,config_hash,payload,expires_at) VALUES (?,?,?,?,?)').bind(row.stateHash, row.bindingHash, row.configHash, row.payload, row.expiresAt).run(); }
      catch { fail('oidc_storage_unavailable', 503); }
    },
    async consume(stateHash, bindingHash, configHash, now) {
      try { return await db.prepare('DELETE FROM oa_oidc_transactions WHERE state_hash=? AND binding_hash=? AND config_hash=? AND expires_at>? RETURNING payload').bind(stateHash, bindingHash, configHash, now).first(); }
      catch { fail('oidc_storage_unavailable', 503); }
    },
  };
}
