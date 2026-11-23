-- The guarded hosted monitor update carries the short list of slot rowids
-- whose packed evidence has not yet been folded into the existing buckets.
ALTER TABLE monitors ADD COLUMN hosted_availability_tail TEXT NOT NULL DEFAULT '[]';

-- All calculations in this view concern one immutable slot. Report-clock and
-- revision bounds are applied by the reader using the recorded maxima.
DROP VIEW availability_bucket_slots;
CREATE VIEW availability_bucket_slots AS
SELECT s.rowid AS slot_key, s.monitor_id, s.due_at,
  s.due_at / CASE WHEN json_extract(s.definition,'$.intervalMs')<30000 THEN 3600000
      WHEN json_extract(s.definition,'$.intervalMs')<60000 THEN 21600000 ELSE 86400000 END *
    CASE WHEN json_extract(s.definition,'$.intervalMs')<30000 THEN 3600000
      WHEN json_extract(s.definition,'$.intervalMs')<60000 THEN 21600000 ELSE 86400000 END AS starts_at,
  CASE WHEN json_type(s.hosted,'$.availability')='array' THEN
    jsonb_set(jsonb_extract(s.hosted,'$.availability'),'$[3]',s.status)
  ELSE jsonb_array(s.id,s.due_at,s.revision,s.status,
    jsonb_object(
      'enabled',json_extract(s.definition,'$.enabled'),
      'intervalMs',json_extract(s.definition,'$.intervalMs'),
      'freshnessMs',json_extract(s.definition,'$.freshnessMs'),
      'probes',json_extract(s.definition,'$.probes'),
      'type',json_extract(s.definition,'$.type'),
      'heartbeat',jsonb_object('maxAgeMs',json_extract(s.definition,'$.heartbeat.maxAgeMs')),
      'retries',json_extract(s.definition,'$.retries'),
      'timeoutMs',json_extract(s.definition,'$.timeoutMs'),
      'assigned',json_type(s.definition,'$.assignments') IS NOT NULL,
      'assignments',CASE WHEN json_type(s.definition,'$.assignments') IS NOT NULL THEN
        (SELECT jsonb_group_object(key,jsonb_object('canaryUrl',json_extract(value,'$.canaryUrl')))
          FROM json_each(s.definition,'$.assignments')) END
    ),
    (SELECT jsonb_group_array(jsonb_array(
      probe, attempt_count, first_attempt, last_attempt, target_failures, runner_errors,
      invalid_attempts, max_completed_at, max_heartbeat_at, failed_canaries,
      jsonb_extract(final,'$[2]'), jsonb_extract(final,'$[3]'), jsonb_extract(final,'$[4]'),
      jsonb_extract(final,'$[5]'), jsonb_extract(final,'$[6]'), jsonb_extract(final,'$[7]'), jsonb_extract(final,'$[8]')
    )) FROM (
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
        FROM (
          SELECT o.probe,o.attempt,o.evidence FROM observations o WHERE o.slot_id=s.id
          UNION ALL
          SELECT json_extract(a.value,'$.probe'),json_extract(a.value,'$.attempt'),a.value
          FROM json_each(s.hosted,'$.attempts') a
        ) o
      ) GROUP BY probe
    ))
  ) END AS record
FROM slots s WHERE s.manual=0;

-- Legacy submissions still maintain buckets eagerly. Packed hosted records
-- are read from the tail until the acceptance transaction folds them.
DROP TRIGGER availability_slot_status;
CREATE TRIGGER availability_slot_status AFTER UPDATE OF status ON slots
WHEN new.manual=0 AND new.hosted IS NULL AND new.status<>old.status BEGIN
  UPDATE availability_buckets SET slots=jsonb_set(slots,'$."'||new.rowid||'"[3]',new.status),version=lower(hex(randomblob(12)))
  WHERE monitor_id=new.monitor_id AND json_type(slots,'$."'||new.rowid||'"')='array'
    AND starts_at=
    new.due_at / CASE WHEN json_extract(new.definition,'$.intervalMs')<30000 THEN 3600000
      WHEN json_extract(new.definition,'$.intervalMs')<60000 THEN 21600000 ELSE 86400000 END *
      CASE WHEN json_extract(new.definition,'$.intervalMs')<30000 THEN 3600000
      WHEN json_extract(new.definition,'$.intervalMs')<60000 THEN 21600000 ELSE 86400000 END;
END;
