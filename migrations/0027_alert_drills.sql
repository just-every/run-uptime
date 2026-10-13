-- An alert drill is one labelled test send to one destination with a one-time confirmation link. The row binds the drill
-- to the destination's credential at the time, so a rotated or re-entered destination is no longer proven by it. The
-- link's capability is never stored in plaintext: token_hash is its SHA-256, and token_ciphertext is the capability
-- sealed under the installation key only until the single send finishes, so the sender can add it to the message.
-- Drill history is installation-local and does not travel in archives. Nothing here touches monitors or incidents.
CREATE TABLE alert_drills(
 id TEXT PRIMARY KEY,
 destination_id TEXT NOT NULL,
 credential_id TEXT NOT NULL,
 delivery_id TEXT NOT NULL UNIQUE,
 started_by TEXT,
 started_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 token_hash TEXT,
 token_ciphertext TEXT,
 submitted_at INTEGER,
 confirmed_at INTEGER
);
CREATE INDEX alert_drills_destination ON alert_drills(destination_id,started_at);
