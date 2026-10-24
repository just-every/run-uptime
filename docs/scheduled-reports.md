# Scheduled report snapshots

An owner can schedule a one-time per-monitor report for an enabled email or Slack destination already configured in Notifications. The report freezes the requested period, time zone, denominator and figures when scheduled. It sends at or after the chosen due time through Uptime's ordinary mail or Slack transport. Provider acknowledgment does not establish human receipt.

`POST /api/monitors/:id/report-schedules` accepts `destinationId`, `dueAt` (epoch milliseconds, within the next 31 days), and `period` (the existing report query fields as strings). The response includes its initiating `ownerId`, due time, immutable `report`, delivery ID, state and outcome metadata. `GET` on the same path lists the latest 100 snapshots; `GET /api/monitors/:id/report-schedules/:scheduleId` reads one snapshot and its current durable delivery outcome. All three require a live owner session. The installation retains at most 1,000 snapshots and refuses another schedule at the bound.

The CLI uses the same routes:

```sh
node scripts/reports.mjs schedule --origin https://uptime.example.test --monitor MONITOR_ID --input schedule.json
node scripts/reports.mjs list --origin https://uptime.example.test --monitor MONITOR_ID
node scripts/reports.mjs show --origin https://uptime.example.test --monitor MONITOR_ID --id SCHEDULE_ID
```

Supply the live native owner session only through `UPTIME_REPORT_COOKIE`. The input file contains the three API fields above; no destination credential belongs in it.

A restart preserves the snapshot, due condition and single delivery identity. Failed and uncertain outcomes remain readable through this API and the existing Notifications console. Email and Slack uncertainty never causes an automatic duplicate; the existing proven-unaccepted mail-relay 429 rule still applies. Archive restore retains the snapshot and quarantines delivery; it cannot send an imported report. Monitor/destination erasure removes dependent snapshots; owner erasure anonymizes attribution.

Cancellation and initiating-member revocation of an already scheduled report remain pending under ACCESS-001. Recurring schedules, service-aggregated reports and incumbent-history source segments are not implemented. Schedule creation currently uses API/CLI; the report console control remains pending.
