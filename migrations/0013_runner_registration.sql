-- One self-runner identity belongs to this installation, never to an archive.
CREATE TABLE runner_registration (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 runner_id TEXT NOT NULL UNIQUE,
 registered_at INTEGER NOT NULL
);
