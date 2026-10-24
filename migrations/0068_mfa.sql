-- Edition second-factor state binds live Base identities and sessions. It never travels.
CREATE TABLE uptime_mfa_policy(singleton INTEGER PRIMARY KEY CHECK(singleton=1), required INTEGER NOT NULL CHECK(required IN(0,1)), revision INTEGER NOT NULL DEFAULT 1);
INSERT INTO uptime_mfa_policy(singleton,required) VALUES(1,0);
CREATE TABLE uptime_mfa_factors(
 id TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES oa_operators(id),
 kind TEXT NOT NULL CHECK(kind IN('totp','webauthn')), secret TEXT NOT NULL,
 credential_id TEXT UNIQUE, counter INTEGER NOT NULL DEFAULT -1, created_at INTEGER NOT NULL
);
CREATE INDEX uptime_mfa_operator ON uptime_mfa_factors(operator_id);
CREATE TABLE uptime_mfa_challenges(
 id TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES oa_operators(id), session_id TEXT NOT NULL REFERENCES oa_sessions(id),
 operator_version INTEGER NOT NULL, kind TEXT NOT NULL, secret TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE TABLE uptime_mfa_proofs(
 session_id TEXT PRIMARY KEY REFERENCES oa_sessions(id), operator_id TEXT NOT NULL REFERENCES oa_operators(id),
 operator_version INTEGER NOT NULL, verified_at INTEGER NOT NULL, method TEXT NOT NULL
);
CREATE TABLE uptime_mfa_recovery(
 operator_id TEXT NOT NULL REFERENCES oa_operators(id), digest TEXT NOT NULL, used_at INTEGER,
 PRIMARY KEY(operator_id,digest)
);
CREATE TABLE uptime_mfa_limits(operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id), window_start INTEGER NOT NULL, attempts INTEGER NOT NULL);
-- Delivery outcomes contain no addresses, provider response, factor or recovery material.
CREATE TABLE uptime_mfa_notices(id TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES oa_operators(id), action TEXT NOT NULL, created_at INTEGER NOT NULL, outcome TEXT NOT NULL);
