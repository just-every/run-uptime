import { COMPLETION_CLOCK_ALLOWANCE_MS } from './evidence.server.ts'
import { acceptanceMs } from './schedule.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

const query = `
WITH params AS (
  SELECT ? AS now_at, ? AS interval_ms, ? AS freshness_ms, ? AS probe_count,
    ? AS probes_json, ? AS monitor_type, ? AS heartbeat_max_age_ms,
    ? AS monitor_id, ? AS revision, ? AS window_start, ? AS coverage_reach_ms
), window_floor AS (
  -- A result completes before its lease ends, and its successor is due after
  -- its claim, so only slots due within coverage_reach_ms of the window start
  -- and the one slot just before them can cover time inside the window.
  SELECT COALESCE((
    SELECT MAX(s.due_at) FROM slots s
    WHERE s.monitor_id=p.monitor_id AND s.revision=p.revision AND s.manual=0
      AND s.due_at<p.window_start-p.coverage_reach_ms
  ), p.window_start-p.coverage_reach_ms) AS due_floor
  FROM params p
), latest_slot AS (
  SELECT s.id, s.due_at, s.status, s.definition
  FROM slots s, params p
  WHERE s.monitor_id=p.monitor_id AND s.revision=p.revision
    AND s.manual=0 AND s.status='complete' AND s.due_at<=p.now_at
  ORDER BY s.due_at DESC, s.rowid DESC LIMIT 1
), bounded_slots AS (
  SELECT s.id, s.due_at, s.status, s.definition
  FROM slots s, params p, window_floor f
  WHERE s.monitor_id=p.monitor_id AND s.revision=p.revision
    AND s.manual=0 AND s.due_at>=f.due_floor AND s.due_at<=p.now_at
), scheduled_slots AS (
  SELECT id, due_at, status, definition FROM bounded_slots
  UNION
  SELECT id, due_at, status, definition FROM latest_slot
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
  CROSS JOIN params p
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
    p.freshness_ms, p.probe_count, p.monitor_type, p.heartbeat_max_age_ms,
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
  CROSS JOIN params p
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
    CASE WHEN valid_result=1 THEN MAX(0, MIN(now_at, completed_at+interval_ms, COALESCE(next_completed_at, now_at),
      freshness_expires_at, CASE WHEN monitor_type='heartbeat' AND all_passing=1
        THEN COALESCE(heartbeat_pass_expires_at, now_at) ELSE now_at END)-
      MAX(now_at-86400000, completed_at)) ELSE 0 END AS day_known_ms,
    CASE WHEN valid_result=1 THEN MAX(0, MIN(now_at, completed_at+interval_ms, COALESCE(next_completed_at, now_at),
      freshness_expires_at, CASE WHEN monitor_type='heartbeat' AND all_passing=1
        THEN COALESCE(heartbeat_pass_expires_at, now_at) ELSE now_at END)-
      MAX(now_at-604800000, completed_at)) ELSE 0 END AS week_known_ms
  FROM classified
), windows AS (
  SELECT
    COALESCE(SUM(CASE WHEN all_passing=1 THEN day_known_ms ELSE 0 END), 0) AS day_up_ms,
    COALESCE(SUM(CASE WHEN all_passing=0 THEN day_known_ms ELSE 0 END), 0) AS day_not_passing_ms,
    COALESCE(SUM(CASE WHEN all_passing=1 THEN week_known_ms ELSE 0 END), 0) AS week_up_ms,
    COALESCE(SUM(CASE WHEN all_passing=0 THEN week_known_ms ELSE 0 END), 0) AS week_not_passing_ms
  FROM durations
), latest_summary AS (
  SELECT l.id, l.due_at,
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
  CROSS JOIN params p
  LEFT JOIN per_probe r ON r.slot_id=l.id
  GROUP BY l.id
)
SELECT windows.day_up_ms, windows.day_not_passing_ms, windows.week_up_ms, windows.week_not_passing_ms,
  latest_summary.last_check_at,
  CASE WHEN latest_summary.observed_probes=params.probe_count AND
      latest_summary.selected_probes=params.probe_count AND
      latest_summary.runner_error_attempts=0 AND latest_summary.invalid_attempts=0 AND
      latest_summary.invalid_chains=0 AND latest_summary.invalid_heartbeat_passes=0 AND latest_summary.invalid_canaries=0 AND
      latest_summary.last_check_at IS NOT NULL AND latest_summary.last_check_at>=latest_summary.due_at AND
      latest_summary.last_check_at<=params.now_at
    THEN latest_summary.response_duration_ms ELSE NULL END AS response_duration_ms
FROM windows CROSS JOIN params
LEFT JOIN latest_summary ON 1=1`

