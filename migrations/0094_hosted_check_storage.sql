-- A Worker-owned scheduled slot has a single producer. Keep its delivery
-- envelope and exact attempts together on that slot, including receipt clocks.
-- Signed, delegated, manual and pre-upgrade submissions retain their tables.
ALTER TABLE slots ADD COLUMN hosted TEXT;
ALTER TABLE monitors ADD COLUMN hosted_slot TEXT;
ALTER TABLE monitors ADD COLUMN hosted_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monitors ADD COLUMN hosted_checkpoint TEXT;

-- Keep the indexes from 0025 and 0091. Rebuilding the projection would
-- write one row per retained slot, and the live-lease index also covers hosted slots.

CREATE VIEW IF NOT EXISTS check_observations AS
  SELECT id,slot_id,probe,attempt,evidence,rowid AS storage_order,0 AS packed FROM observations
  UNION ALL
  SELECT json_extract(o.value,'$.id'),s.id,json_extract(o.value,'$.probe'),
    json_extract(o.value,'$.attempt'),o.value,s.rowid,1
  FROM slots s CROSS JOIN json_each(s.hosted,'$.attempts') o;

CREATE VIEW IF NOT EXISTS check_assignments AS
  SELECT slot_id,probe,runner_id,delivered_at,received_times,external_check_url FROM runner_assignments
  UNION ALL
  SELECT s.id,a.key,json_extract(s.hosted,'$.runnerId'),json_extract(s.hosted,'$.deliveredAt'),
    COALESCE(json_extract(s.hosted,'$.receivedTimes."'||a.key||'"'), '{}'),json_extract(a.value,'$.canaryUrl')
  FROM slots s CROSS JOIN json_each(s.hosted,'$.assignments') a;
