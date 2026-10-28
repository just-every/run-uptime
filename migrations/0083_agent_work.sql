-- Durable initiating identity without any token, browser cookie or credential.
-- Revisions and one-time runner handoffs retain custody across Worker restarts.
CREATE TABLE uptime_agent_revisions(
 monitor_id TEXT NOT NULL, revision INTEGER NOT NULL, principal TEXT NOT NULL,
 PRIMARY KEY(monitor_id,revision)
);
CREATE TABLE uptime_agent_handoffs(
 id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL, revision INTEGER NOT NULL,
 runner_id TEXT NOT NULL, operation_key TEXT NOT NULL UNIQUE,
 args TEXT NOT NULL, principal TEXT NOT NULL, delivered_at INTEGER,
 UNIQUE(monitor_id,revision,runner_id,operation_key)
);
CREATE TABLE uptime_agent_manual(slot_id TEXT PRIMARY KEY,principal TEXT NOT NULL);
CREATE TABLE uptime_agent_discoveries(id TEXT PRIMARY KEY,principal TEXT NOT NULL,delivered_at INTEGER);
CREATE TABLE uptime_agent_notifications(delivery_id TEXT PRIMARY KEY,principal TEXT NOT NULL);
