-- DELIVERY-002: installation policy and durable transport schedule, no endpoint/body/key material.
CREATE TABLE notification_retry_settings (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 max_attempts INTEGER NOT NULL DEFAULT 6 CHECK(max_attempts BETWEEN 1 AND 10),
 window_ms INTEGER NOT NULL DEFAULT 600000 CHECK(window_ms BETWEEN 1000 AND 86400000)
);
INSERT INTO notification_retry_settings(singleton) VALUES(1);
CREATE TABLE notification_retry_policy (
 delivery_id TEXT PRIMARY KEY,
 window_ms INTEGER NOT NULL CHECK(window_ms BETWEEN 1000 AND 86400000)
);
CREATE TABLE notification_delivery_attempts (
 delivery_id TEXT NOT NULL,
 destination_id TEXT NOT NULL,
 number INTEGER NOT NULL CHECK(number>=1),
 phase TEXT NOT NULL CHECK(phase IN ('retry','fallback')),
 scheduled_at INTEGER NOT NULL,
 started_at INTEGER,
 finished_at INTEGER,
 outcome_category TEXT,
 code TEXT,
 status INTEGER,
 retry_after_seconds REAL,
 key_reference TEXT NOT NULL,
 PRIMARY KEY(delivery_id,number)
);
CREATE TRIGGER notification_attempt_reserved AFTER INSERT ON integration_attempts
WHEN NEW.namespace='uptime-notifications'
BEGIN
 INSERT OR IGNORE INTO notification_delivery_attempts(delivery_id,destination_id,number,phase,scheduled_at,key_reference)
 SELECT j.id,j.destination_id,NEW.number,'retry',d.next_at,j.event_id
 FROM notification_jobs j JOIN integration_deliveries d ON d.id=j.id AND d.namespace=NEW.namespace WHERE j.id=NEW.delivery_id;
END;
CREATE TRIGGER notification_attempt_finished AFTER UPDATE OF outcome ON integration_attempts
WHEN NEW.namespace='uptime-notifications' AND NEW.outcome IS NOT NULL
BEGIN
 UPDATE notification_delivery_attempts SET finished_at=NEW.finished_at,
 outcome_category=json_extract(NEW.outcome,'$.kind'),code=json_extract(NEW.outcome,'$.code'),
 status=json_extract(NEW.outcome,'$.status'),retry_after_seconds=json_extract(NEW.outcome,'$.retryAfterMs')/1000.0
 WHERE delivery_id=NEW.delivery_id AND number=NEW.number;
END;
