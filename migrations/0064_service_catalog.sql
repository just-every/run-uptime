-- DEPENDENCY-002: the third-party service catalog. A followed service is an ordinary dependency monitor (a revisioned
-- monitor row); followed_services only records which catalog entry and catalog version it was followed under, whether it is
-- the whole provider or one component, and when its status source last passed a live check (NULL for one an import mapped,
-- until the owner checks it). Provider incidents and recoveries are dependency notices (outbox kinds dependency and
-- dependency_recovery), never incidents, so no incident table changes. Additive only; no monitor, revision, slot or
-- observation is touched.
-- A catalog check is a discovery job the owner's runner answers: kind says which question, spec holds the catalog entry
-- and the chosen parts (never an address). Existing jobs are website checks.
ALTER TABLE discovery_jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'site';
ALTER TABLE discovery_jobs ADD COLUMN spec TEXT;
-- Portable: restores with the monitor it names, inactive, with no send. One monitor follows each catalog part.
CREATE TABLE followed_services(
 monitor_id TEXT PRIMARY KEY,
 entry_id TEXT NOT NULL,
 catalog_version INTEGER NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('whole','component')),
 component_key TEXT,
 followed_at INTEGER NOT NULL,
 checked_at INTEGER
);
CREATE UNIQUE INDEX followed_services_part ON followed_services(entry_id,scope,COALESCE(component_key,''));
-- Installation-local: the latest failed live check of a catalog entry (the source did not answer, moved, no longer parses
-- or is too large). A row means "needs review"; a passing check removes it. Rebuilt by checking again.
CREATE TABLE catalog_review(
 entry_id TEXT PRIMARY KEY,
 catalog_version INTEGER NOT NULL,
 problem TEXT NOT NULL,
 detail TEXT NOT NULL,
 checked_at INTEGER NOT NULL
);
-- Portable: a dependency notice acknowledged by the owner, alone or together with the incident group it belongs to
-- (a dependency the owner linked to the incident's monitor, FOLLOWUP-001). The notice's own outbox row is never rewritten.
CREATE TABLE dependency_acks(
 notice_id TEXT PRIMARY KEY,
 monitor_id TEXT NOT NULL,
 acknowledged_at INTEGER NOT NULL,
 actor_id TEXT,
 via_incident_id TEXT
);
