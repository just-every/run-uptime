-- An atomic projection token freezes the acceptance decision for its batch.
-- It is ephemeral installation-local concurrency state, not portable evidence.
ALTER TABLE evidence_generation ADD COLUMN projection_id TEXT;
