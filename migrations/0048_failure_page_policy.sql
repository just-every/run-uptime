ALTER TABLE failure_snapshot_settings ADD COLUMN safe_values TEXT NOT NULL DEFAULT '{"requestHeaders":[],"responseHeaders":[],"email":false}';
ALTER TABLE failure_snapshot_settings ADD COLUMN screenshot INTEGER NOT NULL DEFAULT 0;
CREATE TABLE failure_evidence_grants (
 monitor_id TEXT NOT NULL REFERENCES monitors(id),
 operator_id TEXT NOT NULL REFERENCES oa_operators(id),
 granted_at INTEGER NOT NULL,
 PRIMARY KEY(monitor_id,operator_id)
);
