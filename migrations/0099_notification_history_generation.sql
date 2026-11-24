-- The console's alert and delivery lists are retained history that changes
-- only when an event, delivery, attempt or fallback chain changes. A console
-- that holds the lists of the current generation is not sent them again on
-- every poll (src/domain/history-generation.server.ts).
CREATE TABLE IF NOT EXISTS notification_history_generation (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 generation INTEGER NOT NULL
);
INSERT OR IGNORE INTO notification_history_generation(singleton,generation) VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS outbox_history_insert AFTER INSERT ON outbox
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS outbox_history_update AFTER UPDATE ON outbox
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS outbox_history_delete AFTER DELETE ON outbox
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS notification_jobs_history_insert AFTER INSERT ON notification_jobs
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS notification_jobs_history_update AFTER UPDATE ON notification_jobs
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS notification_jobs_history_delete AFTER DELETE ON notification_jobs
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS integration_deliveries_history_insert AFTER INSERT ON integration_deliveries
WHEN NEW.namespace='uptime-notifications'
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS integration_deliveries_history_update AFTER UPDATE ON integration_deliveries
WHEN NEW.namespace='uptime-notifications'
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS integration_deliveries_history_delete AFTER DELETE ON integration_deliveries
WHEN OLD.namespace='uptime-notifications'
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS integration_attempts_history_insert AFTER INSERT ON integration_attempts
WHEN NEW.namespace='uptime-notifications'
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS integration_attempts_history_update AFTER UPDATE ON integration_attempts
WHEN NEW.namespace='uptime-notifications'
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS integration_attempts_history_delete AFTER DELETE ON integration_attempts
WHEN OLD.namespace='uptime-notifications'
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS notification_delivery_attempts_history_insert AFTER INSERT ON notification_delivery_attempts
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS notification_delivery_attempts_history_update AFTER UPDATE ON notification_delivery_attempts
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS notification_delivery_attempts_history_delete AFTER DELETE ON notification_delivery_attempts
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS alert_fallback_chains_history_insert AFTER INSERT ON alert_fallback_chains
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS alert_fallback_chains_history_update AFTER UPDATE ON alert_fallback_chains
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
CREATE TRIGGER IF NOT EXISTS alert_fallback_chains_history_delete AFTER DELETE ON alert_fallback_chains
BEGIN
 UPDATE notification_history_generation SET generation=generation+1 WHERE singleton=1;
END;
