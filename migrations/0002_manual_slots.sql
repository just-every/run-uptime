ALTER TABLE slots ADD COLUMN manual INTEGER NOT NULL DEFAULT 0;
UPDATE slots SET manual=1 WHERE id LIKE '%:manual:%';
INSERT INTO migrations VALUES(2,unixepoch()*1000);
