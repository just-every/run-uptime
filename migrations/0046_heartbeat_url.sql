-- URL receipt capabilities are installation-local, hashed and revision scoped.
ALTER TABLE heartbeat_authority ADD COLUMN url_token_hash TEXT;
