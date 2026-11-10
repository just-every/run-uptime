-- rer 0.2.107 adoption: Base 0044_business_retired.sql (required for person erasure when the seed has a Business roster).
-- Creates only bs_retired: value-free tombstones of people erased from the installation. No row is read, moved or purged.
-- Base 0044_business_retired.sql
-- Value-free tombstones of people erased from the installation: domain-separated SHA-256 digests of the roster
-- address and the Business member id, with the invite number they had. Never a name, address or id.
CREATE TABLE bs_retired (
  digest TEXT PRIMARY KEY,
  invite INTEGER NOT NULL CHECK(invite >= 0),
  erasure_id TEXT NOT NULL
);
