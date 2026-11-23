DROP INDEX IF EXISTS slots_status_lease;
CREATE INDEX IF NOT EXISTS slots_running_lease ON slots(lease_until,monitor_id) WHERE status='running';
CREATE INDEX IF NOT EXISTS slots_queued_manual ON slots(monitor_id,due_at) WHERE status='queued' AND manual=1;
CREATE INDEX IF NOT EXISTS outbox_monitor_changes ON outbox(monitor_id) WHERE status<>'imported-inactive';
-- The observation uniqueness index already starts with slot_id.
DROP INDEX IF EXISTS observations_slot;
