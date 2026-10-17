-- Route policy is installation-local. Restored destinations start disabled and
-- the receiving owner must deliberately configure local routing again.
CREATE TABLE alert_routes (
 scope_kind TEXT NOT NULL CHECK(scope_kind IN ('installation','monitor','service','group')),
 scope_value TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('all','inherit','selected')),
 destination_ids TEXT NOT NULL,
 revision INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(scope_kind,scope_value),
 CHECK((scope_kind='installation' AND scope_value='' AND mode IN ('all','selected')) OR (scope_kind<>'installation' AND scope_value<>'' AND mode IN ('inherit','selected')))
);
CREATE TABLE alert_route_changes (
 id TEXT PRIMARY KEY,scope_kind TEXT NOT NULL,scope_value TEXT NOT NULL,
 previous_policy TEXT NOT NULL,current_policy TEXT NOT NULL,
 changed_at INTEGER NOT NULL,actor_ref TEXT
);
CREATE INDEX alert_route_changes_scope ON alert_route_changes(scope_kind,scope_value,changed_at);
-- A recovery belongs to the original matched destination and credential. It
-- waits for provider acceptance of that destination's trigger before dispatch.
CREATE TABLE alert_recovery_matches (
 recovery_job_id TEXT PRIMARY KEY,trigger_job_id TEXT NOT NULL
);
CREATE INDEX alert_recovery_matches_trigger ON alert_recovery_matches(trigger_job_id);
