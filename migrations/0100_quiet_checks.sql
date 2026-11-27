-- A Worker check that passed with nothing to report is stored with its
-- availability bucket instead of as a slot row: one row write for many checks.
-- `checks` holds, under each such check's slot id, what its slot row would
-- have held. Existing rows keep NULL and no row is rewritten.
ALTER TABLE availability_buckets ADD COLUMN checks BLOB;
