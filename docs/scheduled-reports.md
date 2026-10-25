# Scheduled reports

An owner schedules reports for an enabled email or Slack destination in Notifications. Choose one monitor or its named service. A one-time report freezes its figures when created. A recurring report freezes a new snapshot at each due instant. Delivery uses the existing mail/Slack transport; provider acknowledgment does not establish human receipt.

`POST /api/monitors/:id/report-schedules` accepts `destinationId`, `dueAt` (epoch milliseconds within the next 31 days), and `period` (existing report query fields as strings). Add `service` with the selected monitor's current service name for an aggregate. Add `recurrence: {"frequency":"daily","timeZone":"America/New_York"}` for recurrence; `weekly` and `monthly` are also supported. Recurring periods use named periods such as `24h` or `last-month`, calculated at the due instant.

The first instant anchors the local clock in the IANA zone. Later occurrences preserve that clock across daylight saving: nonexistent times are skipped, repeated times use their first instant, and month ends clamp to the last day without changing the original anchor day. A delayed scheduler sends one saved due occurrence and advances to the next anchored time after now, skipping missed occurrences without a catch-up burst. Previous send time never sets the cadence. `POST /api/monitors/:id/report-schedules/preview` accepts `dueAt` and `recurrence` and returns four calendar instants without creating sending authority. Previews can inspect past or future calendar dates independently of creation's 31-day bound.

`GET` on the schedule collection lists bounded metadata. Reading a recurring schedule by ID includes its latest ten frozen runs and their durable outcomes; Notifications offers the same JSON downloads. Reading an individual run ID returns its immutable snapshot. The installation retains at most 1,000 snapshots and 1,000 recurrence definitions. A recurrence that reaches the snapshot bound stops with `report_snapshot_limit`; an invalid or oversized snapshot stops with `report_snapshot_refused`, leaving other notifications able to proceed. These histories have no automatic deletion.

Service snapshots name their member monitors and retain each member's period-engine figures. Aggregate uptime uses summed Healthy and observed monitor-time, with Unknown, paused and maintenance time separate. It never averages percentages or percentiles. `GET /api/v1/services/report?service=NAME` returns the same engine's service figures and full per-monitor reports; `format=csv` downloads availability rows. Monitoring keys see only their authorized member monitors. JSON snapshots retain each member's latency statistics; no combined service percentile is claimed. Service charts on the monitor report screen remain unavailable.

The CLI uses the same public routes:

```sh
node scripts/reports.mjs schedule --origin https://uptime.example.test --monitor MONITOR_ID --input schedule.json
node scripts/reports.mjs preview --origin https://uptime.example.test --monitor MONITOR_ID --input calendar.json
node scripts/reports.mjs list --origin https://uptime.example.test --monitor MONITOR_ID
node scripts/reports.mjs show --origin https://uptime.example.test --monitor MONITOR_ID --id SCHEDULE_ID
node scripts/reports.mjs cancel --origin https://uptime.example.test --monitor MONITOR_ID --id SCHEDULE_ID
```

Supply the native owner session through `UPTIME_REPORT_COOKIE`. Input files contain report configuration; destination credentials do not belong in them. Schedule management requires a current workspace owner.

Each recurrence retains its initiating owner's Base version, role revision and destination credential admission. Disabling/revoking the destination or changing/removing that owner's authority stops future runs with a durable reason. Polling, claims and the transport boundary all check current authority. Cancellation stops a recurrence and prevents queued occurrence delivery; an already-started provider submission cannot be recalled. One-time cancellation still refuses after delivery starts, and repeated queued cancellation is unchanged.

A restart preserves due identity, frozen figures, next anchored time and failed/uncertain delivery outcomes. Email and Slack uncertainty never triggers an automatic duplicate; the existing proven-unaccepted mail-relay 429 rule remains. Archives carry frozen snapshots as inactive history and exclude recurring sending authority. Erasing a monitor removes aggregate snapshots and delivery history that name it, as well as its own snapshots. Destination erasure removes its snapshots. HISTORY-001 incumbent source segments remain unavailable.
