-- Leave the original migration intact, but defer its oversized backfill on
-- installations that have not applied it. The bounded rebuild replaces this
-- view from canonical evidence. IF NOT EXISTS preserves an applied view.
CREATE VIEW IF NOT EXISTS availability_bucket_slots AS
SELECT id AS slot_key, monitor_id, due_at, due_at AS starts_at, NULL AS record
FROM slots WHERE 0;
