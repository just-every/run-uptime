-- Retain genuine pre-upgrade contact for the migrated runner. This avoids an
-- unnecessary stale-contact notice immediately after applying the new table.
UPDATE runners SET last_contact_at=(SELECT last_contact_at FROM runner_contact WHERE id=1)
 WHERE legacy_key=1 AND last_contact_at IS NULL;
