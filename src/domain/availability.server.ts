import { availabilityBucketReports } from './availability-buckets.server.ts'
import { summarizeAvailability } from './availability-rollup.ts'

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
  last7d?: WindowMetrics
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
  dayOnly = false,
): Promise<Map<string, MonitorAvailability>> {
  if (!Number.isSafeInteger(now) || now < 0) throw Error('Availability clock must be a nonnegative safe integer')
  const result = new Map<string, MonitorAvailability>()
  if (!monitors.length) return result
  const from=now-(dayOnly?DAY_MS:WEEK_MS)
  await availabilityBucketReports(db,monitors.map(monitor=>monitor.id),from,now,true,async(data,index)=>{
    const {totals:[day,week],lastCheckAt,responseDurationMs}=await summarizeAvailability(data,from,now,dayOnly?'day':'overview')
    result.set(monitors[index].id,{
      lastCheckAt,responseDurationMs,
      last24h:windowMetrics(day.up,day.notPassing,DAY_MS,day.paused,day.maintenance),
      ...(week?{last7d:windowMetrics(week.up,week.notPassing,WEEK_MS,week.paused,week.maintenance)}:{}),
    })
  })
  return result
}
