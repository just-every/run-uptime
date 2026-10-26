-- PERF-001: anonymous frequency counts, never per-visitor records. Existing hourly
-- sums remain intact: pre-upgrade data has no reconstructable percentiles.
-- Subdivision is the edge-provided US code, or empty when it is unavailable.
-- These installation-local counts are excluded from archives with rum_sites.
CREATE TABLE rum_value_counts(
 site_id TEXT NOT NULL,
 hour INTEGER NOT NULL,
 route TEXT NOT NULL,
 device TEXT NOT NULL CHECK(device IN ('mobile','desktop')),
 region TEXT NOT NULL,
 subdivision TEXT NOT NULL,
 metric TEXT NOT NULL CHECK(metric IN ('status','errors','lcpMs','cls','inpMs')),
 value INTEGER NOT NULL CHECK(value>=0),
 count INTEGER NOT NULL CHECK(count>0),
 PRIMARY KEY(site_id,hour,route,device,region,subdivision,metric,value)
);
