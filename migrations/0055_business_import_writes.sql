-- IMPORT-001: the native revision each import-door apply wrote, so an archived batch names exactly that revision.
-- Installation-local import custody, never archived; an erasure of a monitor removes its rows.
CREATE TABLE uptime_business_import_writes (kit_revision TEXT PRIMARY KEY, monitor_id TEXT NOT NULL, native_revision INTEGER NOT NULL);
CREATE INDEX uptime_business_import_writes_monitor ON uptime_business_import_writes(monitor_id);
