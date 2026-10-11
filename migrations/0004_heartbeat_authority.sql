-- Installation-local execution authority, tracked by Wrangler d1_migrations.
-- Not a portable domain schema change: domain/archive ledger stays at version 3.
CREATE TABLE heartbeat_authority(
 monitor_id TEXT PRIMARY KEY REFERENCES monitors(id),
 revision INTEGER NOT NULL,
 token_hash TEXT NOT NULL,
 last_sequence INTEGER NOT NULL DEFAULT 0,
 received_at INTEGER
);
CREATE TABLE heartbeat_claims(
 slot_id TEXT PRIMARY KEY REFERENCES slots(id),
 revision INTEGER NOT NULL,
 received_at INTEGER
);
