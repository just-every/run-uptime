-- Installation-local authority to stop selected performance reminders.
CREATE TABLE slow_acknowledgements (
 opening_event_id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL,
 actor_id TEXT, acknowledged_at INTEGER NOT NULL
);
CREATE INDEX slow_acknowledgements_monitor ON slow_acknowledgements(monitor_id);
