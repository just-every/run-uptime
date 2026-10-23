import {credentialMonitorFilter,type CredentialEnvironment} from '../credentials/model.server.ts'
import {configuredPeriod} from './configured-period.server.ts'
import { latencyQuery } from './latency-query.ts'
import { maintenanceReportSnapshots } from '../planned-maintenance/report.server.ts'
import { ReportInputError, type ReportPeriod } from './period.ts'

const buckets = { raw: 0, '1m': 60000, '5m': 300000, '1h': 3600000, '1d': 86400000 }
export const REPORT_POINT_LIMIT = 10000
export type LatencyBucket = keyof typeof buckets
export type LatencyStatistics = {
  count: number
  minMs: number | null
  meanMs: number | null
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  maxMs: number | null
}
type LatencyRow = {
  kind: 'summary' | 'point'; at: number | null; end_at: number | null; location: string | null; count: number
  min_ms: number | null; mean_ms: number | null; p50_ms: number | null
  p95_ms: number | null; p99_ms: number | null; max_ms: number | null
  point_count: number | null; locations: string | null
}
export type LatencyOptions = { bucket: LatencyBucket; location: string }

export function latencyOptions(params: URLSearchParams): LatencyOptions {
  for (const key of ['bucket', 'location']) {
    if (params.getAll(key).length > 1) throw new ReportInputError(`Specify ${key} only once`)
  }
  const bucket = params.get('bucket') ?? '5m'
  if (!Object.hasOwn(buckets, bucket)) throw new ReportInputError('bucket must be raw, 1m, 5m, 1h or 1d')
  const location = params.get('location') ?? 'all'
  if (!location || location.length > 100) throw new ReportInputError('location must be all or a configured check identifier')
  return { bucket: bucket as LatencyBucket, location }
}

function statistics(row: LatencyRow): LatencyStatistics {
  return { count: row.count, minMs: row.min_ms, meanMs: row.mean_ms, p50Ms: row.p50_ms,
    p95Ms: row.p95_ms, p99Ms: row.p99_ms, maxMs: row.max_ms }
}

export async function periodLatency(db: D1Database, id: string, period: ReportPeriod, options: LatencyOptions) {
  const snapshots = await maintenanceReportSnapshots(db,[id],period.from,period.to)
  const rows = (await db.prepare(latencyQuery).bind(period.to, id, period.from, snapshots.get(id)!,
    buckets[options.bucket], options.location, REPORT_POINT_LIMIT).all<LatencyRow>()).results
  const summary = rows.find(row => row.kind === 'summary')
  if (!summary) throw Error(`Latency aggregate missing for monitor ${id}`)
  if (Number(summary.point_count) > REPORT_POINT_LIMIT) throw new ReportInputError(
    `This request produces more than ${REPORT_POINT_LIMIT} response-time points; choose a shorter period or a larger bucket`, 'too_many_points')
  return {
    period, ...options, bucketAlignment: 'UTC' as const, percentileMethod: 'nearest-rank' as const,
    samplePolicy: 'Final result per selected check from complete valid scheduled slots; retries do not add samples; manual, incomplete, runner-error, paused and maintenance results are excluded.',
    availableLocations: JSON.parse(summary.locations ?? '[]') as string[],
    statistics: statistics(summary),
    series: rows.filter(row => row.kind === 'point').map(row => ({ at: row.at!, to: row.end_at!, location: row.location!, ...statistics(row) })),
  }
}

export async function monitorLatency(env: CredentialEnvironment, id: string, params: URLSearchParams | ReportPeriod, now = Date.now()) {
  const period = await configuredPeriod(env, params, now)
  if (period.to - period.from > 90 * 86400000) throw new ReportInputError('Response-time ranges cannot exceed 90 days', 'range_too_long')
  const options = params instanceof URLSearchParams ? latencyOptions(params) : latencyOptions(new URLSearchParams())
  const filter=credentialMonitorFilter(env)
  const exists = await env.DB.prepare(`SELECT id FROM monitors WHERE id=? AND ${filter.sql}`).bind(id,...filter.params).first()
  return exists ? periodLatency(env.DB, id, period, options) : null
}
