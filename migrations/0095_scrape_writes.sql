-- Each metrics credential decision is its own durable receipt. The clustered
-- key also serves the last-successful-use lookup without a second index write.
-- An empty token_id denotes an unrecognized key. rowid is the receipt UUID.
CREATE TABLE IF NOT EXISTS metrics_scrape_usage (
  token_id TEXT NOT NULL,
  allowed INTEGER NOT NULL CHECK (allowed IN (0,1)),
  at INTEGER NOT NULL,
  rowid TEXT NOT NULL,
  request_id TEXT NOT NULL,
  PRIMARY KEY (token_id, allowed, at, rowid)
) WITHOUT ROWID;

-- Expose both generations of receipts with the original audit fields. Scope,
-- resource and namespace are fixed for this one operation.
CREATE VIEW IF NOT EXISTS metrics_token_usage AS
  SELECT namespace,id,token_id,at,required_scopes,allowed,request_id,resource
  FROM integration_token_usage WHERE namespace='uptime-metrics'
  UNION ALL
  SELECT 'uptime-metrics',rowid,NULLIF(token_id,''),at,'["metrics:read"]',allowed,request_id,'metrics.snapshot'
  FROM metrics_scrape_usage;

-- Separate fixed-minute counts within a UTC hour share a physical row. The
-- hour-first index also serves cleanup. Only keyed client hashes are stored.
CREATE TABLE IF NOT EXISTS metrics_rate_hours (
  hour_start INTEGER NOT NULL,
  client_hash TEXT NOT NULL,
  minute_counts TEXT NOT NULL,
  request_limit INTEGER NOT NULL,
  PRIMARY KEY (hour_start, client_hash)
);

-- During rolling deployment an older Worker may still admit against the
-- minute table. Its INSERT ... RETURNING must see a full combined window as
-- denied too. Read the live configured limit saved by the upgraded Worker.
CREATE TRIGGER IF NOT EXISTS metrics_legacy_limit BEFORE INSERT ON public_rate_limits
WHEN NEW.class='metrics' AND NEW.request_count=1 AND EXISTS (
  SELECT 1 FROM metrics_rate_hours h
  WHERE h.hour_start=NEW.window_start/3600000*3600000 AND h.client_hash=NEW.client_hash
    AND json_extract(h.minute_counts,'$.m'||(NEW.window_start%3600000/60000)) +
      COALESCE((SELECT request_count FROM public_rate_limits
        WHERE class=NEW.class AND client_hash=NEW.client_hash AND window_start=NEW.window_start),0) >= h.request_limit
) BEGIN
  SELECT RAISE(IGNORE);
END;
