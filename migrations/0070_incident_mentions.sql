-- Mention history travels; live recipient admission and dispatch authority do not.
CREATE TABLE incident_mentions(
 id TEXT PRIMARY KEY,comment_id TEXT NOT NULL,incident_id TEXT NOT NULL,monitor_id TEXT NOT NULL,
 comment_version INTEGER NOT NULL,recipient_id TEXT NOT NULL,created_at INTEGER NOT NULL,
 submitted_at INTEGER,finished_at INTEGER,outcome TEXT NOT NULL,
 UNIQUE(comment_id,comment_version,recipient_id),
 CHECK(outcome IN('pending','submitting','accepted','development','rejected','rate_limited','uncertain','cancelled','unavailable','imported-inactive'))
);
CREATE INDEX incident_mentions_comment ON incident_mentions(comment_id,created_at,id);
CREATE TABLE incident_mention_authority(
 id TEXT PRIMARY KEY REFERENCES incident_mentions(id),monitor_id TEXT NOT NULL,
 operator_version INTEGER NOT NULL,role_revision INTEGER NOT NULL
);
