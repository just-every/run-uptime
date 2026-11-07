-- ROUTING-001: a route drill sent to a team member is bound to the monitor whose route chose it, so the member's opt-in,
-- the team and the member's access are re-read when the queued drill is claimed. Alert bindings leave this empty.
ALTER TABLE alert_team_deliveries ADD COLUMN monitor_id TEXT;
