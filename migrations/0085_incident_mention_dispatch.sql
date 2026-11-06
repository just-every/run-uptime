-- Select the oldest never-reserved work without scanning retained send history.
CREATE INDEX incident_mentions_pending_dispatch ON incident_mentions(created_at,id)
 WHERE outcome='pending' AND submitted_at IS NULL AND finished_at IS NULL;
