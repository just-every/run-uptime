-- PERF-001: the optional real-user beacon. An owner registers a site origin; the beacon stays off until the owner enables it, and
-- samples a low share of consenting visitors by default. Uptime keeps only anonymous hourly aggregates by route (path only, with
-- identifier-like segments replaced), device class and country: no query string, fragment, cookie, identifier or IP address.
CREATE TABLE rum_sites(
 id TEXT PRIMARY KEY,
 origin TEXT NOT NULL UNIQUE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 sample_percent INTEGER NOT NULL DEFAULT 10 CHECK(sample_percent BETWEEN 1 AND 100),
 excluded_paths TEXT NOT NULL DEFAULT '[]',
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
-- One row per site, hour, route, device and country. Each sampled page view adds to its sums; a figure the browser did not report
-- adds nothing to that figure's count, so every average names its own denominator.
CREATE TABLE rum_aggregates(
 site_id TEXT NOT NULL,
 hour INTEGER NOT NULL,
 route TEXT NOT NULL,
 device TEXT NOT NULL CHECK(device IN ('mobile','desktop')),
 region TEXT NOT NULL,
 views INTEGER NOT NULL DEFAULT 0,
 failed_views INTEGER NOT NULL DEFAULT 0,
 known_views INTEGER NOT NULL DEFAULT 0,
 errors INTEGER NOT NULL DEFAULT 0,
 lcp_n INTEGER NOT NULL DEFAULT 0, lcp_sum INTEGER NOT NULL DEFAULT 0, lcp_poor INTEGER NOT NULL DEFAULT 0,
 cls_n INTEGER NOT NULL DEFAULT 0, cls_milli_sum INTEGER NOT NULL DEFAULT 0,
 inp_n INTEGER NOT NULL DEFAULT 0, inp_sum INTEGER NOT NULL DEFAULT 0,
 ttfb_n INTEGER NOT NULL DEFAULT 0, ttfb_sum INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(site_id,hour,route,device,region)
);
-- Beacons the door refused to aggregate, by reason (a bot, an excluded path), so filtering is visible without keeping the beacon.
CREATE TABLE rum_dropped(
 site_id TEXT NOT NULL,
 hour INTEGER NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('bot','excluded')),
 count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(site_id,hour,reason)
);
