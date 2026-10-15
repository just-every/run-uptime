// Historical coverage uses each immutable revision and ends at its next save.
export const availabilityQuery = `
WITH params AS (
  SELECT ? AS now_at, ? AS monitor_id, ? AS window_start
), revision_windows AS (
  SELECT revision, definition, created_at AS starts_at,
    LEAD(created_at,1,p.now_at) OVER (ORDER BY revision) AS ends_at
  FROM revisions r, params p WHERE r.monitor_id=p.monitor_id
), coverage_bound AS (
  SELECT COALESCE(MAX(json_extract(definition,'$.intervalMs') +
    MAX(30000,json_array_length(definition,'$.probes') *
      ((json_extract(definition,'$.retries')+2)*json_extract(definition,'$.timeoutMs'))+10000)+1000),0) AS reach_ms
  FROM revision_windows
), window_floor AS (
  SELECT COALESCE((SELECT MAX(s.due_at) FROM slots s
    WHERE s.monitor_id=p.monitor_id AND s.manual=0 AND s.due_at<p.window_start-b.reach_ms),
    p.window_start-b.reach_ms) AS due_floor FROM params p CROSS JOIN coverage_bound b
), latest_slot AS (
  SELECT s.* FROM slots s, params p
  WHERE s.monitor_id=p.monitor_id AND s.manual=0 AND s.status='complete' AND s.due_at<=p.now_at
  ORDER BY s.due_at DESC, s.rowid DESC LIMIT 1
), bounded_slots AS (
  SELECT s.* FROM slots s, params p, window_floor f
  WHERE s.monitor_id=p.monitor_id AND s.manual=0 AND s.due_at>=f.due_floor AND s.due_at<=p.now_at
), scheduled_slots AS (
  SELECT * FROM bounded_slots UNION SELECT * FROM latest_slot
), slot_params AS (
  SELECT s.id, q.now_at, r.ends_at AS revision_end,
    CASE WHEN json_extract(s.definition,'$.enabled')=0 THEN r.ends_at
      ELSE MAX(r.starts_at,COALESCE(json_extract(s.definition,'$.maintenanceUntil'),0)) END AS active_from,
    json_extract(s.definition,'$.intervalMs') AS interval_ms,
    json_extract(s.definition,'$.freshnessMs') AS freshness_ms,
    json_array_length(s.definition,'$.probes') AS probe_count,
    json_extract(s.definition,'$.probes') AS probes_json,
    COALESCE(json_extract(s.definition,'$.type'),'http') AS monitor_type,
    COALESCE(json_extract(s.definition,'$.heartbeat.maxAgeMs'),0) AS heartbeat_max_age_ms,
    json_extract(s.definition,'$.intervalMs') + MAX(30000,
      json_array_length(s.definition,'$.probes') * (json_extract(s.definition,'$.retries')+1) * json_extract(s.definition,'$.timeoutMs') +
      (SELECT COUNT(*) FROM json_each(s.definition,'$.assignments') WHERE json_extract(value,'$.canaryUrl') IS NOT NULL) * json_extract(s.definition,'$.timeoutMs') + 10000) + 1000 AS coverage_reach_ms
  FROM scheduled_slots s JOIN revision_windows r ON r.revision=s.revision CROSS JOIN params q
), ranked AS (
  SELECT s.id AS slot_id, s.due_at, s.status, o.id AS observation_id,
    o.probe, o.attempt,
    json_type(s.definition,'$.assignments') IS NOT NULL AS assigned_revision,
    json_extract(s.definition,'$.assignments."'||o.probe||'".canaryUrl') AS configured_canary,
    json_extract(o.evidence,'$.canary.outcome') AS canary_outcome,
    json_extract(o.evidence,'$.canary.completedAt') AS canary_completed_at,
    SUM(CASE WHEN json_extract(o.evidence,'$.canary.outcome') IS NOT NULL AND json_extract(o.evidence,'$.canary.outcome')<>'pass' THEN 1 ELSE 0 END) OVER (PARTITION BY s.id,o.probe) AS failed_canary_attempts,
    json_extract(o.evidence, '$.outcome') AS outcome,
    json_extract(o.evidence, '$.startedAt') AS started_at,
    json_extract(o.evidence, '$.completedAt') AS completed_at,
    json_extract(o.evidence, '$.durationMs') AS duration_ms,
    json_extract(o.evidence, '$.heartbeatReceivedAt') AS heartbeat_received_at,
    ROW_NUMBER() OVER (PARTITION BY s.id, o.probe ORDER BY o.attempt DESC) AS attempt_rank,
    COUNT(o.id) OVER (PARTITION BY s.id, o.probe) AS attempt_count,
    MIN(o.attempt) OVER (PARTITION BY s.id, o.probe) AS first_attempt,
    MAX(o.attempt) OVER (PARTITION BY s.id, o.probe) AS last_attempt,
    SUM(CASE WHEN json_extract(o.evidence, '$.outcome')='target_failure' THEN 1 ELSE 0 END)
      OVER (PARTITION BY s.id, o.probe) AS target_failure_attempts,
    SUM(CASE WHEN json_extract(o.evidence, '$.outcome')='runner_error' THEN 1 ELSE 0 END)
      OVER (PARTITION BY s.id, o.probe) AS runner_error_attempts,
    SUM(CASE WHEN o.id IS NOT NULL AND (
      COALESCE(json_type(o.evidence, '$.startedAt'), '')!='integer' OR
      COALESCE(json_type(o.evidence, '$.completedAt'), '')!='integer' OR
      COALESCE(json_type(o.evidence, '$.durationMs'), '')!='integer' OR
      json_extract(o.evidence, '$.startedAt')<s.due_at OR
      json_extract(o.evidence, '$.startedAt')>p.now_at OR
      json_extract(o.evidence, '$.completedAt')<json_extract(o.evidence, '$.startedAt') OR
      json_extract(o.evidence, '$.completedAt')>p.now_at OR
      json_extract(o.evidence, '$.completedAt')>p.revision_end OR
      json_extract(o.evidence, '$.durationMs')<0 OR
      ABS(json_extract(o.evidence, '$.durationMs')-
        (json_extract(o.evidence, '$.completedAt')-json_extract(o.evidence, '$.startedAt')))>1 OR
      json_extract(o.evidence, '$.startedAt')>9007199254740991 OR
      json_extract(o.evidence, '$.completedAt')>9007199254740991 OR
      json_extract(o.evidence, '$.durationMs')>9007199254740991 OR
      (p.monitor_type='heartbeat' AND json_type(o.evidence, '$.heartbeatReceivedAt') IS NOT NULL AND (
        COALESCE(json_type(o.evidence, '$.heartbeatReceivedAt'), '')!='integer' OR
        json_extract(o.evidence, '$.heartbeatReceivedAt')<0 OR
        json_extract(o.evidence, '$.heartbeatReceivedAt')>p.now_at OR
        json_extract(o.evidence, '$.heartbeatReceivedAt')>9007199254740991
      ))
    ) THEN 1 ELSE 0 END) OVER (PARTITION BY s.id, o.probe) AS invalid_attempts,
    CASE WHEN o.probe IN (SELECT value FROM json_each(p.probes_json)) THEN 1 ELSE 0 END AS selected_probe
  FROM scheduled_slots s
  JOIN slot_params p ON p.id=s.id
  LEFT JOIN observations o ON o.slot_id=s.id
), per_probe AS (
  SELECT slot_id, probe,
    MAX(attempt_count) AS attempt_count,
    MAX(first_attempt) AS first_attempt,
    MAX(last_attempt) AS last_attempt,
    MAX(target_failure_attempts) AS target_failure_attempts,
    MAX(runner_error_attempts) AS runner_error_attempts,
    MAX(invalid_attempts) AS invalid_attempts,
    MAX(selected_probe) AS selected_probe,
    MAX(assigned_revision) AS assigned_revision,
    MAX(configured_canary) AS configured_canary,
    MAX(failed_canary_attempts) AS failed_canary_attempts,
    MAX(CASE WHEN attempt_rank=1 THEN canary_outcome END) AS final_canary_outcome,
    MAX(CASE WHEN attempt_rank=1 THEN canary_completed_at END) AS final_canary_completed_at,
    MAX(CASE WHEN attempt_rank=1 THEN outcome END) AS final_outcome,
    MAX(CASE WHEN attempt_rank=1 THEN started_at END) AS final_started_at,
    MAX(CASE WHEN attempt_rank=1 THEN completed_at END) AS final_completed_at,
    MAX(CASE WHEN attempt_rank=1 THEN duration_ms END) AS final_duration_ms,
    MAX(CASE WHEN attempt_rank=1 THEN heartbeat_received_at END) AS final_heartbeat_received_at
  FROM ranked
  WHERE probe IS NOT NULL
  GROUP BY slot_id, probe
), slot_summary AS (
  SELECT s.id, s.due_at, s.status, p.now_at, p.interval_ms,
    p.freshness_ms, p.probe_count, p.monitor_type, p.heartbeat_max_age_ms, p.revision_end, p.active_from,
    COUNT(r.probe) AS observed_probes,
    COALESCE(SUM(r.selected_probe), 0) AS selected_probes,
    COALESCE(SUM(r.target_failure_attempts), 0) AS target_failure_attempts,
    COALESCE(SUM(r.runner_error_attempts), 0) AS runner_error_attempts,
    COALESCE(SUM(r.invalid_attempts), 0) AS invalid_attempts,
    COALESCE(SUM(CASE WHEN (r.assigned_revision=0 AND (r.attempt_count!=r.last_attempt+1 OR r.first_attempt!=0)) OR
      COALESCE(r.final_outcome, '') NOT IN ('pass','target_failure','runner_error') THEN 1 ELSE 0 END), 0) AS invalid_chains,
    COALESCE(SUM(CASE WHEN p.monitor_type='heartbeat' AND r.final_outcome='pass' AND (
      r.final_heartbeat_received_at IS NULL OR r.final_started_at IS NULL OR
      r.final_completed_at IS NULL OR r.final_heartbeat_received_at>r.final_started_at OR
      r.final_completed_at-r.final_heartbeat_received_at>p.heartbeat_max_age_ms
    ) THEN 1 ELSE 0 END), 0) AS invalid_heartbeat_passes,
    COALESCE(SUM(CASE WHEN r.configured_canary IS NOT NULL AND (r.failed_canary_attempts>0 OR COALESCE(r.final_canary_outcome,'')<>'pass' OR r.final_canary_completed_at IS NULL OR r.final_canary_completed_at>s.due_at+p.coverage_reach_ms OR r.final_canary_completed_at>p.now_at) THEN 1 ELSE 0 END),0) AS invalid_canaries,
    COALESCE(SUM(CASE WHEN r.final_outcome='pass' THEN 1 ELSE 0 END), 0) AS passing_probes,
    MIN(CASE WHEN r.selected_probe=1 AND r.final_completed_at IS NOT NULL
      THEN MIN(r.final_completed_at,COALESCE(r.final_canary_completed_at,r.final_completed_at))+p.freshness_ms END) AS freshness_expires_at,
    MIN(CASE WHEN p.monitor_type='heartbeat' AND r.final_outcome='pass' AND
      r.selected_probe=1 AND r.final_heartbeat_received_at IS NOT NULL
      THEN r.final_heartbeat_received_at+p.heartbeat_max_age_ms END) AS heartbeat_pass_expires_at,
    MAX(r.final_completed_at) AS completed_at,
    MAX(r.final_duration_ms) AS response_duration_ms
  FROM scheduled_slots s
  JOIN slot_params p ON p.id=s.id
  LEFT JOIN per_probe r ON r.slot_id=s.id
  GROUP BY s.id
), classified AS (
  SELECT *, CASE WHEN status='complete' AND observed_probes=probe_count AND
      selected_probes=probe_count AND runner_error_attempts=0 AND invalid_attempts=0 AND
      invalid_chains=0 AND invalid_heartbeat_passes=0 AND invalid_canaries=0 AND completed_at IS NOT NULL AND
      completed_at>=due_at AND completed_at<=now_at
    THEN 1 ELSE 0 END AS valid_result,
    CASE WHEN target_failure_attempts=0 AND passing_probes=probe_count THEN 1 ELSE 0 END AS all_passing,
    MIN(completed_at) OVER (ORDER BY due_at DESC, id DESC
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS next_completed_at
  FROM slot_summary
), durations AS (
  SELECT *,
    CASE WHEN valid_result=1 THEN MAX(0, MIN(now_at, revision_end, completed_at+interval_ms, COALESCE(next_completed_at, now_at),
      freshness_expires_at, CASE WHEN monitor_type='heartbeat' AND all_passing=1
        THEN COALESCE(heartbeat_pass_expires_at, now_at) ELSE now_at END)-
      MAX(now_at-86400000, completed_at, active_from)) ELSE 0 END AS day_known_ms,
    CASE WHEN valid_result=1 THEN MAX(0, MIN(now_at, revision_end, completed_at+interval_ms, COALESCE(next_completed_at, now_at),
      freshness_expires_at, CASE WHEN monitor_type='heartbeat' AND all_passing=1
        THEN COALESCE(heartbeat_pass_expires_at, now_at) ELSE now_at END)-
      MAX(now_at-604800000, completed_at, active_from)) ELSE 0 END AS week_known_ms
  FROM classified
), windows AS (
  SELECT
    COALESCE(SUM(CASE WHEN all_passing=1 THEN day_known_ms ELSE 0 END), 0) AS day_up_ms,
    COALESCE(SUM(CASE WHEN all_passing=0 THEN day_known_ms ELSE 0 END), 0) AS day_not_passing_ms,
    COALESCE(SUM(CASE WHEN all_passing=1 THEN week_known_ms ELSE 0 END), 0) AS week_up_ms,
    COALESCE(SUM(CASE WHEN all_passing=0 THEN week_known_ms ELSE 0 END), 0) AS week_not_passing_ms
  FROM durations
), latest_summary AS (
  SELECT l.id, l.due_at, p.probe_count,
    COUNT(r.probe) AS observed_probes,
    COALESCE(SUM(r.selected_probe), 0) AS selected_probes,
    COALESCE(SUM(r.runner_error_attempts), 0) AS runner_error_attempts,
    COALESCE(SUM(r.invalid_attempts), 0) AS invalid_attempts,
    COALESCE(SUM(CASE WHEN (r.assigned_revision=0 AND (r.attempt_count!=r.last_attempt+1 OR r.first_attempt!=0)) OR
      COALESCE(r.final_outcome, '') NOT IN ('pass','target_failure','runner_error') THEN 1 ELSE 0 END), 0) AS invalid_chains,
    COALESCE(SUM(CASE WHEN p.monitor_type='heartbeat' AND r.final_outcome='pass' AND (
      r.final_heartbeat_received_at IS NULL OR r.final_started_at IS NULL OR
      r.final_completed_at IS NULL OR r.final_heartbeat_received_at>r.final_started_at OR
      r.final_completed_at-r.final_heartbeat_received_at>p.heartbeat_max_age_ms
    ) THEN 1 ELSE 0 END), 0) AS invalid_heartbeat_passes,
    COALESCE(SUM(CASE WHEN r.configured_canary IS NOT NULL AND (r.failed_canary_attempts>0 OR COALESCE(r.final_canary_outcome,'')<>'pass' OR r.final_canary_completed_at IS NULL OR r.final_canary_completed_at>p.now_at) THEN 1 ELSE 0 END),0) AS invalid_canaries,
    MAX(r.final_completed_at) AS last_check_at,
    MAX(r.final_duration_ms) AS response_duration_ms
  FROM latest_slot l
  JOIN slot_params p ON p.id=l.id
  LEFT JOIN per_probe r ON r.slot_id=l.id
  GROUP BY l.id
), excluded_spans AS (
  SELECT CASE WHEN json_extract(definition,'$.enabled')=0 THEN 'paused' ELSE 'maintenance' END AS kind,
    starts_at, MIN(ends_at,p.now_at,CASE WHEN json_extract(definition,'$.enabled')=0 THEN ends_at
      ELSE COALESCE(json_extract(definition,'$.maintenanceUntil'),0) END) AS ends_at
  FROM revision_windows CROSS JOIN params p
), excluded AS (
  SELECT COALESCE(SUM(CASE WHEN kind='paused' THEN MAX(0,ends_at-MAX(starts_at,p.now_at-86400000)) ELSE 0 END),0) AS day_paused_ms,
    COALESCE(SUM(CASE WHEN kind='maintenance' THEN MAX(0,ends_at-MAX(starts_at,p.now_at-86400000)) ELSE 0 END),0) AS day_maintenance_ms,
    COALESCE(SUM(CASE WHEN kind='paused' THEN MAX(0,ends_at-MAX(starts_at,p.now_at-604800000)) ELSE 0 END),0) AS week_paused_ms,
    COALESCE(SUM(CASE WHEN kind='maintenance' THEN MAX(0,ends_at-MAX(starts_at,p.now_at-604800000)) ELSE 0 END),0) AS week_maintenance_ms
  FROM excluded_spans CROSS JOIN params p
)
SELECT excluded.*, windows.day_up_ms, windows.day_not_passing_ms, windows.week_up_ms, windows.week_not_passing_ms,
  latest_summary.last_check_at,
  CASE WHEN latest_summary.observed_probes=latest_summary.probe_count AND
      latest_summary.selected_probes=latest_summary.probe_count AND
      latest_summary.runner_error_attempts=0 AND latest_summary.invalid_attempts=0 AND
      latest_summary.invalid_chains=0 AND latest_summary.invalid_heartbeat_passes=0 AND latest_summary.invalid_canaries=0 AND
      latest_summary.last_check_at IS NOT NULL AND latest_summary.last_check_at>=latest_summary.due_at AND
      latest_summary.last_check_at<=params.now_at
    THEN latest_summary.response_duration_ms ELSE NULL END AS response_duration_ms
FROM windows CROSS JOIN params CROSS JOIN excluded
LEFT JOIN latest_summary ON 1=1`

