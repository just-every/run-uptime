-- Local recurring send authority; frozen report snapshots keep their existing
-- portable scheduled_reports history, while restored installations never send.
CREATE TABLE report_recurrences (
 id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL, service TEXT,
 destination_id TEXT NOT NULL, credential_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, actor_version INTEGER NOT NULL, role_revision INTEGER NOT NULL,
 frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly')),
 time_zone TEXT NOT NULL, anchor_at INTEGER NOT NULL, next_at INTEGER NOT NULL,
 period TEXT NOT NULL, created_at INTEGER NOT NULL, stopped_at INTEGER, stop_reason TEXT
);
CREATE TABLE report_occurrences (
 recurrence_id TEXT NOT NULL, due_at INTEGER NOT NULL, report_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(recurrence_id,due_at)
);
CREATE INDEX report_recurrences_due ON report_recurrences(next_at) WHERE stopped_at IS NULL;
