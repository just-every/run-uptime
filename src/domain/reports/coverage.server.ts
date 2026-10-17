import { availabilityEvidenceCtes } from '../availability-query.ts'
import { windowMetrics } from '../availability.server.ts'
import type { ReportPeriod } from './period.ts'

const rangeQuery = `${availabilityEvidenceCtes}, included AS (
  SELECT COALESCE(SUM(CASE WHEN valid_result=1 AND all_passing=1
    THEN MAX(0,coverage_end-MAX(p.window_start,coverage_start)) ELSE 0 END),0) AS up_ms,
    COALESCE(SUM(CASE WHEN valid_result=1 AND all_passing=0
    THEN MAX(0,coverage_end-MAX(p.window_start,coverage_start)) ELSE 0 END),0) AS not_passing_ms
  FROM coverage_spans CROSS JOIN params p
), excluded AS (
  SELECT COALESCE(SUM(CASE WHEN json_extract(definition,'$.enabled')=0
    THEN MAX(0,MIN(ends_at,p.now_at)-MAX(starts_at,p.window_start)) ELSE 0 END),0) AS paused_ms,
    COALESCE(SUM(CASE WHEN json_extract(definition,'$.enabled') IS NOT 0
    THEN MAX(0,MIN(ends_at,p.now_at,COALESCE(json_extract(definition,'$.maintenanceUntil'),0))-
      MAX(starts_at,p.window_start)) ELSE 0 END),0) AS maintenance_ms
  FROM revision_windows CROSS JOIN params p
)
SELECT * FROM included CROSS JOIN excluded`

export async function periodAvailability(db: D1Database, id: string, period: ReportPeriod) {
  const row = await db.prepare(rangeQuery).bind(period.to, id, period.from)
    .first<{ up_ms: number; not_passing_ms: number; paused_ms: number; maintenance_ms: number }>()
  if (!row) throw Error(`Availability aggregate missing for monitor ${id}`)
  return windowMetrics(row.up_ms, row.not_passing_ms, period.to - period.from, row.paused_ms, row.maintenance_ms)
}
