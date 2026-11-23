-- Keep the migration position without building a full-history index that
-- 0091 immediately drops. 0091 creates the bounded live-lease index.
DROP INDEX IF EXISTS slots_status_lease;
