ALTER TABLE alert_routes ADD COLUMN contact_settings TEXT NOT NULL DEFAULT '{}';
-- Installation-local dispatch authority, snapshotted at confirmation, never restored active.
CREATE TABLE alert_contact_schedules (
 trigger_job_id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL, incident_key TEXT NOT NULL,
 due_at INTEGER NOT NULL, repeat_ms INTEGER NOT NULL, max_repeats INTEGER,
 emitted_repeats INTEGER NOT NULL DEFAULT 0, next_at INTEGER,
 recovery INTEGER NOT NULL, stop_on_ack INTEGER NOT NULL
);
CREATE INDEX alert_contact_schedules_due ON alert_contact_schedules(next_at);
