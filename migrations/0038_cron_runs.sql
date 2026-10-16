-- The latest Cron invocation, so the console says Cloudflare's first-run delay applies only until a run is seen.
CREATE TABLE cron_runs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  at INTEGER NOT NULL
);
