CREATE TABLE failure_snapshots (
 observation_id TEXT PRIMARY KEY,
 monitor_id TEXT NOT NULL REFERENCES monitors(id),
 slot_id TEXT NOT NULL REFERENCES slots(id),
 captured_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 snapshot TEXT NOT NULL
);
CREATE INDEX failure_snapshots_monitor ON failure_snapshots(monitor_id,captured_at DESC,observation_id);
CREATE INDEX failure_snapshots_expiry ON failure_snapshots(expires_at);
CREATE TABLE failure_snapshot_settings (
 monitor_id TEXT PRIMARY KEY REFERENCES monitors(id),
 version INTEGER NOT NULL DEFAULT 1,
 retention_days INTEGER NOT NULL DEFAULT 90,
 masks TEXT NOT NULL DEFAULT '[]'
);
