-- Additive draft: number as a NEW migration during adoption, after the core schema.
CREATE TABLE IF NOT EXISTS oa_oidc_transactions (
  state_hash TEXT PRIMARY KEY,
  binding_hash TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oa_oidc_transactions_expiry ON oa_oidc_transactions(expires_at);
CREATE TABLE IF NOT EXISTS oa_oidc_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