type WindowMetrics = {
  uptimePercent: number | null
  unknownPercent: number
  notPassingPercent: number
  observedMs: number
  upMs: number
  notPassingMs: number
  unknownMs: number
  windowMs: number
}

export type MonitorAvailability = {
  lastCheckAt: number | null
  responseDurationMs: number | null
  last24h: WindowMetrics
  last7d: WindowMetrics
}

function percent(value: number, total: number): number {
  return Math.round((value / total) * 10000) / 100
}

/** The passing share rounds down, so it reads 100 only when no observed time failed. */
function passingPercent(value: number, total: number): number {
  return Math.floor((value * 10000) / total) / 100
}

function windowMetrics(upMs: number, notPassingMs: number, windowMs: number): WindowMetrics {
  const safeUpMs = Math.max(0, Math.min(windowMs, Math.trunc(upMs)))
  const safeNotPassingMs = Math.max(0, Math.min(windowMs - safeUpMs, Math.trunc(notPassingMs)))
  const observedMs = safeUpMs + safeNotPassingMs
  const unknownMs = windowMs - observedMs
  return {
    uptimePercent: observedMs ? passingPercent(safeUpMs, observedMs) : null,
    unknownPercent: percent(unknownMs, windowMs),
    notPassingPercent: percent(safeNotPassingMs, windowMs),
    observedMs,
    upMs: safeUpMs,
    notPassingMs: safeNotPassingMs,
    unknownMs,
    windowMs,
  }
}

/**
 * Aggregate current-revision scheduled observations without returning the
 * seven-day attempt history to each console poll. Every valid result covers
 * the time from when all selected probes finish for at most one configured
 * interval, ending earlier when a later scheduled slot completes, when its
 * evidence stops being fresh, or at now. Unobserved time remains Unknown;
 * retries do not add intervals and manual checks are excluded.
 */
export async function availabilityOverview(
  db: D1Database,
  monitors: Array<{ id: string; revision: number; definition: Record<string, any> }>,
  now = Date.now(),
): Promise<Map<string, MonitorAvailability>> {
  if (!Number.isSafeInteger(now) || now < 0) throw Error('Availability clock must be a nonnegative safe integer')
  const result = new Map<string, MonitorAvailability>()
  if (!monitors.length) return result
  const statements = monitors.map(monitor => {
    const { intervalMs, freshnessMs, timeoutMs, retries, probes, type, heartbeat } = monitor.definition
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || !Number.isSafeInteger(freshnessMs) || freshnessMs < 1 ||
        !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(retries) || retries < 0 ||
        !Array.isArray(probes) || !probes.length) {
      throw Error(`Invalid availability schedule for monitor ${monitor.id}`)
    }
    return db.prepare(query).bind(
      now,
      intervalMs,
      freshnessMs,
      probes.length,
      JSON.stringify(probes),
      type ?? 'http',
      Number.isSafeInteger(heartbeat?.maxAgeMs) ? heartbeat.maxAgeMs : 0,
      monitor.id,
      monitor.revision,
      now - WEEK_MS,
      intervalMs + acceptanceMs(monitor.definition as any) + COMPLETION_CLOCK_ALLOWANCE_MS,
    )
  })
  const rows = await db.batch(statements)
  for (const [index, monitor] of monitors.entries()) {
    const row = rows[index]?.results?.[0] as Record<string, unknown> | undefined
    if (!row) {
      throw Error(`Availability aggregate missing for monitor ${monitor.id}`)
    }
    const dayUp = Number(row.day_up_ms ?? 0)
    const dayNotPassing = Number(row.day_not_passing_ms ?? 0)
    const weekUp = Number(row.week_up_ms ?? 0)
    const weekNotPassing = Number(row.week_not_passing_ms ?? 0)
    const lastCheckAt = Number.isSafeInteger(row.last_check_at) && Number(row.last_check_at) <= now
      ? Number(row.last_check_at)
      : null
    const responseDurationMs = Number.isSafeInteger(row.response_duration_ms) && Number(row.response_duration_ms) >= 0
      ? Number(row.response_duration_ms)
      : null
    result.set(monitor.id, {
      lastCheckAt,
      responseDurationMs,
      last24h: windowMetrics(dayUp, dayNotPassing, DAY_MS),
      last7d: windowMetrics(weekUp, weekNotPassing, WEEK_MS),
    })
  }
  return result
}
