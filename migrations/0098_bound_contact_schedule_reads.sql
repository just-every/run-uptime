-- Keep each Cron run proportional to live work, not to every incident ever opened.
CREATE INDEX IF NOT EXISTS alert_contact_schedules_incident ON alert_contact_schedules(monitor_id,incident_key);
CREATE INDEX IF NOT EXISTS outbox_monitor_kind ON outbox(monitor_id,kind);
CREATE INDEX IF NOT EXISTS outbox_monitor_incident ON outbox(monitor_id,kind,json_extract(event,'$.incidentKey'));
CREATE INDEX IF NOT EXISTS alert_contact_schedules_live ON alert_contact_schedules(next_at) WHERE next_at IS NOT NULL;
