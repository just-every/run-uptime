-- Installation-local destinations and credentials are deliberately excluded from archives.
CREATE TABLE notification_destinations (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('email','webhook','slack')),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), credential_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 deleted_at INTEGER
);
CREATE TABLE notification_credentials (
 id TEXT PRIMARY KEY, destination_id TEXT NOT NULL, endpoint TEXT NOT NULL, signing_secret TEXT,
 created_at INTEGER NOT NULL
);
CREATE TABLE notification_jobs (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL, destination_id TEXT NOT NULL, destination_name TEXT NOT NULL,
 kind TEXT NOT NULL, credential_id TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued', code TEXT NOT NULL DEFAULT 'waiting_for_runner',
 claim TEXT, claim_until INTEGER, finished_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
 UNIQUE(event_id,destination_id)
);
CREATE INDEX notification_jobs_queued ON notification_jobs(state,created_at);
