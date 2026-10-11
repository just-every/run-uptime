-- Additive schema draft. Integrator assigns the next migration number; never
-- replace an applied migration. All epoch timestamps are milliseconds.
CREATE TABLE oa_operators (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','member')),
 status TEXT NOT NULL CHECK(status IN ('invited','active','inactive')),
 version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE oa_bootstrap (singleton INTEGER PRIMARY KEY CHECK(singleton=1), claim_id TEXT NOT NULL UNIQUE, claimed_at INTEGER NOT NULL);
CREATE TABLE oa_tokens (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('magic','invite')),
 operator_id TEXT NOT NULL REFERENCES oa_operators(id), operator_version INTEGER NOT NULL,
 issuer_id TEXT REFERENCES oa_operators(id), issuer_version INTEGER,
 return_to TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 consumed_at INTEGER, revoked_at INTEGER,
 CHECK((kind='invite' AND issuer_id IS NOT NULL AND issuer_version IS NOT NULL)
    OR (kind='magic' AND issuer_id IS NULL AND issuer_version IS NULL))
);
CREATE TABLE oa_sessions (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 operator_id TEXT NOT NULL REFERENCES oa_operators(id), operator_version INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('native','review','oidc','password','dev')),
 source_token_id TEXT UNIQUE REFERENCES oa_tokens(id),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE INDEX oa_sessions_operator ON oa_sessions(operator_id);
CREATE TABLE oa_external_identities (
 issuer TEXT NOT NULL, subject TEXT NOT NULL, operator_id TEXT NOT NULL REFERENCES oa_operators(id),
 PRIMARY KEY(issuer, subject)
);
CREATE TABLE oa_limits (key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
CREATE TRIGGER oa_preserve_last_owner_update BEFORE UPDATE OF status,role ON oa_operators
 WHEN OLD.role='owner' AND OLD.status='active' AND (NEW.role!='owner' OR NEW.status!='active')
 AND (SELECT COUNT(*) FROM oa_operators WHERE role='owner' AND status='active') <= 1
 BEGIN SELECT RAISE(ABORT, 'last_owner'); END;
CREATE TRIGGER oa_preserve_last_owner_delete BEFORE DELETE ON oa_operators
 WHEN OLD.role='owner' AND OLD.status='active'
 AND (SELECT COUNT(*) FROM oa_operators WHERE role='owner' AND status='active') <= 1
 BEGIN SELECT RAISE(ABORT, 'last_owner'); END;
-- A status/role change invalidates every preexisting session and link, including
-- after a later reactivation. Keep this invariant for direct administrative SQL.
CREATE TRIGGER oa_operator_version AFTER UPDATE OF status,role ON oa_operators
 WHEN OLD.status != NEW.status OR OLD.role != NEW.role
 BEGIN UPDATE oa_operators SET version=OLD.version+1 WHERE id=NEW.id; END;

-- Fresh installs include local dev identity. Apply schema/dev-sessions.sql as a
-- NEW numbered migration in existing stores; it is also safe after this file.
-- A credential minted while signed in with a dev session is recorded here and,
-- like the dev session itself, counts only behind the local key gate.
CREATE TABLE IF NOT EXISTS oa_dev_credentials (
 credential TEXT NOT NULL, id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(credential, id)
);

-- Fresh installs include the additive invitation cancellation ledger.
-- Apply as a NEW numbered migration after operator-auth.sql in existing stores.
-- This durable record is admission state, not an expiring credential. Never prune it.
-- Existing active/inactive operators retain their recorded status: no historical
-- acceptance is inferred. Only a witnessed invited -> inactive transition records
-- an unaccepted cancellation, including direct administrative SQL transitions.
CREATE TABLE oa_invitation_cancellations (
 operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id),
 operator_version INTEGER NOT NULL
);
CREATE TRIGGER oa_record_invitation_cancellation AFTER UPDATE OF status ON oa_operators
 WHEN OLD.status='invited' AND NEW.status='inactive'
 BEGIN INSERT INTO oa_invitation_cancellations(operator_id,operator_version)
 VALUES(NEW.id,OLD.version+1)
 ON CONFLICT(operator_id) DO UPDATE SET operator_version=excluded.operator_version; END;
CREATE TRIGGER oa_reject_cancelled_invitation_reactivation BEFORE UPDATE OF status ON oa_operators
 WHEN NEW.status='active' AND EXISTS(SELECT 1 FROM oa_invitation_cancellations WHERE operator_id=OLD.id)
 BEGIN SELECT RAISE(ABORT, 'invitation_required'); END;

-- Fresh installs include domain rules and step-up proofs. Apply
-- schema/domain-rules-step-up.sql as a NEW numbered migration in existing
-- stores; it is also safe after this file.
-- A required sign-in provider for an email domain. Sign-ins for that domain by
-- any other route are refused; app owners are exempt.
CREATE TABLE IF NOT EXISTS oa_domain_rules (
 domain TEXT PRIMARY KEY, provider_id TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES oa_operators(id), created_at INTEGER NOT NULL
);
-- A step-up proof: an app-local email link sent to the operator's own address,
-- bound to the session that asked and completed only in that session. No
-- foreign key names oa_sessions, which schema/dev-sessions.sql rebuilds.
CREATE TABLE IF NOT EXISTS oa_step_up_challenges (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 session_id TEXT NOT NULL, operator_id TEXT NOT NULL REFERENCES oa_operators(id),
 operator_version INTEGER NOT NULL, action TEXT NOT NULL, return_to TEXT NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS oa_step_up_session ON oa_step_up_challenges(session_id);
