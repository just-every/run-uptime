import type {Bindings} from './control.server.ts'

export function dueDrills(env:Bindings,now:number){
 return env.DB.prepare(`SELECT s.*,c.destination_id,c.config FROM alert_drill_schedules s JOIN alert_drill_consents c ON c.id=s.consent_id WHERE c.revoked_at IS NULL AND s.state IN('active','complete') AND ((s.state='active' AND s.next_due<=?) OR EXISTS(SELECT 1 FROM alert_drill_runs r LEFT JOIN alert_drills a ON a.id=r.drill_id WHERE r.schedule_id=s.id AND r.proposal='open' AND a.confirmed_at IS NULL AND r.next_reminder<=? AND r.reminder_count<json_extract(c.config,'$.maxReminders'))) ORDER BY s.next_due LIMIT 24`).bind(now,now)
}
