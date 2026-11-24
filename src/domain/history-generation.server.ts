// The console's alert and delivery lists are retained history. They change
// only when an outbox event, delivery, attempt or fallback chain changes, which
// bumps notification_history_generation. While a delivery is queued or sending
// its row carries clock-dependent waiting states, so no generation is offered.
export async function settledHistoryGeneration(db:D1Database){
 const row=await db.prepare(`SELECT generation FROM notification_history_generation WHERE singleton=1
  AND NOT EXISTS(SELECT 1 FROM notification_jobs WHERE state IN ('queued','sending'))
  AND NOT EXISTS(SELECT 1 FROM integration_deliveries WHERE namespace='uptime-notifications' AND state IN ('queued','sending'))`).first<{generation:number}>()
 return row?String(row.generation):null
}
/** The lists a console says it holds for a generation (`x-uptime-history`:
 * the generation, then the held list names). */
export function heldHistory(header:string|undefined,generation:string|null){
 const [held,...lists]=(header??'').trim().split(/\s+/)
 return {alerts:generation!==null&&held===generation&&lists.includes('alerts'),deliveries:generation!==null&&held===generation&&lists.includes('deliveries')}
}
