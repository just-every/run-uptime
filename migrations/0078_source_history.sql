-- Sourced incumbent history is never monitoring evidence or execution authority.
CREATE TABLE source_history_batches (
 id TEXT NOT NULL, monitor_id TEXT NOT NULL REFERENCES monitors(id), source TEXT NOT NULL,
 source_monitor_id TEXT NOT NULL, file_digest TEXT NOT NULL, extracted_at INTEGER,
 coverage_from INTEGER NOT NULL, coverage_to INTEGER NOT NULL, imported_at INTEGER NOT NULL,
 restored_at INTEGER, PRIMARY KEY(id,monitor_id), CHECK(coverage_to>=coverage_from)
);
CREATE TABLE source_history_rows (
 monitor_id TEXT NOT NULL REFERENCES monitors(id), source TEXT NOT NULL, source_row_id TEXT NOT NULL,
 batch_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('down','up','incident','response')),
 started_at INTEGER NOT NULL, ended_at INTEGER, response_ms REAL, source_duration_seconds REAL,
 author TEXT NOT NULL, comments TEXT NOT NULL, root_cause TEXT NOT NULL, included INTEGER NOT NULL,
 PRIMARY KEY(monitor_id,source,source_row_id),
 FOREIGN KEY(batch_id,monitor_id) REFERENCES source_history_batches(id,monitor_id),
 CHECK(ended_at IS NULL OR ended_at>=started_at)
);
CREATE INDEX source_history_period ON source_history_rows(monitor_id,started_at);
CREATE TABLE source_history_cutovers (
 monitor_id TEXT PRIMARY KEY REFERENCES monitors(id), cutover_at INTEGER NOT NULL
);
