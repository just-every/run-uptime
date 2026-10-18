-- Base rer 0.2.61 importDoorScopesMigration: binds each door namespace to its destination for erasure.
CREATE TABLE IF NOT EXISTS ik_door_scopes (
    installation_id TEXT NOT NULL, namespace TEXT NOT NULL, destination TEXT NOT NULL,
    PRIMARY KEY(installation_id,namespace));
