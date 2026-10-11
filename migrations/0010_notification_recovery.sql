-- A damaged or invalidated credential is visible to its owner but never sent.
ALTER TABLE notification_credentials ADD COLUMN unavailable_at INTEGER;
-- Product-only custody for provably unstarted claims. Base attempts retain their
-- original semantics; released reservations are retained here for audit.
CREATE TABLE notification_claim_custody (
 claim TEXT PRIMARY KEY, delivery_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 reservation_hash TEXT NOT NULL,
 started_at INTEGER, released_at INTEGER
);
-- Retirement needs no encryption key. Apply it during SQL upgrade as well as
-- after later outcomes, including installations that have not polled yet.
UPDATE notification_jobs SET state='rejected',code='credential_rotated',finished_at=unixepoch()*1000
 WHERE state='queued'
 AND NOT EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_jobs.destination_id AND d.credential_id=notification_jobs.credential_id AND d.deleted_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=notification_jobs.id AND d.state<>'queued');
UPDATE integration_deliveries SET state='rejected',next_at=unixepoch()*1000
 WHERE namespace='uptime-notifications' AND state='queued'
 AND id IN(SELECT id FROM notification_jobs WHERE state='rejected' AND code='credential_rotated');
UPDATE notification_credentials SET endpoint=NULL,signing_secret=NULL,ciphertext=NULL,retired_at=unixepoch()*1000
 WHERE retired_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_credentials.destination_id AND d.credential_id=notification_credentials.id AND d.deleted_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM notification_jobs j WHERE j.credential_id=notification_credentials.id AND
  ((j.state='sending' AND j.claim IS NOT NULL AND j.claim_until>unixepoch()*1000) OR EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=j.id AND d.state='sending' AND d.claim IS NOT NULL AND d.claim_until>unixepoch()*1000)));
