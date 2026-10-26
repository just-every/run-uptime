-- Route drill receipts and dispatch authority stay installation-local, like
-- alert_routes, alert_route_changes and alert_drills. Archives never replay them.
ALTER TABLE alert_route_changes ADD COLUMN drill TEXT;
ALTER TABLE alert_drills ADD COLUMN route_context TEXT;
ALTER TABLE alert_drills ADD COLUMN quiet_until INTEGER;
ALTER TABLE alert_drills ADD COLUMN quiet_checked_until INTEGER;
