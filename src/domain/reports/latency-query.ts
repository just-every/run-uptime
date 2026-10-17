import { availabilityEvidenceCtes } from '../availability-query.ts'

// Nearest-rank percentiles are calculated in D1 over every selected final probe
// result, never over a recent-history page or averages of averages.
const statistics = `COUNT(*) AS count, MIN(duration_ms) AS min_ms, AVG(duration_ms) AS mean_ms,
  MAX(CASE WHEN sample_rank=(sample_count+1)/2 THEN duration_ms END) AS p50_ms,
  MAX(CASE WHEN sample_rank=(95*sample_count+99)/100 THEN duration_ms END) AS p95_ms,
  MAX(CASE WHEN sample_rank=(99*sample_count+99)/100 THEN duration_ms END) AS p99_ms,
  MAX(duration_ms) AS max_ms`

export const latencyQuery = `${availabilityEvidenceCtes}, latency_settings AS (
  SELECT ? AS bucket_ms, ? AS location, ? AS point_limit
), all_latency_samples AS (
  SELECT json_array(r.slot_id,r.probe) AS sample_id, r.probe, r.final_completed_at AS at,
    r.final_duration_ms AS duration_ms
  FROM per_probe r JOIN classified c ON c.id=r.slot_id CROSS JOIN params p
  WHERE c.valid_result=1 AND r.selected_probe=1 AND r.final_completed_at>=c.active_from
    AND r.final_completed_at>=p.window_start AND r.final_completed_at<p.now_at
), latency_samples AS (
  SELECT s.*, CASE WHEN t.bucket_ms=0 THEN s.sample_id
    ELSE CAST(CAST(s.at/t.bucket_ms AS INTEGER)*t.bucket_ms AS TEXT) END AS bucket_key
  FROM all_latency_samples s CROSS JOIN latency_settings t
  WHERE t.location='all' OR t.location=s.probe
), latency_bounds AS (
  SELECT COUNT(DISTINCT bucket_key) AS point_count FROM latency_samples
), bounded_samples AS (
  SELECT s.* FROM latency_samples s CROSS JOIN latency_bounds b CROSS JOIN latency_settings t
  WHERE b.point_count<=t.point_limit
), summary_ranked AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY duration_ms,sample_id) AS sample_rank,
    COUNT(*) OVER () AS sample_count FROM bounded_samples
), point_ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY bucket_key ORDER BY duration_ms,sample_id) AS sample_rank,
    COUNT(*) OVER (PARTITION BY bucket_key) AS sample_count FROM bounded_samples
), summary AS (
  SELECT ${statistics} FROM summary_ranked
), points AS (
  SELECT bucket_key, MIN(probe) AS probe, MIN(at) AS first_at, MAX(at) AS last_at, ${statistics}
  FROM point_ranked GROUP BY bucket_key
)
SELECT 'summary' AS kind, NULL AS at, NULL AS end_at, NULL AS location, summary.*,
  latency_bounds.point_count,
  (SELECT json_group_array(probe) FROM (SELECT DISTINCT probe FROM all_latency_samples ORDER BY probe)) AS locations
FROM summary CROSS JOIN latency_bounds
UNION ALL
SELECT 'point' AS kind,
  CASE WHEN t.bucket_ms=0 THEN first_at ELSE CAST(bucket_key AS INTEGER) END AS at,
  CASE WHEN t.bucket_ms=0 THEN last_at ELSE MIN(p.now_at,CAST(bucket_key AS INTEGER)+t.bucket_ms) END AS end_at,
  CASE WHEN t.bucket_ms=0 THEN points.probe ELSE t.location END AS location,
  points.count, points.min_ms, points.mean_ms, points.p50_ms, points.p95_ms, points.p99_ms, points.max_ms,
  NULL AS point_count, NULL AS locations
FROM points CROSS JOIN latency_settings t CROSS JOIN params p
ORDER BY kind DESC, at`
