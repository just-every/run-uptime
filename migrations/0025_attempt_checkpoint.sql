-- Derived installation-local state; portable immutable observations remain intact.
-- Only an expired acceptance window can enter this chronological checkpoint.
CREATE TABLE attempt_checkpoints (
 monitor_id TEXT NOT NULL,
 revision INTEGER NOT NULL,
 due_at INTEGER NOT NULL,
 slot_id TEXT NOT NULL,
 state TEXT NOT NULL,
 last_observations TEXT NOT NULL,
 PRIMARY KEY(monitor_id,revision)
);
CREATE INDEX slots_projection ON slots(monitor_id,revision,manual,due_at,id);
