A heartbeat job reports its start, success or failure to Uptime. Each receipt uses the key issued on the monitor page and a strictly increasing `X-Heartbeat-Sequence`. The key is shown once and stored hashed. Receipts request evaluation; only a signed scheduled result can confirm an incident or recovery.

Create a heartbeat through the monitor API or a definitions file. Its `heartbeat` configuration accepts:

```json
{"maxAgeMs":86400000,"graceMs":900000,"maxRunDurationMs":1800000,"outputMasks":["customer-private-phrase"]}
```

`maxAgeMs` is the expected period between successes, up to 31 days. Existing five-second periods remain accepted; use at least 30 seconds for ordinary jobs. Grace is added explicitly, from zero to 24 hours. The first deadline starts at the current revision's creation; each success starts a new period. A start never extends that deadline. Before the first deadline, absent success is Unknown; at the deadline it becomes missed evidence. A maximum run duration of zero disables the running-too-long check. A second start before a finish returns 409; this header form supports one active run per monitor.

An owner can save these settings at `POST /api/monitors/MONITOR_ID/heartbeat-settings` with the JSON above. Saving creates an immutable revision and retires the old key; issue a new key afterward. The attached Job schedule and runs panel uses this same configuration door. Failure and recovery still follow the monitor's configured scheduled confirmation thresholds and independent-vantage/external-check coverage. For the first confirming evaluation to open an incident, configure confirmation and recovery to one. An unavailable private runner or external check cannot establish Healthy or a confirmed outage. Hosted scheduling latency and the SCHEDULE-002 scale/alert bounds are not established by this implementation.

Set the receipt URL and key privately, then send POST requests. The key belongs in a header, never a URL. Replace the example URL and monitor ID. Each request needs a sequence greater than every earlier accepted request for this key.

```sh
export UPTIME_HEARTBEAT_URL='https://your-uptime.example/api/heartbeats/MONITOR_ID'
# Set UPTIME_HEARTBEAT_TOKEN privately from the one-time key dialog.
curl --fail --silent --show-error --request POST "$UPTIME_HEARTBEAT_URL/start" \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $UPTIME_HEARTBEAT_TOKEN" \
  --header 'X-Heartbeat-Sequence: 1' --data '{}'
curl --fail --silent --show-error --request POST "$UPTIME_HEARTBEAT_URL/success" \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $UPTIME_HEARTBEAT_TOKEN" \
  --header 'X-Heartbeat-Sequence: 2' --data '{}'
curl --fail --silent --show-error --request POST "$UPTIME_HEARTBEAT_URL/fail/3" \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $UPTIME_HEARTBEAT_TOKEN" \
  --header 'X-Heartbeat-Sequence: 3' --data '{"output":"Backup command exited before writing its final archive"}'
```

The original `POST /api/heartbeats/MONITOR_ID` remains a success receipt. `/fail` accepts an unspecified exit code; `/fail/0` through `/fail/255` retain the supplied code. A failure atomically makes scheduled evaluation due immediately, without changing health at ingress. A completed start/success or start/fail pair retains server-time duration. A success after its deadline or maximum run duration is labelled a late run. Trigger and recovery notices retain the evaluated cause, original cause, confirmed times and downtime; notice times remain UTC.

Failure JSON takes only an `output` string. The whole request body is limited to 10 KiB, and at most 1 KiB of the sanitized output is retained. Owner literal masks, the current heartbeat key, authorization values, credential-like assignments, common API/JWT tokens, private keys and URL passwords are masked before storage. Control characters and ANSI escapes are removed. Set masks before running a job; changes do not rewrite immutable history. Do not send a complete log or rely on pattern matching to recognize arbitrary private data. A bounded excerpt accompanies failure evidence and notices.

For a real Bash command, use the supplied wrapper from the checkout root. It requires Bash, curl and Node 22 or later. Use a fresh private absolute state directory for each monitor/key, and only one host writing that directory:

```sh
export UPTIME_HEARTBEAT_STATE="$PWD/data/backup-heartbeat"
bash scripts/heartbeat/run-job.sh bash -c 'your-backup-command --your-option'
```

The wrapper sends start, runs the command, and sends success or failure with its exit code. It drains command output, retaining a bounded failure excerpt rather than printing the output. It persists the next sequence before each send and holds a directory lock across the command. It does not retry an uncertain send: a failed start prevents command execution; a failed finish is reported locally. Failure preserves the job's exit code; successful jobs whose success receipt failed return 69. After key rotation, use a new state directory. After a killed wrapper leaves `run.lock`, verify that no job is active before removing that lock. A missing finish remains visible as a missed/overlong run.

`GET /api/monitors/MONITOR_ID/heartbeat-runs` returns immutable receipt history in pages of 50, with a `nextCursor` for `?before=CURSOR`. Completed durations also appear as `jobRuns` in the monitor period report's JSON and `job_run` rows in its CSV. Reports refuse more than 10,000 receipts instead of truncating. These records travel in archives and are counted and removed by monitor erasure. Restored monitors remain paused, and run history never restores token, sequence, active-run or scheduled claim authority.

This increment supports fixed periods with explicit grace and header-authenticated POST states. Cron expressions, IANA/DST job scheduling, GET/HEAD receipts, URL capabilities and scheduler-specific generated wrappers remain unavailable.
