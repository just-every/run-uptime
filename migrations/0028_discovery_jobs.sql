-- A discovery job asks the owner's runner to check one URL and look around the site; the console reads back proposed
-- monitors. The Worker never fetches the target: it only queues the question and stores the runner's derived answer
-- (hosts, notes and proposed definitions, never a response body). A job lives at most 120 seconds unclaimed or running.
-- Discovery history is installation-local and does not travel in archives. Nothing here touches monitors, slots,
-- observations, state, the outbox or notifications.
CREATE TABLE discovery_jobs(
 id TEXT PRIMARY KEY,
 url TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','done','failed','expired')),
 created_at INTEGER NOT NULL,
 claimed_at INTEGER,
 runner_id TEXT,
 network_label TEXT,
 finished_at INTEGER,
 result TEXT,
 error TEXT
);
CREATE INDEX discovery_jobs_status ON discovery_jobs(status,created_at);
