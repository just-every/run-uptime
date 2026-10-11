-- Plaintext columns are nullable so retirement erases custody without removing
-- durable identities. The key-bearing Worker completes encryption before ready.
ALTER TABLE notification_credentials RENAME TO notification_credentials_legacy;
CREATE TABLE notification_credentials (
 id TEXT PRIMARY KEY, destination_id TEXT NOT NULL, endpoint TEXT, signing_secret TEXT,
 created_at INTEGER NOT NULL, ciphertext TEXT, retired_at INTEGER,
 CHECK(retired_at IS NULL OR (endpoint IS NULL AND signing_secret IS NULL AND ciphertext IS NULL))
);
INSERT INTO notification_credentials(id,destination_id,endpoint,signing_secret,created_at)
 SELECT id,destination_id,endpoint,signing_secret,created_at FROM notification_credentials_legacy;
DROP TABLE notification_credentials_legacy;
