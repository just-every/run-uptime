-- Discovery is installation-local; initiator authority is rechecked at claim/result.
ALTER TABLE discovery_jobs ADD COLUMN initiator_id TEXT;
ALTER TABLE discovery_jobs ADD COLUMN initiator_version INTEGER;
ALTER TABLE discovery_jobs ADD COLUMN initiator_role TEXT;
ALTER TABLE discovery_jobs ADD COLUMN initiator_revision INTEGER;
ALTER TABLE discovery_jobs ADD COLUMN initiator_base_role TEXT;
ALTER TABLE discovery_jobs ADD COLUMN stopped_at INTEGER;
ALTER TABLE discovery_jobs ADD COLUMN stop_reason TEXT;
