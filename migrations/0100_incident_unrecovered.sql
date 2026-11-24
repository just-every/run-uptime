-- Reports and metrics read the incidents that overlap a period. Incidents that
-- opened inside it, or recovered after it began, are found by observation time.
-- The rest are incidents still without a recovery, kept here so a period read
-- never walks a monitor's whole retained trigger history.
CREATE INDEX IF NOT EXISTS outbox_observed ON outbox(monitor_id,kind,json_extract(event,'$.observedAt'));
CREATE TABLE IF NOT EXISTS incident_unrecovered (
 outbox_id TEXT PRIMARY KEY,
 monitor_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS incident_unrecovered_monitor ON incident_unrecovered(monitor_id);
INSERT OR IGNORE INTO incident_unrecovered(outbox_id,monitor_id)
 SELECT t.id,t.monitor_id FROM outbox t WHERE t.kind='trigger' AND NOT EXISTS(SELECT 1 FROM outbox r
  WHERE r.monitor_id=t.monitor_id AND r.kind='recovery' AND json_extract(r.event,'$.incidentKey')=json_extract(t.event,'$.incidentKey'));
CREATE TRIGGER IF NOT EXISTS outbox_trigger_unrecovered AFTER INSERT ON outbox
WHEN NEW.kind='trigger' AND NOT EXISTS(SELECT 1 FROM outbox r
 WHERE r.monitor_id=NEW.monitor_id AND r.kind='recovery' AND json_extract(r.event,'$.incidentKey')=json_extract(NEW.event,'$.incidentKey'))
BEGIN
 INSERT OR IGNORE INTO incident_unrecovered(outbox_id,monitor_id) VALUES(NEW.id,NEW.monitor_id);
END;
CREATE TRIGGER IF NOT EXISTS outbox_recovery_recovered AFTER INSERT ON outbox
WHEN NEW.kind='recovery'
BEGIN
 DELETE FROM incident_unrecovered WHERE outbox_id IN(SELECT t.id FROM outbox t
  WHERE t.monitor_id=NEW.monitor_id AND t.kind='trigger' AND json_extract(t.event,'$.incidentKey')=json_extract(NEW.event,'$.incidentKey'));
END;
CREATE TRIGGER IF NOT EXISTS outbox_trigger_deleted AFTER DELETE ON outbox
WHEN OLD.kind='trigger'
BEGIN
 DELETE FROM incident_unrecovered WHERE outbox_id=OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS outbox_recovery_deleted AFTER DELETE ON outbox
WHEN OLD.kind='recovery'
BEGIN
 INSERT OR IGNORE INTO incident_unrecovered(outbox_id,monitor_id)
  SELECT t.id,t.monitor_id FROM outbox t WHERE t.monitor_id=OLD.monitor_id AND t.kind='trigger'
   AND json_extract(t.event,'$.incidentKey')=json_extract(OLD.event,'$.incidentKey')
   AND NOT EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=t.monitor_id AND r.kind='recovery'
    AND json_extract(r.event,'$.incidentKey')=json_extract(t.event,'$.incidentKey'));
END;
