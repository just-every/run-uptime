-- Product permissions narrow live Base identities; authentication remains in Base.
-- Authority is installation-local and never restored from an archive.
CREATE TABLE uptime_member_roles (
 operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id),
 role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','responder','read-only')),
 base_role TEXT NOT NULL CHECK(base_role IN ('owner','admin','member')),
 base_version INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
CREATE TABLE uptime_member_scopes (
 operator_id TEXT NOT NULL REFERENCES uptime_member_roles(operator_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('service','team')),
 value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 100),
 PRIMARY KEY(operator_id,kind,value)
);
-- An existing owner/admin keeps that live Base ceiling on a populated upgrade.
-- A Base member gets no product authority until explicitly assigned a role.
INSERT INTO uptime_member_roles(operator_id,role,base_role,base_version,updated_at)
 SELECT id,role,role,version,unixepoch()*1000 FROM oa_operators WHERE role IN ('owner','admin');
CREATE TRIGGER uptime_base_role_insert AFTER INSERT ON oa_operators
 WHEN NEW.role IN ('owner','admin')
 BEGIN
 INSERT INTO uptime_member_roles(operator_id,role,base_role,base_version,updated_at)
 VALUES(NEW.id,NEW.role,NEW.role,NEW.version,unixepoch()*1000);
 END;
-- Base advances version when role/status changes. New owner/admin authority
-- follows that live ceiling; member narrowings must be granted again after a
-- deactivation/reactivation or Base role change, never silently resurrected.
CREATE TRIGGER uptime_base_role_version AFTER UPDATE OF version ON oa_operators
 WHEN NEW.role IN ('owner','admin')
 BEGIN
 INSERT INTO uptime_member_roles(operator_id,role,base_role,base_version,updated_at)
 VALUES(NEW.id,NEW.role,NEW.role,NEW.version,unixepoch()*1000)
 ON CONFLICT(operator_id) DO UPDATE SET role=excluded.role,base_role=excluded.base_role,
 base_version=excluded.base_version,revision=uptime_member_roles.revision+1,updated_at=excluded.updated_at;
 DELETE FROM uptime_member_scopes WHERE operator_id=NEW.id AND NEW.role='owner';
 END;
