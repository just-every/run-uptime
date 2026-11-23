-- Rebuild the derived projection with stable slot IDs, compact canary flags,
-- and smaller UTC-aligned buckets. At each supported cadence a bucket covers
-- at most 360 scheduled checks (apart from cadence transitions).
DROP TRIGGER IF EXISTS availability_slot_status;
DROP TRIGGER IF EXISTS availability_observation_insert;
DROP VIEW IF EXISTS availability_bucket_slots;

CREATE VIEW availability_bucket_slots AS
WITH scheduled AS (
  SELECT s.*,
    COALESCE(json_extract(s.definition,'$.type')='heartbeat',0) AS is_heartbeat,
    COALESCE(json_extract(s.definition,'$.heartbeat.maxAgeMs'),0) AS heartbeat_age,
    json_type(s.definition,'$.assignments') IS NOT NULL AS assigned,
    json_array_length(s.definition,'$.probes') AS probe_count,
    CASE
    WHEN json_extract(s.definition,'$.intervalMs') < 10000 THEN 1800000
    WHEN json_extract(s.definition,'$.intervalMs') < 20000 THEN 3600000
    WHEN json_extract(s.definition,'$.intervalMs') < 30000 THEN 7200000
    WHEN json_extract(s.definition,'$.intervalMs') < 60000 THEN 10800000
    ELSE 21600000
  END AS bucket_width
  FROM slots s WHERE s.manual=0
)
SELECT s.id AS slot_key, s.monitor_id, s.due_at,
  s.due_at / s.bucket_width * s.bucket_width AS starts_at,
  -- Reduce each immutable attempt chain once. Reporting receives the bounds
  -- of each slot and its final latency samples, without reclassifying attempts.
  jsonb_array(s.id,s.due_at,s.revision,s.status,
    json_extract(s.definition,'$.enabled'),json_extract(s.definition,'$.intervalMs'),
    (SELECT jsonb_array(
      MAX(completed), MAX(duration),
      MIN(CASE WHEN selected AND completed IS NOT NULL THEN
        MIN(completed,COALESCE(canary_completed,completed))+json_extract(s.definition,'$.freshnessMs') END),
      MAX(CASE WHEN s.is_heartbeat THEN max_heartbeat_at END), MAX(max_completed_at),
      COUNT(*)=s.probe_count AND COALESCE(MIN(COALESCE(outcome='pass',0) AND target_failures=0),1),
      COUNT(*)=s.probe_count AND COALESCE(MIN(CASE WHEN selected AND runner_errors=0 AND invalid_attempts=0
          AND (s.assigned OR (attempt_count=last_attempt+1 AND first_attempt=0))
          AND outcome IN ('pass','target_failure','runner_error')
          AND (NOT s.is_heartbeat OR outcome<>'pass' OR (received IS NOT NULL AND started IS NOT NULL
            AND completed IS NOT NULL AND received<=started AND completed-received<=s.heartbeat_age))
          AND (NOT canary OR (failed_canaries=0 AND canary_outcome='pass' AND canary_completed IS NOT NULL))
        THEN 1 ELSE 0 END),1),
      MIN(CASE WHEN s.is_heartbeat AND outcome='pass' AND selected THEN received+s.heartbeat_age END),
      MAX(CASE WHEN canary THEN canary_completed END),
      jsonb_group_array(jsonb_array(probe,completed,duration))
    ) FROM (
      SELECT *, EXISTS(SELECT 1 FROM json_each(s.definition,'$.probes') WHERE value=probe) AS selected,
        json_extract(s.definition,'$.assignments.'||json_quote(probe)||'.canaryUrl') IS NOT NULL AS canary,
        json_extract(final,'$[2]') AS outcome,json_extract(final,'$[3]') AS started,
        json_extract(final,'$[4]') AS completed,json_extract(final,'$[5]') AS duration,
        json_extract(final,'$[6]') AS received,json_extract(final,'$[7]') AS canary_outcome,
        json_extract(final,'$[8]') AS canary_completed
      FROM (
        SELECT probe, COUNT(*) AS attempt_count, MIN(attempt) AS first_attempt, MAX(attempt) AS last_attempt,
          SUM(CASE WHEN outcome='target_failure' THEN 1 ELSE 0 END) AS target_failures,
          SUM(CASE WHEN outcome='runner_error' THEN 1 ELSE 0 END) AS runner_errors,
          SUM(invalid) AS invalid_attempts, MAX(completed_at) AS max_completed_at,
          MAX(heartbeat_at) AS max_heartbeat_at,
          SUM(CASE WHEN canary_outcome IS NOT NULL AND canary_outcome<>'pass' THEN 1 ELSE 0 END) AS failed_canaries,
          -- Attempt is nonnegative and fits a signed SQLite integer. Its
          -- zero-padded key makes MAX select the final probe attempt.
          MAX(json_array(printf('%020d',attempt),attempt,outcome,started_at,completed_at,duration_ms,
            heartbeat_at,canary_outcome,canary_at)) AS final
        FROM (
          SELECT o.probe, o.attempt, json_extract(o.evidence,'$.outcome') AS outcome,
            json_extract(o.evidence,'$.startedAt') AS started_at,
            json_extract(o.evidence,'$.completedAt') AS completed_at,
            json_extract(o.evidence,'$.durationMs') AS duration_ms,
            json_extract(o.evidence,'$.heartbeatReceivedAt') AS heartbeat_at,
            json_extract(o.evidence,'$.canary.outcome') AS canary_outcome,
            json_extract(o.evidence,'$.canary.completedAt') AS canary_at,
            CASE WHEN
              COALESCE(json_type(o.evidence,'$.startedAt'),'')!='integer' OR
              COALESCE(json_type(o.evidence,'$.completedAt'),'')!='integer' OR
              COALESCE(json_type(o.evidence,'$.durationMs'),'')!='integer' OR
              json_extract(o.evidence,'$.startedAt')<s.due_at OR
              json_extract(o.evidence,'$.completedAt')<json_extract(o.evidence,'$.startedAt') OR
              json_extract(o.evidence,'$.durationMs')<0 OR
              ABS(json_extract(o.evidence,'$.durationMs')-
                (json_extract(o.evidence,'$.completedAt')-json_extract(o.evidence,'$.startedAt')))>1 OR
              json_extract(o.evidence,'$.startedAt')>9007199254740991 OR
              json_extract(o.evidence,'$.completedAt')>9007199254740991 OR
              json_extract(o.evidence,'$.durationMs')>9007199254740991 OR
              (json_extract(s.definition,'$.type')='heartbeat' AND json_type(o.evidence,'$.heartbeatReceivedAt') IS NOT NULL AND (
                COALESCE(json_type(o.evidence,'$.heartbeatReceivedAt'),'')!='integer' OR
                json_extract(o.evidence,'$.heartbeatReceivedAt')<0 OR
                json_extract(o.evidence,'$.heartbeatReceivedAt')>9007199254740991
              ))
            THEN 1 ELSE 0 END AS invalid
          FROM observations o WHERE o.slot_id=s.id
        ) GROUP BY probe
      )
    )),
    s.due_at+json_extract(s.definition,'$.intervalMs')+MAX(30000,
      (s.probe_count*(json_extract(s.definition,'$.retries')+1)+
        (SELECT COUNT(*) FROM json_each(s.definition,'$.assignments') WHERE json_extract(value,'$.canaryUrl') IS NOT NULL))
      *json_extract(s.definition,'$.timeoutMs')+10000)+1000
  ) AS record
