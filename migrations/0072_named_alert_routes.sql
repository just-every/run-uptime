-- Immutable named copies and reviewed catalog assignments are local configuration, never restored authority.
CREATE TABLE alert_named_routes(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,policy TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE catalog_route_batches(id TEXT PRIMARY KEY,route_id TEXT NOT NULL REFERENCES alert_named_routes(id),created_at INTEGER NOT NULL,actor_kind TEXT NOT NULL,actor_ref TEXT NOT NULL,counts TEXT NOT NULL,undone_at INTEGER);
CREATE TABLE catalog_route_batch_entries(batch_id TEXT NOT NULL REFERENCES catalog_route_batches(id),monitor_id TEXT NOT NULL REFERENCES monitors(id),monitor_revision INTEGER NOT NULL,previous_policy TEXT NOT NULL,applied_policy TEXT NOT NULL,applied_revision INTEGER NOT NULL,PRIMARY KEY(batch_id,monitor_id));
CREATE INDEX catalog_route_entries_monitor ON catalog_route_batch_entries(monitor_id);
