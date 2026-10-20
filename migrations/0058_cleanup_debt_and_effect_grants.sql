-- API-004. cleanup_debt: one retained record per cleanup step a run could not complete. It names the monitor, revision,
-- scheduled slot and attempt, the step and its bounded attempt count, and the last failure category; it holds no extracted
-- value, credential or response body. Only an owner's resolution, with a short note, closes it.
CREATE TABLE IF NOT EXISTS cleanup_debt (
    id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL, revision INTEGER NOT NULL, slot_id TEXT NOT NULL, probe TEXT NOT NULL,
    attempt INTEGER NOT NULL, observation_id TEXT NOT NULL, step_name TEXT NOT NULL, attempts INTEGER NOT NULL,
    category TEXT NOT NULL, created_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved')),
    resolver_note TEXT, resolved_at INTEGER);
CREATE INDEX IF NOT EXISTS cleanup_debt_monitor ON cleanup_debt(monitor_id, state);
-- effect_grants: an owner's exact, time-limited permission for one monitor's live effect, with an integer spend limit.
-- Each change is a new revision; the installation default is no grant. Grants are execution authority and stay local.
CREATE TABLE IF NOT EXISTS effect_grants (
    id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL, effect TEXT NOT NULL, revision INTEGER NOT NULL, spend_limit INTEGER NOT NULL,
    spent INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER,
    UNIQUE(monitor_id, effect, revision));