FROM scheduled s;

-- Preserve both the upgrade window and previously hydrated days. Source
-- evidence is authoritative, including slots written after the first upgrade.
DELETE FROM availability_buckets;
INSERT INTO availability_buckets(monitor_id,starts_at,slots)
SELECT monitor_id,starts_at,jsonb_group_object(slot_key,record)
FROM availability_bucket_slots
WHERE monitor_id IN (SELECT id FROM monitors)
  AND due_at >= (SELECT day FROM availability_bucket_history WHERE monitor_id='' AND day>=0)
GROUP BY monitor_id,starts_at;

INSERT INTO availability_buckets(monitor_id,starts_at,slots)
SELECT b.monitor_id,b.starts_at,jsonb_group_object(b.slot_key,b.record)
FROM availability_bucket_history h CROSS JOIN availability_bucket_slots b
WHERE h.monitor_id<>'' AND b.monitor_id=h.monitor_id AND b.due_at>=h.day AND b.due_at<h.day+86400000
GROUP BY b.monitor_id,b.starts_at
ON CONFLICT(monitor_id,starts_at) DO UPDATE SET slots=excluded.slots,version=excluded.version;

CREATE TRIGGER availability_slot_status AFTER UPDATE OF status ON slots
WHEN new.manual=0 AND new.status<>old.status BEGIN
  UPDATE availability_buckets
  SET slots=jsonb_set(slots,'$.'||json_quote(new.id)||'[3]',new.status),version=lower(hex(randomblob(12)))
  WHERE monitor_id=new.monitor_id
    AND starts_at=(SELECT starts_at FROM availability_bucket_slots WHERE slot_key=new.id)
    AND json_type(slots,'$.'||json_quote(new.id))='array';
END;

-- Whole-installation archive restore runs in one batch and builds the
-- projection in bulk. The marker is present only inside that transaction.
CREATE TRIGGER availability_observation_insert AFTER INSERT ON observations
WHEN NOT EXISTS (SELECT 1 FROM availability_bucket_history WHERE monitor_id='' AND day=-1) BEGIN
  INSERT INTO availability_buckets(monitor_id,starts_at,slots)
  SELECT monitor_id,starts_at,jsonb_object(slot_key,record)
  FROM availability_bucket_slots WHERE slot_key=new.slot_id
  ON CONFLICT(monitor_id,starts_at) DO UPDATE SET slots=jsonb_patch(slots,excluded.slots),version=excluded.version;
END;
