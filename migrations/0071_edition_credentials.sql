CREATE TABLE uptime_credential_workspace(singleton INTEGER PRIMARY KEY CHECK(singleton=1),id TEXT NOT NULL);
INSERT INTO uptime_credential_workspace VALUES(1,lower(hex(randomblob(16))));
CREATE TABLE uptime_credential_grants(
 id TEXT PRIMARY KEY,namespace TEXT NOT NULL UNIQUE,workspace_id TEXT NOT NULL,
 issuer_id TEXT NOT NULL,issuer_version INTEGER NOT NULL,issuer_role TEXT NOT NULL,role_revision INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,resources TEXT NOT NULL,environment TEXT,created_at INTEGER NOT NULL
);
CREATE TABLE uptime_credential_limits(grant_id TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);
