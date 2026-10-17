import { availabilityQuery } from './availability-query.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export type WindowMetrics = {
  uptimePercent: number | null
  unknownPercent: number
  notPassingPercent: number
  observedMs: number
  upMs: number
  notPassingMs: number
  unknownMs: number
  windowMs: number
  pausedMs: number
  maintenanceMs: number
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

export function windowMetrics(upMs: number, notPassingMs: number, windowMs: number, pausedMs: number, maintenanceMs: number): WindowMetrics {
  const safeUpMs = Math.max(0, Math.min(windowMs, Math.trunc(upMs)))
  const safeNotPassingMs = Math.max(0, Math.min(windowMs - safeUpMs, Math.trunc(notPassingMs)))
  const observedMs = safeUpMs + safeNotPassingMs
  const unknownMs = Math.max(0, windowMs - observedMs - pausedMs - maintenanceMs)
  return {
    uptimePercent: observedMs ? passingPercent(safeUpMs, observedMs) : null,
    unknownPercent: percent(unknownMs, windowMs),
    notPassingPercent: percent(safeNotPassingMs, windowMs),
    observedMs,
    upMs: safeUpMs,
    notPassingMs: safeNotPassingMs,
    unknownMs,
    windowMs,
    pausedMs,
    maintenanceMs,
  }
}

/**
 * Aggregate historical scheduled observations under their immutable definitions without returning the
 * seven-day attempt history to each console poll. Every valid result covers
 * the time from when all selected probes finish for at most one configured
 * interval, ending earlier when a later scheduled slot completes, when its
 * evidence stops being fresh, or at its next revision. Maintenance and pause
 * have their own durations; other unobserved time remains Unknown.
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
  const statements = monitors.map(monitor => db.prepare(availabilityQuery).bind(now, monitor.id, now - WEEK_MS))
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
      last24h: windowMetrics(dayUp, dayNotPassing, DAY_MS, Number(row.day_paused_ms), Number(row.day_maintenance_ms)),
      last7d: windowMetrics(weekUp, weekNotPassing, WEEK_MS, Number(row.week_paused_ms), Number(row.week_maintenance_ms)),
    })
  }
  return result
}
