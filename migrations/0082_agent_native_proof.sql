-- Opaque, exact-action references to native recent person proof. No bearer
-- material, factor, password or recovery code enters the agent door.
CREATE TABLE uptime_agent_native_proof(
 id TEXT PRIMARY KEY,
 operator_id TEXT NOT NULL,
 operator_version INTEGER NOT NULL,
 session_id TEXT NOT NULL,
 agent_id TEXT NOT NULL,
 tool TEXT NOT NULL,
 arguments_sha256 TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
