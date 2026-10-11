-- Installation-local runner credentials never enter a portable archive.
CREATE TABLE runners (
 runner_id TEXT PRIMARY KEY,
 registered_at INTEGER NOT NULL,
 network_label TEXT NOT NULL,
 key_ciphertext TEXT,
 legacy_key INTEGER NOT NULL DEFAULT 0,
 revoked_at INTEGER,
 last_contact_at INTEGER
);
INSERT INTO runners(runner_id,registered_at,network_label,legacy_key)
 SELECT runner_id,registered_at,'owner-network',1 FROM runner_registration;
DROP TABLE runner_registration;
-- Old slot lease columns remain only for portable historical records. Live
-- execution uses the deadline as an acceptance window, without a slot owner.
CREATE TABLE runner_assignments (
 slot_id TEXT NOT NULL,
 probe TEXT NOT NULL,
 runner_id TEXT NOT NULL,
 delivered_at INTEGER,
 PRIMARY KEY(slot_id,probe)
);
CREATE TABLE monitoring_watch (
 id TEXT PRIMARY KEY,
 at INTEGER NOT NULL,
 outcome TEXT NOT NULL
);
-- Optimistic generation guard keeps attempts, derived state and events atomic
-- across concurrent arrivals without a runtime-specific coordination service.
CREATE TABLE evidence_generation(monitor_id TEXT PRIMARY KEY,generation INTEGER NOT NULL DEFAULT 0);
INSERT INTO evidence_generation(monitor_id) SELECT id FROM monitors;
