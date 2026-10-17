-- Human incident work is separate from immutable monitoring evidence.
CREATE TABLE incident_work (
 incident_id TEXT PRIMARY KEY NOT NULL, monitor_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 0, owner_id TEXT,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),
 stop_reason TEXT CHECK(stop_reason IN ('member_stop','manual_resolution')),
 acknowledged_at INTEGER, resolved_at INTEGER,
 root_version INTEGER NOT NULL DEFAULT 0, root_category_id TEXT, root_category_label TEXT,
 root_text TEXT NOT NULL DEFAULT '', root_updated_at INTEGER, root_editor_id TEXT
);
CREATE INDEX incident_work_monitor ON incident_work(monitor_id);
CREATE TABLE incident_comments (
 id TEXT PRIMARY KEY NOT NULL, incident_id TEXT NOT NULL, monitor_id TEXT NOT NULL,
 author_id TEXT, text TEXT, version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
 CHECK((deleted_at IS NULL AND text IS NOT NULL AND length(text)<=5000) OR (deleted_at IS NOT NULL AND text IS NULL))
);
CREATE INDEX incident_comments_incident ON incident_comments(incident_id,created_at,id);
CREATE TABLE incident_comment_history (
 id TEXT PRIMARY KEY NOT NULL, comment_id TEXT NOT NULL, incident_id TEXT NOT NULL, monitor_id TEXT NOT NULL,
 version INTEGER NOT NULL, text TEXT NOT NULL CHECK(length(text)<=5000), editor_id TEXT, edited_at INTEGER NOT NULL,
 UNIQUE(comment_id,version)
);
CREATE INDEX incident_comment_history_monitor ON incident_comment_history(monitor_id);
CREATE TABLE incident_timeline (
 id TEXT PRIMARY KEY NOT NULL, incident_id TEXT NOT NULL, monitor_id TEXT NOT NULL,
 occurred_at INTEGER NOT NULL, actor_id TEXT, kind TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX incident_timeline_incident ON incident_timeline(incident_id,occurred_at,id);
CREATE TABLE incident_settings (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL, categories TEXT NOT NULL
);
