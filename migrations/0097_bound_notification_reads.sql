-- Keep the minute credential seal proportional to unfinished legacy work.
CREATE INDEX IF NOT EXISTS integration_deliveries_legacy_hash
 ON integration_deliveries(namespace,id)
 WHERE namespace='uptime-notifications'
 AND lower(substr(destination_hash,1,8))<>'hmac-v1:'
 AND lower(substr(destination_hash,1,12))<>'unavailable:';

-- Bound console pages and metrics to the selected history.
CREATE INDEX IF NOT EXISTS notification_jobs_recent ON notification_jobs(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS notification_jobs_monitor_time
 ON notification_jobs(json_extract(event,'$.monitorId'),created_at)
 WHERE json_extract(event,'$.monitorId') IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_jobs_oncall_incident
 ON notification_jobs(destination_id,credential_id,json_extract(event,'$.incidentKey'))
 WHERE json_extract(webhook_template,'$.mode')='oncall';
CREATE INDEX IF NOT EXISTS outbox_monitor_history ON outbox(monitor_id);
