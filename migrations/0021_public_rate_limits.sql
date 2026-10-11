-- Installation-local, expiring request counters; no raw IP addresses.
CREATE TABLE public_rate_limits (
  class TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (class, client_hash, window_start)
);
CREATE INDEX public_rate_limits_expiry ON public_rate_limits(expires_at);
