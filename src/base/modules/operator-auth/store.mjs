// D1 batches are transactions. All decisions that grant a session or mutate
// operator authority are repeated inside the same database transaction.
export const operatorColumns = 'id, email, display_name AS displayName, role, status, version, created_at AS createdAt';
export class AuthStore {
  constructor(db) { this.db = db; }
  statement(sql, args = []) { return this.db.prepare(sql).bind(...args); }
  async first(sql, args = []) { return this.statement(sql, args).first(); }
  async run(sql, args = []) { return this.statement(sql, args).run(); }
  async batch(statements) { return this.db.batch(statements.map(([sql, args]) => this.statement(sql, args))); }
  operator(id) { return this.first(`SELECT ${operatorColumns} FROM oa_operators WHERE id=?`, [id]); }
  byEmail(email) { return this.first(`SELECT ${operatorColumns} FROM oa_operators WHERE email=?`, [email]); }
  cancellation(operatorId) { return this.first('SELECT operator_version FROM oa_invitation_cancellations WHERE operator_id=?', [operatorId]); }
  async session(hash, now) {
    const session = await this.first(`SELECT s.id,s.operator_id AS operatorId,s.created_at AS createdAt,s.expires_at AS expiresAt,s.kind, o.email,o.display_name AS displayName,o.role,o.status,o.version,o.created_at AS operatorCreatedAt
      FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
      WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND o.status='active' AND s.operator_version=o.version`, [hash, now]);
    if (!session) return null;
    const { email, displayName, role, status, version, operatorCreatedAt, ...fields } = session;
    return { ...fields, operator: { id: session.operatorId, email, displayName, role, status, version, createdAt: operatorCreatedAt } };
  }
  async limits(keys, now, windowMs) {
    const window = Math.floor(now / windowMs);
    const rows = await this.batch(keys.map((key) => [`INSERT INTO oa_limits(key,window,count) VALUES(?,?,1)
      ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN oa_limits.window=excluded.window THEN oa_limits.count+1 ELSE 1 END RETURNING count`, [key, window]]));
    return rows.map((r) => r.results[0].count);
  }
  async bootstrap({ id, email, displayName, now, session }) {
    await this.batch([
      [`INSERT INTO oa_bootstrap(singleton,claim_id,claimed_at) SELECT 1,?,? WHERE NOT EXISTS(SELECT 1 FROM oa_operators) ON CONFLICT DO NOTHING`, [id, now]],
      [`INSERT INTO oa_operators(id,email,display_name,role,status,created_at)
        SELECT ?,?,?,'owner','active',? WHERE EXISTS(SELECT 1 FROM oa_bootstrap WHERE claim_id=?) ON CONFLICT DO NOTHING`, [id, email, displayName, now, id]],
      [`INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at)
        SELECT ?,?,id,version,'native',?,? FROM oa_operators WHERE id=?`, [session.id, session.hash, now, session.expiresAt, id]],
    ]);
    return this.session(session.hash, now);
  }
  // Snapshot authorization fence: both actor session and operator authority must
  // still be valid when the SQL mutation executes, not merely when JS checked it.
  actorFence(actor, now) {
    return { sql: `EXISTS(SELECT 1 FROM oa_sessions a JOIN oa_operators ao ON ao.id=a.operator_id
      WHERE a.token_hash=? AND a.revoked_at IS NULL AND a.expires_at>? AND ao.status='active'
      AND a.operator_version=ao.version AND ao.id=? AND ao.version=?)`, args: [actor.hash, now, actor.operator.id, actor.operator.version] };
  }
  async token(input, actor) {
    let fence = { sql: '1', args: [] };
    if (actor) fence = this.actorFence(actor, input.now);
    const result = await this.run(`INSERT INTO oa_tokens(id,token_hash,kind,operator_id,operator_version,return_to,created_at,expires_at)
      SELECT ?,?,?,id,version,?,?,? FROM oa_operators WHERE id=? AND status='active' AND ${fence.sql}`,
    [input.id, input.hash, input.kind, input.returnTo, input.now, input.expiresAt, input.operatorId, ...fence.args]);
    return result.meta.changes === 1;
  }
  async invite({ operatorId, expectedVersion, reinviting = false, email, displayName, role, token, now }, actor) {
    const fence = this.actorFence(actor, now);
    // Only a witnessed cancellation may reopen an inactive identity. Keep its
    // durable admission guard until confirmation, including through pruning.
    const prepare = reinviting
      ? [`UPDATE oa_operators SET status='invited',display_name=? WHERE id=? AND email=? AND role=? AND status='inactive' AND version=?
          AND EXISTS(SELECT 1 FROM oa_invitation_cancellations WHERE operator_id=?) AND ${fence.sql}`,
        [displayName, operatorId, email, role, expectedVersion, operatorId, ...fence.args]]
      : [`INSERT INTO oa_operators(id,email,display_name,role,status,created_at)
          SELECT ?,?,?,?,'invited',? WHERE ${fence.sql} ON CONFLICT(email) DO NOTHING`, [operatorId, email, displayName, role, now, ...fence.args]];
    const results = await this.batch([
      prepare,
      [`INSERT INTO oa_tokens(id,token_hash,kind,operator_id,operator_version,issuer_id,issuer_version,return_to,created_at,expires_at)
        SELECT ?,?,'invite',id,version,?,?,?,?,? FROM oa_operators WHERE id=? AND status='invited' AND role=? AND version=?
        ${reinviting ? 'AND changes()=1' : ''} AND ${fence.sql}`,
      [token.id, token.hash, actor.operator.id, actor.operator.version, token.returnTo, now, token.expiresAt, operatorId, role, expectedVersion + (reinviting ? 1 : 0), ...fence.args]],
      // Bind revocation to this transaction's successful issuance, so a stale
      // reissue cannot invalidate the winner's link or send another credential.
      [`UPDATE oa_tokens SET revoked_at=? WHERE operator_id=? AND id!=? AND consumed_at IS NULL
        AND EXISTS(SELECT 1 FROM oa_tokens WHERE id=?)`, [now, operatorId, token.id, token.id]],
    ]);
    return results[1].meta.changes === 1;
  }
  async preview(hash, now) {
    return this.first(`SELECT t.kind,t.expires_at AS expiresAt,t.return_to AS returnTo,o.email,o.role,t.issuer_id AS issuerId,t.issuer_version AS issuerVersion FROM oa_tokens t JOIN oa_operators o ON o.id=t.operator_id
      WHERE t.token_hash=? AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>? AND t.operator_version=o.version
      AND (o.status='active' OR (o.status='invited' AND t.kind='invite'))`, [hash, now]);
  }
  async consume(hash, now, session, allowedEmails, issuer) {
    const allow = allowedEmails === undefined ? { sql: '1', args: [] } : { sql: `o.email IN (${allowedEmails.map(() => '?').join(',') || 'NULL'})`, args: allowedEmails };
    // JS evaluated the configured policy on this issuer snapshot. Bind that
    // approval to the invitation and repeat its authority check in the session
    // transaction, so a concurrent demotion/deactivation cannot admit anyone.
    const authority = issuer ? { sql: `t.issuer_id=? AND t.issuer_version=? AND EXISTS(
      SELECT 1 FROM oa_operators i WHERE i.id=t.issuer_id AND i.version=t.issuer_version AND i.status='active')`,
    args: [issuer.id, issuer.version] } : { sql: '0', args: [] };
    await this.batch([
      [`INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,source_token_id,created_at,expires_at)
        SELECT ?,?,o.id,o.version+CASE WHEN o.status='invited' THEN 1 ELSE 0 END,'native',t.id,?,?
        FROM oa_tokens t JOIN oa_operators o ON o.id=t.operator_id
        WHERE t.token_hash=? AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>? AND t.operator_version=o.version
        AND (o.status='active' OR (o.status='invited' AND t.kind='invite')) AND ${allow.sql}
        AND (t.kind='magic' OR (${authority.sql}))`,
      [session.id, session.hash, now, session.expiresAt, hash, now, ...allow.args, ...authority.args]],
      // Only the session just admitted by the full token/issuer/allow-list
      // predicate witnesses acceptance. Removing its cancellation guard and
      // activating the operator are atomic with that admission; failures roll
      // back all three writes. An ordinary status update has no such witness.
      [`DELETE FROM oa_invitation_cancellations WHERE operator_id=(
        SELECT s.operator_id FROM oa_sessions s JOIN oa_tokens t ON t.id=s.source_token_id
        JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND t.kind='invite'
        AND t.operator_id=o.id AND o.status='invited' AND t.operator_version=o.version AND s.operator_version=o.version+1)`, [session.id]],
      [`UPDATE oa_operators SET status='active' WHERE status='invited' AND id=(SELECT operator_id FROM oa_sessions WHERE id=?)`, [session.id]],
      [`UPDATE oa_tokens SET consumed_at=? WHERE id=(SELECT source_token_id FROM oa_sessions WHERE id=?)`, [now, session.id]],
    ]);
    const admitted = await this.session(session.hash, now);
    if (!admitted) return null;
    const token = await this.first(`SELECT return_to AS returnTo FROM oa_tokens WHERE token_hash=?`, [hash]);
    return { ...admitted, returnTo: token.returnTo };
  }
  async issue({ operatorId, session, now, kind, expectedVersion }) {
    await this.run(`INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at)
      SELECT ?,?,id,version,?,?,? FROM oa_operators WHERE id=? AND status='active' AND version=?`,
    [session.id, session.hash, kind, now, session.expiresAt, operatorId, expectedVersion]);
    return this.session(session.hash, now);
  }
  async external({ identity, email, associatedEmail, session, now, expectedVersion }) {
    // Check first binding inside the write transaction: two distinct principals
    // cannot both claim an unbound account from stale email lookups. The trusted
    // admission closure supplies associatedEmail only for an exact configured sub.
    await this.batch([
      [`INSERT INTO oa_external_identities(issuer,subject,operator_id)
        SELECT ?,?,o.id FROM oa_operators o WHERE o.email=? AND o.status='active' AND o.version=?
        AND (o.email=? OR NOT EXISTS(SELECT 1 FROM oa_external_identities e WHERE e.operator_id=o.id))
        ON CONFLICT DO NOTHING`, [identity.issuer, identity.subject, email, expectedVersion, associatedEmail ?? null]],
      [`INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at)
        SELECT ?,?,o.id,o.version,'oidc',?,? FROM oa_external_identities e JOIN oa_operators o ON o.id=e.operator_id
        WHERE e.issuer=? AND e.subject=? AND o.email=? AND o.status='active' AND o.version=?`,
      [session.id, session.hash, now, session.expiresAt, identity.issuer, identity.subject, email, expectedVersion]],
    ]);
    return this.session(session.hash, now);
  }
}
