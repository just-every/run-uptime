import type { NotificationEvent } from '../notification-content.ts'
import { ReportInputError, type ReportPeriod } from './period.ts'

// Read durable scheduled transitions, including an incident opened before the
// requested period. Notification confirmation time is distinct from coverage.
export async function periodIncidents(db: D1Database, id: string, period: ReportPeriod, now: number) {
  // Candidates are bounded by the period: triggers inside it, triggers whose
  // recovery came after it began, and incidents still without a recovery
  // (incident_unrecovered). The overlap rule below is applied to them unchanged.
  const rows = (await db.prepare(`WITH candidates(id) AS (
    SELECT id FROM outbox WHERE monitor_id=?2 AND kind='trigger'
      AND json_extract(event,'$.observedAt')>=?4 AND json_extract(event,'$.observedAt')<?3
    UNION SELECT opened.id FROM outbox closed JOIN outbox opened ON opened.monitor_id=closed.monitor_id AND opened.kind='trigger'
      AND json_extract(opened.event,'$.incidentKey')=json_extract(closed.event,'$.incidentKey')
      WHERE closed.monitor_id=?2 AND closed.kind='recovery' AND json_extract(closed.event,'$.observedAt')>?4
    UNION SELECT outbox_id FROM incident_unrecovered WHERE monitor_id=?2
  ), incident_events AS (
    SELECT opened.event AS started,opened.status,
      (SELECT closed.event FROM outbox closed INDEXED BY outbox_incident WHERE closed.monitor_id=opened.monitor_id
       AND closed.kind='recovery' AND json_extract(closed.event,'$.incidentKey')=json_extract(opened.event,'$.incidentKey')
       AND json_extract(closed.event,'$.observedAt')<=?1
       ORDER BY closed.rowid LIMIT 1) AS ended
    FROM candidates CROSS JOIN outbox opened ON opened.id=candidates.id
    WHERE opened.monitor_id=?2 AND opened.kind='trigger'
      AND json_extract(opened.event,'$.observedAt')<?3
  ) SELECT * FROM incident_events
    WHERE ended IS NULL OR json_extract(ended,'$.observedAt')>?4
    ORDER BY json_extract(started,'$.observedAt'),json_extract(started,'$.id') LIMIT 10001`)
    .bind(now, id, period.to, period.from).all<{ started: string; ended: string | null; status: string }>()).results
  if (rows.length > 10000) throw new ReportInputError('More than 10000 incidents match this period; choose a shorter period', 'too_many_incidents')
  const roots = (await db.prepare('SELECT incident_id,root_category_id,root_category_label,root_text FROM incident_work WHERE monitor_id=?').bind(id).all<{incident_id:string;root_category_id:string|null;root_category_label:string|null;root_text:string}>()).results
  return rows.map(row => {
    const trigger = JSON.parse(row.started) as NotificationEvent
    const recovery = row.ended ? JSON.parse(row.ended) as NotificationEvent : null
    const startedAt = trigger.observedAt, endedAt = recovery?.observedAt ?? null
    const root=roots.find(value=>value.incident_id===trigger.id)
    return { id:trigger.id, rootCause:{categoryId:root?.root_category_id??null,categoryLabel:root?.root_category_label??null,text:root?.root_text??''}, key: trigger.incidentKey, startedAt, endedAt,
      durationMs: Math.max(0, (endedAt ?? now) - startedAt),
      durationInPeriodMs: Math.max(0, Math.min(endedAt ?? period.to, period.to) - Math.max(startedAt, period.from)),
      ongoingAtEnd: endedAt === null || endedAt > period.to,
      imported: row.status === 'imported-inactive', trigger, recovery }
  })
}
