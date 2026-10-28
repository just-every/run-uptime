-- Route drill receipts and dispatch authority stay installation-local, like
-- alert_routes, alert_route_changes and alert_drills. Archives never replay them.
ALTER TABLE alert_route_changes ADD COLUMN drill TEXT;
ALTER TABLE alert_drills ADD COLUMN route_context TEXT;
ALTER TABLE alert_drills ADD COLUMN quiet_until INTEGER;
ALTER TABLE alert_drills ADD COLUMN quiet_checked_until INTEGER;
-- The weekly policy and its confirmation anchor/result are dispatch snapshots.
-- Existing routes and queued work keep their prior always-selected behaviour.
ALTER TABLE alert_routes ADD COLUMN business_hours TEXT;
ALTER TABLE alert_contact_schedules ADD COLUMN route_business_rules TEXT;
ALTER TABLE alert_contact_schedules ADD COLUMN business_allowed INTEGER;
ALTER TABLE alert_fallback_chains ADD COLUMN route_business_rules TEXT;
