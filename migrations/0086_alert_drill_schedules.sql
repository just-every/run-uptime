-- Installation-local consent and bounded agent work, never portable sending authority.
CREATE TABLE alert_drill_consents(
 id TEXT PRIMARY KEY, destination_id TEXT NOT NULL, credential_id TEXT NOT NULL,
 issuer_id TEXT NOT NULL, owner_id TEXT NOT NULL, config TEXT NOT NULL,
 created_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE INDEX alert_drill_consent_destination ON alert_drill_consents(destination_id,created_at);
CREATE TABLE alert_drill_schedules(
 id TEXT PRIMARY KEY, consent_id TEXT NOT NULL UNIQUE, principal TEXT NOT NULL,
 next_due INTEGER NOT NULL, drills INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE alert_drill_runs(
 id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, due_at INTEGER NOT NULL, drill_id TEXT,
 code TEXT NOT NULL, proposal TEXT NOT NULL DEFAULT 'open', reminder_count INTEGER NOT NULL DEFAULT 0,
 next_reminder INTEGER NOT NULL, UNIQUE(schedule_id,due_at)
);
CREATE TABLE alert_drill_reminders(
 run_id TEXT NOT NULL, number INTEGER NOT NULL, owner_id TEXT NOT NULL, at INTEGER NOT NULL,
 PRIMARY KEY(run_id,number)
);
