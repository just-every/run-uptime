Uptime exposes the same immutable monitoring figures to Prometheus, Grafana and owner-invoked Datadog or signed webhook exports. Unknown coverage stays separate from availability. A probe ID identifies an Uptime location; this integration does not use Datadog-managed probes.

## Create a metrics key

In **Settings → Metrics export**, name a key, choose its expiry (1–366 days) and select **Create metrics key**. Copy the key before closing the dialog: it is shown once and only its hash is stored. The list shows expiry, last use and revocation. Revoke a key to stop its next request immediately. Keys belong to this installation, are managed by its active owners and are never restored from archives. Their metadata and authorization-use audit remain local until reset. Default expiry is 90 days.

A key has exactly `metrics:read`: it authorizes only `GET /api/v1/metrics`, including the JSON representation. It cannot read private archives, other product APIs or change monitors or settings. Owner sessions can also read the endpoint. This is separate from READAPI-001's future general-purpose scoped keys and ACCESS-003's future second-factor policy.

## Prometheus

Store the key in an owner-only file on the Prometheus host. Set the real application host and use HTTPS:

```yaml
scrape_configs:
  - job_name: uptime
    scheme: https
    metrics_path: /api/v1/metrics
    scrape_interval: 30s
    scrape_timeout: 25s
    params:
      period: [24h]
      timeZone: [America/Chicago]
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/uptime-key
    static_configs:
      - targets: [uptime.example.com]
```

The [Prometheus authorization configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#http_config) supports `credentials_file`. The endpoint returns Prometheus text 0.0.4, with no cache. A failed scrape stays a failed scrape; clients must not carry an old value forward as fresh evidence. Inspect `up` and `time() - uptime_snapshot_timestamp_seconds` together.

Choose `period=24h`, `7d`, `30d` or `90d`, or `period=custom&from=...&to=...`. Custom bounds accept ISO times or epoch milliseconds, with an IANA `timeZone`. Ambiguous daylight-saving wall times require an explicit offset. A `monitor` parameter takes a comma-separated selection of installation-local monitor IDs. Unknown IDs return 404; a different installation's key is refused. `format=json` returns the underlying versioned snapshot used by every exporter. The owner-session OpenAPI document describes this endpoint at `/api/v1/openapi.json`.

Requests refuse more than 100 monitors, more than 3 distinct configured/historical probe IDs per monitor, windows over 90 days, more than 15,000 samples or output over 2 MiB. Nothing is truncated. Public admission limits this endpoint to 60 requests per client per minute (owner-tunable in `seed.json`); excess returns 429 with `Retry-After`. Large histories can take longer than a scrape timeout: select fewer monitors or a shorter period rather than treating an unavailable scrape as success.

## Figures and freshness

All exported values are **gauges**, including counts over a selected report window. They are not cumulative counters: do not apply `rate()` to them. Availability, its durations, latency percentiles and incident totals are computed by the same functions as the console and `/api/v1/monitors/{id}/report`. Compare the same fixed `from`/`to` and time zone; two moving 24-hour requests capture different instants.

- `uptime_availability_percent` uses observed Healthy + not-passing scheduled time. It is absent when that denominator is zero; `uptime_availability_defined` then reads 0. Unknown, paused and maintenance seconds remain visible separately.
- `uptime_latency_seconds` exposes min, mean, p50, p95, p99 and max for the entire selected window, both across locations (`probe_id="all"`) and per location. Retries do not add samples; manual, incomplete and runner-error results are excluded by the report engine.
- `uptime_monitor_state`, expected/observed coverage, `uptime_probe_state`, contact and evidence freshness preserve Healthy, Degraded, Failing and Unknown. Runner contact uses the configured stale-contact interval (two minutes by default); contact is not target health. Historical report availability may remain defined after current evidence expires.
- `uptime_incidents` and `uptime_incident_duration_seconds` match the report's overlapping incidents. `uptime_delivery_jobs` counts jobs created within the window by their **current** persisted outcome, not a historical as-of delivery verdict.

Labels contain stable monitor, probe and assigned runner IDs and fixed state/statistic/outcome enums. Names, target URLs, error text, incident IDs and timestamps never become labels. Timestamp values are separate gauges. This bounds cardinality without hiding missing evidence.

## Grafana dashboard

Import [the supplied dashboard JSON](https://github.com/just-every/run-uptime/blob/main/docs/grafana/uptime-dashboard.json) into Grafana and select your Prometheus data source. Choose monitor IDs in its monitor selector. Panels show availability, exclusions and Unknown time, per-location latency, current state, coverage, probe freshness, incidents and delivery outcomes.

The dashboard's report-window panels use instant queries: changing Grafana's time picker does not change the period configured in the scrape. Change Prometheus's `period` parameter for another report window. A rolling availability gauge must never be averaged and presented as a different-period SLA. Snapshot age and the report window's start and end gauges show which capture is being displayed. The age panel retains the last captured timestamp for at most one hour after a failed scrape, so its age keeps increasing while current metric panels become unavailable. After that hour the age panel is unavailable too; no failed scrape refreshes the capture. Prometheus's `up` metric still reports the scrape failure.

## Datadog and signed webhooks

Run the export command explicitly on a trusted host with this checkout's pinned Node runtime. Put the metrics key in the `UPTIME_METRICS_TOKEN` environment variable. For Datadog, also set `DATADOG_API_KEY`, then run:

```sh
node scripts/metrics-export.mjs --origin https://uptime.example.com --datadog-site datadoghq.com --period 24h
```

The command sends gauge series to the [Datadog v2 metrics API](https://docs.datadoghq.com/api/latest/metrics/#submit-metrics). Supported sites are `datadoghq.com`, `us3.datadoghq.com`, `us5.datadoghq.com`, `datadoghq.eu`, `ap1.datadoghq.com`, `ap2.datadoghq.com` and `ddog-gov.com`. Each sample keeps `source:uptime`, monitor and Uptime location/runner identity. It never claims that Datadog collected the check. The API key goes only to the selected official HTTPS API.

For an owner-selected public HTTPS receiver, set `UPTIME_METRICS_WEBHOOK_SECRET` to at least 32 bytes and run:

```sh
node scripts/metrics-export.mjs --origin https://uptime.example.com --webhook https://metrics.example.com/receive --period 24h
```

The webhook receives the same JSON snapshot. Verify `x-uptime-signature` as `v1=` plus the hexadecimal HMAC-SHA256 of `x-uptime-timestamp + "." + exact UTF-8 body`, using the secret as literal text. Enforce a five-minute timestamp window and constant-time comparison. No secret appears in the snapshot. DNS answers are validated and the connection pinned; redirects are never followed. Revocation refuses the snapshot before any receiver request.

Both forms accept `--monitor ID` repeatedly, `--time-zone`, or `--period custom --from ... --to ...`. Each invocation fetches one bounded snapshot and makes at most one send, with a 15-second fetch bound and separate 15-second DNS and request bounds for sending (at most 45 seconds across those phases), plus a 2 MiB webhook payload bound (512,000 bytes for Datadog). Exit 0 means the provider acknowledged it; exit 1 means failure/refusal, and exit 2 means an uncertain send (including connection loss or HTTP 5xx). There is no background schedule or automatic retry. Acknowledgement is not recipient readback; decide separately whether to invoke another export. Credentials stay in process environment and are never written to the product database or archives. Exported data is held by the receiver and cannot be recalled by local monitor erasure.
