-- Permanent, portable audit. References contain opaque identifiers only.
CREATE TABLE uptime_audit (
 id TEXT PRIMARY KEY NOT NULL,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('operator','feature','anonymized')),
 actor_ref TEXT NOT NULL,
 occurred_at INTEGER NOT NULL,
 action TEXT NOT NULL,
 subject_kind TEXT NOT NULL,
 subject_ref TEXT NOT NULL
);
CREATE INDEX uptime_audit_time ON uptime_audit(occurred_at);
CREATE TABLE uptime_erasure_receipts (
 id TEXT PRIMARY KEY NOT NULL,
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('monitor','destination','operator')),
 counts TEXT NOT NULL,
 completed_at INTEGER NOT NULL
);
