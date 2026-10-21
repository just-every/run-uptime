-- Adding a location from any machine (owner, 20 Oct 2026, U13): the Add location command carries a one-time join key. Only its
-- hash is stored; the runner that joins with it receives the location's own runner key, minted then, and the hash is cleared,
-- so the copied command cannot join again. Installation-local, like the runner row it extends.
ALTER TABLE runners ADD COLUMN join_hash TEXT;
