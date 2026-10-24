-- One-time report snapshots use the existing single-attempt delivery custody.
CREATE TABLE scheduled_reports (
 id TEXT PRIMARY KEY,
 monitor_id TEXT NOT NULL,
 destination_id TEXT NOT NULL,
 actor_id TEXT,
 due_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 delivery_id TEXT NOT NULL UNIQUE,
 report TEXT NOT NULL
);
CREATE INDEX scheduled_reports_monitor ON scheduled_reports(monitor_id,created_at);
