-- Sanitized originals of records transformed by inactive restore. These records
-- are historical product data only and never queried by scheduling/dispatch.
CREATE TABLE archive_history (
 id TEXT PRIMARY KEY,
 table_name TEXT NOT NULL,
 record TEXT NOT NULL
);
