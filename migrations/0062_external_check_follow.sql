-- Monitors follow the External check URL in Settings live (owner, 20 Oct 2026, U14): a revision saved from now on says
-- externalCheck "settings" (each check is handed the URL Settings holds then) or "own". A revision saved before then copied
-- the URL in force when it was saved; legacy_url records the URL in force now, so copies of it follow Settings too, and any
-- other URL stays the monitor's own. Revisions, slots and evidence are untouched; this row stays installation-local. Each
-- delivered part of a check records the external check URL its runner was handed (installation-local, like the assignment).
ALTER TABLE external_check ADD COLUMN legacy_url TEXT;
UPDATE external_check SET legacy_url=url WHERE id=1;
ALTER TABLE runner_assignments ADD COLUMN external_check_url TEXT;
