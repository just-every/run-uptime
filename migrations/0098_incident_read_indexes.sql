-- Incident history is retained. Each Cron run and console poll reads a few
-- facts about live incidents, so each read must find its rows without walking
-- the retained history.
-- Contact delay and quiet-hours checks look up one incident's schedules.
CREATE INDEX IF NOT EXISTS alert_contact_schedules_incident ON alert_contact_schedules(monitor_id,incident_key);
-- ...and whether that incident has recovered.
CREATE INDEX IF NOT EXISTS outbox_incident ON outbox(monitor_id,kind,json_extract(event,'$.incidentKey'));
-- Each check reads its monitor's newest incident and slow events by kind.
CREATE INDEX IF NOT EXISTS outbox_monitor_kind ON outbox(monitor_id,kind) WHERE status<>'imported-inactive';
-- Cron advances only fallback chains that are still open.
CREATE INDEX IF NOT EXISTS alert_fallback_chains_open ON alert_fallback_chains(created_at) WHERE ended_at IS NULL;
