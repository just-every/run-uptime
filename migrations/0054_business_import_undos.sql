-- IMPORT-001: when each import-door batch was undone, for the import history. Installation-local import custody,
-- never archived; an erasure that retires a batch's source removes its row.
CREATE TABLE uptime_business_import_undos (plan_id TEXT PRIMARY KEY, undone_at INTEGER NOT NULL);
