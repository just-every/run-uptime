-- OPS-001: auxiliary execution history is evidence, not dispatch authority.
CREATE TABLE auxiliary_attempts (
 id TEXT PRIMARY KEY,
 scope TEXT NOT NULL CHECK(scope IN ('watch','auth-mail')),
 job_id TEXT NOT NULL,
 started_at INTEGER NOT NULL,
 lease_until INTEGER NOT NULL,
 submitted_at INTEGER,
 finished_at INTEGER,
 outcome TEXT NOT NULL CHECK(outcome IN ('claimed','sending','accepted','development','rejected','rate_limited','uncertain','expired')),
 code TEXT NOT NULL
);
CREATE UNIQUE INDEX auxiliary_active_job ON auxiliary_attempts(scope,job_id) WHERE finished_at IS NULL;
CREATE INDEX auxiliary_job_history ON auxiliary_attempts(scope,job_id,started_at);
CREATE INDEX auxiliary_expiring ON auxiliary_attempts(lease_until) WHERE finished_at IS NULL;
-- Preserve pre-upgrade deduplication. A legacy 'sending' row has no recoverable
-- transport boundary, so it must remain uncertain rather than be replayed.
INSERT INTO auxiliary_attempts(id,scope,job_id,started_at,lease_until,submitted_at,finished_at,outcome,code)
 SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(6))),
 'watch',id,at,at+60000,NULL,at,
 CASE WHEN outcome IN ('accepted','development','rejected','rate_limited') THEN outcome ELSE 'uncertain' END,'migrated_latest_outcome'
 FROM monitoring_watch;
UPDATE monitoring_watch SET outcome='uncertain' WHERE outcome NOT IN ('accepted','development','rejected','rate_limited');
