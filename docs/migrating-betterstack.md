In **New monitor › Import a file** (also available in **Settings › Backup and files**), keep **Detect from the file** selected and choose saved pages whose
resources have `type: "monitor"`. The command also accepts `--source betterstack-monitors`.
Save the JSON response from `GET https://uptime.betterstack.com/api/v2/monitors` with your read-only API token, following each pagination link. Collect pages in a JSON array or append the saved pages. For heartbeat groups, save each group’s heartbeat pages from `GET /api/v2/heartbeat-groups/{id}/heartbeats`. Save heartbeat and status-page resources separately; their existing reader and
catalog mappings remain unchanged. This imports no live account.

The [monitor response](https://betterstack.com/docs/uptime/api/list-all-existing-monitors/)
and [field definitions](https://betterstack.com/docs/uptime/api/create-a-new-monitor/)
were read on 23 October 2026. Status, expected-status, required/forbidden keyword,
ping and single-port TCP settings preview as paused monitors. Status checks accept
2xx; expected-status checks preserve their explicit code set. Keywords become
literal, case-sensitive assertions. Frequency remains seconds converted to milliseconds;
the preview shows source timeout units, local limits and ping policy differences.

Group identifiers become labels because a monitor page carries no group name.
Each region is retained as a label and named as an unavailable geographic location;
`local-a` is your own runner, not a replacement US/EU/Asia/Australia region. Review
and assign real locations before enabling. Source request credentials and payloads
are withheld and require separate local review. Provider status addresses still
become attributed catalog monitors.

Review every difference, apply paused, re-import unchanged settings, and use undo
to retain the created monitors paused with their history. Contacts, maintenance,
history, time-based confirmation/recovery, Oncall/Lamp handoffs, live extraction and
side-by-side cutover remain separate work. Source expiry reminders require reviewed
TLS-001 and DOMAIN-001 monitors. No recipient is created or notified.
