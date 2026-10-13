-- Each applied definition file is one batch: when, by whom, from which source and plan, and per entry the monitor and
-- the revision it produced. Undo reads these rows; it never deletes observations, slots or incident history. Batches
-- travel in archives as history and arrive with restored_at set, which keeps them from acting on a new installation.
CREATE TABLE definition_batches(
 id TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL,
 actor_kind TEXT NOT NULL,
 actor_ref TEXT NOT NULL,
 source TEXT NOT NULL,
 plan_digest TEXT NOT NULL,
 counts TEXT NOT NULL,
 undone_at INTEGER,
 restored_at INTEGER
);
CREATE TABLE definition_batch_entries(
 batch_id TEXT NOT NULL,
 monitor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('create','change')),
 revision INTEGER NOT NULL,
 previous_revision INTEGER,
 undo_outcome TEXT,
 PRIMARY KEY(batch_id,monitor_id)
);
CREATE INDEX definition_batch_entries_monitor ON definition_batch_entries(monitor_id);
