-- Installation-local authenticated contact, never imported from an archive.
CREATE TABLE runner_contact(id INTEGER PRIMARY KEY CHECK(id=1),last_contact_at INTEGER NOT NULL);
INSERT INTO migrations VALUES(3,unixepoch()*1000);
