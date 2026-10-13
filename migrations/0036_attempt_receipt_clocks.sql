-- Control-plane receipt clocks belong to installation execution authority,
-- alongside delivery clocks. Keep the signed observation bytes unchanged.
-- Older attempts have no receipt clock and retain their historical projection.
ALTER TABLE runner_assignments ADD COLUMN received_times TEXT NOT NULL DEFAULT '{}';
