-- ROUTING-001. Recipient authority is installation-local; no existing recipient
-- is opted in and no existing route acquires filters or quiet hours on upgrade.
CREATE TABLE alert_teams(id TEXT PRIMARY KEY,name TEXT NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE alert_team_members(team_id TEXT NOT NULL REFERENCES alert_teams(id),operator_id TEXT NOT NULL REFERENCES oa_operators(id),PRIMARY KEY(team_id,operator_id));
CREATE TABLE alert_recipient_consents(destination_id TEXT PRIMARY KEY REFERENCES notification_destinations(id),operator_id TEXT NOT NULL REFERENCES oa_operators(id),credential_id TEXT NOT NULL,base_version INTEGER NOT NULL,role_revision INTEGER NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),updated_at INTEGER NOT NULL);
-- A missing/anonymized original recipient never releases this gate. The row is
-- erased with its job; operator erasure anonymizes the identity and denies it.
CREATE TABLE alert_team_deliveries(trigger_job_id TEXT PRIMARY KEY REFERENCES notification_jobs(id),operator_id TEXT,team_ids TEXT NOT NULL);
ALTER TABLE alert_routes ADD COLUMN team_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE alert_routes ADD COLUMN filters TEXT NOT NULL DEFAULT '{}';
ALTER TABLE alert_routes ADD COLUMN quiet_hours TEXT;
ALTER TABLE alert_contact_schedules ADD COLUMN route_quiet_rules TEXT;
ALTER TABLE alert_fallback_chains ADD COLUMN route_quiet_rules TEXT;
