import type { NotificationEvent } from '../notification-content.ts'
import { ReportInputError, type ReportPeriod } from './period.ts'

// Read durable scheduled transitions, including an incident opened before the
// requested period. Notification confirmation time is distinct from coverage.
export async function periodIncidents(db: D1Database, id: string, period: ReportPeriod, now: number) {
  const rows = (await db.prepare(`WITH incident_events AS (
    SELECT opened.event AS started,opened.status,
      (SELECT closed.event FROM outbox closed WHERE closed.monitor_id=opened.monitor_id
       AND closed.kind='recovery' AND json_extract(closed.event,'$.incidentKey')=json_extract(opened.event,'$.incidentKey')
       AND json_extract(closed.event,'$.observedAt')<=?
       ORDER BY closed.rowid LIMIT 1) AS ended
    FROM outbox opened WHERE opened.monitor_id=? AND opened.kind='trigger'
      AND json_extract(opened.event,'$.observedAt')<?
  ) SELECT * FROM incident_events
    WHERE ended IS NULL OR json_extract(ended,'$.observedAt')>?
    ORDER BY json_extract(started,'$.observedAt'),json_extract(started,'$.id') LIMIT 10001`)
    .bind(now, id, period.to, period.from).all<{ started: string; ended: string | null; status: string }>()).results
  if (rows.length > 10000) throw new ReportInputError('More than 10000 incidents match this period; choose a shorter period', 'too_many_incidents')
  return rows.map(row => {
    const trigger = JSON.parse(row.started) as NotificationEvent
    const recovery = row.ended ? JSON.parse(row.ended) as NotificationEvent : null
    const startedAt = trigger.observedAt, endedAt = recovery?.observedAt ?? null
    return { key: trigger.incidentKey, startedAt, endedAt,
      durationMs: Math.max(0, (endedAt ?? now) - startedAt),
      durationInPeriodMs: Math.max(0, Math.min(endedAt ?? period.to, period.to) - Math.max(startedAt, period.from)),
      ongoingAtEnd: endedAt === null || endedAt > period.to,
      imported: row.status === 'imported-inactive', trigger, recovery }
  })
}
