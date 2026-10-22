-- DISCOVERY-001: discovery sources the owner authorizes (a domain, robots and sitemap, an OpenAPI document, a Route 53 or
-- Cloudflare zone, or GitHub Actions, Vercel, Netlify or AWS CodeDeploy deployments). The Worker keeps only the kind, the
-- identifiers, a label, who authorized it and when; a provider credential stays in a file on the owner's runner, named here only
-- by its reference. A source restored from an archive is inactive until the receiving owner authorizes it again.
CREATE TABLE discovery_sources(
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL,
 label TEXT NOT NULL,
 identifiers TEXT NOT NULL,
 authorized_by TEXT,
 authorized_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','inactive'))
);
-- Each owner-started run that finished: its derived candidates with their provenance (the previous-run snapshot the next run is
-- compared with), or the reason it failed. Started runs live in discovery_jobs until they finish.
CREATE TABLE discovery_source_runs(
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL,
 started_at INTEGER NOT NULL,
 finished_at INTEGER NOT NULL,
 since INTEGER,
 status TEXT NOT NULL CHECK(status IN ('done','failed')),
 result TEXT,
 error TEXT
);
CREATE INDEX discovery_source_runs_source ON discovery_source_runs(source_id,started_at);
-- The owner's review of a proposal: rejected, or adopted as the named monitor through the monitor door. Nothing here runs anything.
CREATE TABLE discovery_decisions(
 source_id TEXT NOT NULL,
 candidate_key TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('rejected','adopted')),
 monitor_id TEXT,
 run_id TEXT NOT NULL,
 decided_at INTEGER NOT NULL,
 actor_id TEXT,
 PRIMARY KEY(source_id,candidate_key)
);
