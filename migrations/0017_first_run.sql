CREATE TABLE uptime_first_run (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  completed_at INTEGER NOT NULL
);
-- An installation already monitoring targets has completed its first run.
INSERT INTO uptime_first_run (id, completed_at)
SELECT 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM monitors);
