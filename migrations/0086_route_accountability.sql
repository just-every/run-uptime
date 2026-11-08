-- AGENT-004. The company's consent, drill windows and reminder policy for scheduled alert-route accountability, with the
-- per-destination credential expiry and internal route owner, the drills the schedule started, the owner reminders it
-- chased and the route changes it proposed. Everything here is installation-local: a restored installation has no
-- consent and the receiving owner grants it again. Nothing here sends a message or changes a route by itself.
CREATE TABLE route_accountability_policy(
 id INTEGER PRIMARY KEY CHECK(id=1),
 consented_by TEXT NOT NULL,
 consented_at INTEGER NOT NULL,
 enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),
 window_days TEXT NOT NULL,
 window_start_hour INTEGER NOT NULL CHECK(window_start_hour BETWEEN 0 AND 23),
 window_end_hour INTEGER NOT NULL CHECK(window_end_hour BETWEEN 1 AND 24 AND window_end_hour>window_start_hour),
 interval_days INTEGER NOT NULL CHECK(interval_days BETWEEN 1 AND 365),
 max_drills_per_day INTEGER NOT NULL CHECK(max_drills_per_day BETWEEN 1 AND 20),
 reminder_after_hours INTEGER NOT NULL CHECK(reminder_after_hours BETWEEN 0 AND 720),
 reminder_repeat_hours INTEGER NOT NULL CHECK(reminder_repeat_hours BETWEEN 1 AND 720),
 reminder_max INTEGER NOT NULL CHECK(reminder_max BETWEEN 1 AND 10),
 revision INTEGER NOT NULL
);
CREATE TABLE route_accountability_destinations(
 destination_id TEXT PRIMARY KEY,
 credential_expires_at INTEGER,
 owner_id TEXT,
 updated_at INTEGER NOT NULL
);
CREATE INDEX route_accountability_destinations_owner ON route_accountability_destinations(owner_id);
CREATE TABLE route_accountability_drills(
 drill_id TEXT PRIMARY KEY,
 destination_id TEXT NOT NULL,
 scheduled_at INTEGER NOT NULL
);
CREATE INDEX route_accountability_drills_destination ON route_accountability_drills(destination_id,scheduled_at);
CREATE TABLE route_accountability_reminders(
 id TEXT PRIMARY KEY,
 drill_id TEXT NOT NULL,
 destination_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 number INTEGER NOT NULL,
 due_at INTEGER NOT NULL,
 outcome TEXT NOT NULL DEFAULT 'pending',
 submitted_at INTEGER,
 finished_at INTEGER,
 UNIQUE(drill_id,number)
);
CREATE INDEX route_accountability_reminders_owner ON route_accountability_reminders(owner_id);
CREATE INDEX route_accountability_reminders_due ON route_accountability_reminders(due_at) WHERE outcome='pending';
CREATE TABLE route_accountability_proposals(
 id TEXT PRIMARY KEY,
 destination_id TEXT NOT NULL,
 candidate_id TEXT,
 reason TEXT NOT NULL,
 evidence TEXT NOT NULL,
 change TEXT NOT NULL,
 route_revision INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','approved','declined','superseded')),
 created_at INTEGER NOT NULL,
 decided_by TEXT,
 decided_at INTEGER
);
CREATE UNIQUE INDEX route_accountability_proposals_pending ON route_accountability_proposals(destination_id) WHERE state='pending';
CREATE INDEX route_accountability_proposals_candidate ON route_accountability_proposals(candidate_id);
