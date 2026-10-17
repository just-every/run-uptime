// @ts-ignore Shared calendar also runs in the console preview.
import {intervals} from '../planned-maintenance.mjs'

/** One immutable revision snapshot feeds calendar expansion and SQL. Reading
 * definitions and expanding them separately from the SQL's revision lookup
 * would race a save and could silently omit the new revision's maintenance. */
export async function maintenanceReportSnapshots(db:D1Database, ids:string[], from:number, to:number):Promise<Map<string,string>> {
  const snapshots = new Map<string,string>()
  if (!ids.length) return snapshots
  const rows = (await db.prepare(`SELECT * FROM (
    SELECT monitor_id,revision,definition,created_at AS starts_at,
      LEAD(created_at,1,?) OVER (PARTITION BY monitor_id ORDER BY revision) AS ends_at
    FROM revisions WHERE monitor_id IN (SELECT value FROM json_each(?))
  ) WHERE starts_at<=? ORDER BY monitor_id,revision`).bind(to,JSON.stringify(ids),to).all<{
    monitor_id:string; revision:number; definition:string; starts_at:number; ends_at:number
  }>()).results
  const grouped = new Map<string,unknown[]>()
  for (const row of rows) {
    const definition = JSON.parse(row.definition), endsAt = Math.min(to,row.ends_at)
    const maintenance = definition.enabled === false ? [] : intervals(definition,Math.max(from,row.starts_at),endsAt)
    const values = grouped.get(row.monitor_id) ?? []
    values.push({revision:row.revision,definition,startsAt:row.starts_at,endsAt,maintenance})
    grouped.set(row.monitor_id,values)
  }
  for (const id of ids) snapshots.set(id,JSON.stringify(grouped.get(id) ?? []))
  return snapshots
}
