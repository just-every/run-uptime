-- The installation-wide External check URL: a page the owner does not run, checked from the same runner so a problem on the
-- owner's own network is not reported as an outage. A monitor saved on a single runner network with no URL of its own takes
-- this value into its saved revision; changing it applies only to monitors saved afterwards. The row is installation-local
-- configuration and does not travel in archives. Nothing here touches monitors, slots, observations, state or the outbox.
CREATE TABLE external_check(
 id INTEGER PRIMARY KEY CHECK(id=1),
 url TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
INSERT INTO external_check(id,url,updated_at) VALUES(1,'https://example.com/',CAST(strftime('%s','now') AS INTEGER)*1000);
