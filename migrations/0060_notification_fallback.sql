-- DELIVERY-002 fallback contacts: the route's ordered chain, its per-incident snapshot and escalation progress.
-- No endpoint, body or key material: destinations are named by identity only.
ALTER TABLE alert_routes ADD COLUMN fallback TEXT NOT NULL DEFAULT '{"destinationIds":[],"deadlineSeconds":120}';
CREATE TABLE alert_fallback_chains (
 event_id TEXT PRIMARY KEY,
 monitor_id TEXT NOT NULL,
 incident_key TEXT NOT NULL,
 destination_ids TEXT NOT NULL,
 deadline_ms INTEGER NOT NULL CHECK(deadline_ms BETWEEN 5000 AND 3600000),
 contact_settings TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 step INTEGER NOT NULL DEFAULT 0 CHECK(step>=0),
 fired_at INTEGER,
 ended_at INTEGER,
 end_reason TEXT CHECK(end_reason IS NULL OR end_reason IN ('accepted','exhausted','closed'))
);
-- Attempts on a fallback contact's delivery are fallback-phase records.
DROP TRIGGER IF EXISTS notification_attempt_reserved;
CREATE TRIGGER notification_attempt_reserved AFTER INSERT ON integration_attempts
WHEN NEW.namespace='uptime-notifications'
BEGIN
 INSERT OR IGNORE INTO notification_delivery_attempts(delivery_id,destination_id,number,phase,scheduled_at,key_reference)
 SELECT j.id,j.destination_id,NEW.number,CASE WHEN json_extract(j.event,'$.fallbackContext') IS NULL THEN 'retry' ELSE 'fallback' END,d.next_at,j.event_id
 FROM notification_jobs j JOIN integration_deliveries d ON d.id=j.id AND d.namespace=NEW.namespace WHERE j.id=NEW.delivery_id AND j.state<>'imported-inactive';
END;
