-- Immutable job receipt history is portable; all receipt/claim authority stays local.
CREATE TABLE heartbeat_runs(
 id TEXT PRIMARY KEY,
 monitor_id TEXT NOT NULL REFERENCES monitors(id),
 revision INTEGER NOT NULL,
 sequence INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('start','success','fail')),
 received_at INTEGER NOT NULL,
 started_at INTEGER,
 duration_ms INTEGER,
 exit_code INTEGER,
 output TEXT NOT NULL,
 late INTEGER NOT NULL DEFAULT 0,
 UNIQUE(monitor_id,revision,sequence)
);
CREATE INDEX heartbeat_runs_history ON heartbeat_runs(monitor_id,received_at,id);
ALTER TABLE heartbeat_authority ADD COLUMN last_completed_id TEXT;
ALTER TABLE heartbeat_authority ADD COLUMN started_at INTEGER;
ALTER TABLE heartbeat_claims ADD COLUMN job_snapshot TEXT;
