Public website checks run automatically in the hosted Cloudflare Worker. New public HTTP(S) and keyword monitors use the Worker by default, with a minimum interval of one minute. You do not need to keep a private runner running for those checks. The Worker validates public DNS answers and each redirect, uses Cloudflare’s public Internet fetch transport with certificate verification, and bounds response size and time; it has no private-network binding. Add a private runner when a check needs to run from a network you control, such as a private network, or needs runner-local credentials or browser execution.

## Why it is separate

A private runner is a small Node process on a machine you operate. Its checks use that machine's network vantage, and request credentials stay on that machine. The Worker stores the evidence and evaluates health. A runner being reachable does not establish that its targets are healthy.

Hosted email, signed JSON and Slack notifications are sent by the Worker without a private runner. A runner can also claim notification work when it polls. Heartbeat evaluation and website discovery require a private runner, including on hosted installations. See [Notifications](/docs/notifications).

## Start it

In the signed-in console, open **Runner / Archive**, enter an **Independent network label**, and choose **Add runner**. The dialog shows a complete command with this app's origin, the new runner ID, its one-time key, the network label and the startup command. Save it privately before closing the dialog.

On the runner machine, use an installed Uptime source checkout with Node 22 or later. From its root, paste the command from the dialog. Its shape is:

```sh
export UPTIME_CONTROL_ORIGIN='https://your-uptime-address.example'
export UPTIME_RUNNER_ID='the runner ID from the dialog'
export UPTIME_RUNNER_KEY='the one-time key from the dialog'
export UPTIME_NETWORK_LABEL='your independent network label'
node runners/src/private-runner.mjs
```

- `UPTIME_CONTROL_ORIGIN` is the exact HTTPS origin of your Uptime app, without a path or trailing slash. The dialog fills in the origin you are signed into.
- The runner ID and key authorize this runner in this installation. Never share its command or commit it to source control. Revoking the runner in the console refuses its future requests.
- Give each independent network a separate runner and key. Labels identify network vantages; different labels alone do not make two runners independent.
- For the original deployment runner, `node scripts/runner-start.mjs --environment NAME` reads that environment's saved key privately. Set `UPTIME_CONTROL_ORIGIN` first; omitting `--environment` selects production. See [Deploy to Cloudflare](/docs/deploy).

`rer dev` starts a local runner for you. The manual steps above are for a separately operated runner. Local loopback review permits `http://127.0.0.1:PORT` only with `UPTIME_LOCAL_REVIEW=true`; the dialog includes this setting when opened at that local origin.

## Heartbeat evaluation

Heartbeats also need the runner. The job sends receipts to Uptime, but only a completed signed scheduled evaluation turns those receipts into monitoring evidence. Keep the assigned runner polling even when every monitor is a heartbeat. See [Incoming heartbeat](/docs/monitors#incoming-heartbeat) for creation, token issuance and increasing sequences.

## Keep it under a supervisor

Run the runner under something that restarts it when it stops, such as systemd, a container restart policy or a process manager. A runner that quietly stopped looks like a quiet night, so you want to notice.

A healthy Worker does not mean the runner is operating. Uptime shows when it last heard from your runner as "contact", and that is separate from whether your targets are healthy. Contact counts as fresh for 120 seconds. If the runner stops, checks that should have run appear as Unknown rather than green.

Keep the runner's clock roughly in sync with real time, but it does not have to be exact. The Worker's clock defines every time that sets a schedule: when a check is claimed, when the next one is due, and the one-interval gap between starts. Each claim answer carries the Worker's time (`now`); the runner measures how far its own clock is from it, using the quickest of its last twenty exchanges, and reports the start and completion of every attempt, and the timestamp of every signature, in the Worker's clock. A runner whose clock is 5 seconds fast or slow therefore still has its results accepted, and its checks still start at least one interval apart by the Worker's own claim times. Enrolment is the one request made before the first measurement, so the runner's clock must be within 60 seconds of the Worker's when it first enrols. A runner that predates this behaviour and is more than a second off has its results refused; if its clock is a minute or more ahead it also skips claiming notification work, which then waits for a correctly timed runner instead of being sent twice.

## One runner, one vantage

Everything the runner checks, it checks from where the runner sits. A monitor can list up to three named probes and assign each to a separately keyed runner. Probes assigned to runners with the same network label share one vantage. Different labels should represent actual independent networks that the owner operates. To run more than one runner, give each its own `UPTIME_RUNNER_ID`, `UPTIME_RUNNER_KEY` and `UPTIME_NETWORK_LABEL`, as described in [Watchers and independent checks](/docs/resilient-monitoring).

## Request secrets stay with the runner

If a check needs a header, a body or a bearer or basic credential, put it in a file on the runner's machine and point the monitor at it. Those files are read only by the runner, and are bound to one monitor ID and the exact origin they are meant for. The runner takes that ID from the authenticated claim, never from a field in the monitor definition.

- Credential files are owner-only regular files in the folder named by `UPTIME_CREDENTIAL_DIR`.
- A monitor refers to `<credentialRef>.json` by name and never contains the secret itself. Each file must contain `"monitorId"` matching that monitor's ID (shown in its console URL), plus `"origin"`. An HTTP file can also contain `"headers"`, `"body"` and `"auth"`. For example: `{"monitorId":"MONITOR_ID","origin":"https://app.example.com","auth":{"type":"bearer","token":"…"}}`.
- The same reference and origin on another monitor do not grant access. Give each monitor its own file and reference, even when two monitors intentionally use the same account.
- If a reference is missing or invalid, the check fails with a runner error. It does not fall back to an unauthenticated request.
- Never put a bearer credential in a URL.

Raw secrets and response bodies never go into stored evidence or archives.

### Bind existing files after upgrading

When upgrading a local installation, stop the runner and run `rer setup` with `UPTIME_CREDENTIAL_DIR` set to its existing credential folder. Numbered migration 0001 reads current local monitor definitions, including paused monitors. A valid unbound file referenced by exactly one distinct monitor is bound to that monitor automatically, keeping every existing field and its exact file mode. This happens once: setup then records `.monitor-credential-upgrade.json` in the credential folder, and every later setup, `rer dev` or `rer preview` start only reports unbound files. Repeating setup or the migration preserves existing bindings; it never silently binds or rebinds a file.

You can rerun the report from the checkout root:

```sh
node runners/migrations/0001-monitor-credentials.mjs --directory "$UPTIME_CREDENTIAL_DIR" --persist-to .wrangler/state
```

Shared and unused files stay unbound. Setup, and each dev or preview start, reports the reference and all known monitor IDs, with a complete numbered command for each possible selection. A scheduled check that encounters an unbound file stays Unknown and records the reference, its intended monitor, the known IDs from the last migration, and the exact command in **Recent checks**. The report is diagnostic only: checks never bind files.

Review the intended monitor (its ID is in the console URL), stop the runner, then run the command for that monitor on the runner machine:

```sh
node runners/migrations/0001-monitor-credentials.mjs --directory "$UPTIME_CREDENTIAL_DIR" --reference partner-api --monitor-id MONITOR_ID
```

This adds the explicit binding atomically and prints no credential value. It refuses a file already bound to another monitor. If a file used to serve several monitors, create a separate owner-only file and reference for each, review the intended account, and bind each separately before restarting the runner. Once one of them is bound, a check of each other monitor that still names the file stays Unknown and its **Recent checks** names a new reference for that monitor (the old reference and the first eight characters of its ID), the definitions change that points the monitor at it, and the exact binding command; a copied, new or definitions-imported monitor that names a bound file gets the same step. An unused file is reported at setup; if a monitor later names it, the check reports the required binding without modifying the file. Hosted runners without the local database use the explicit per-monitor command.

Archives preserve non-secret credential references and monitor IDs; they never contain local credential files or runner authority. Restore remains paused. After reviewing the restored monitor and assigning a receiving runner, it may reuse its same-ID local file if that file was retained separately on that runner. A receiving runner without the file has no credential access. A copied, new or definitions-imported monitor receives a different ID and cannot reuse that file.

Rotation means replacing the contents of the bound file on the runner, preferably by atomically renaming a new mode-0600 file over it. The next check reads the new value. Removing the file makes subsequent checks Unknown. A check already in progress may have read the old value; stop the runner before immediate revocation. Erasing a monitor in the console does not delete files on a separate runner: remove its local credential files yourself. A new monitor has a new ID and cannot use those leftover files. Rebinding requires explicit owner review and re-entry. Keep runner credential backups separate from product archives.

## Signed results

The runner signs its enrolment before it polls, and keeps its own durable identity across restarts. It identifies itself with its key on every request, including when it claims checks and notification work. Results carry more: each one is also timestamped and signed with the key, and the Worker accepts only results that match an exact check it handed out. The runner refuses redirects when talking to the Worker, and only a local review setup may use plain HTTP loopback.

A signature shows that the holder of the runner key sent the result. It does not prove the runner was uncompromised, so protect the key like any other secret.

### The protocol

Every request is a `POST` with a JSON body and the header `x-runner-key: <runner key>`. After enrolment, the runner also sends `x-runner-id: <runner ID>`.

| Step | Path | Body | Signed |
| --- | --- | --- | --- |
| Enrol | `/api/runner/enroll` | `{"version": 1}`, optionally with `"networkLabel"` and `"capabilities": {"browser": true}` | Yes, over `TIMESTAMP.runner-enrolment.BODY` |
| Claim a check | `/api/runner/claim` | `{}` | No |
| Send results | `/api/runner/results` | `{"slotId": "...", "attempts": [...]}` | Yes, over `TIMESTAMP.BODY` |
| Notification work | `/api/runner/notifications` | `{"operation": "poll"}` and the named follow-up operations | No |

A signed request adds `x-sent-at`, the current time in milliseconds, and `x-runner-signature`, the hex HMAC-SHA256 of the text shown, keyed with the runner key. `BODY` is the exact bytes sent. Enrolment returns the `runnerId` to use as `x-runner-id`. A claim returns `{"task": ..., "now": MS}` or `{"task": null, "now": MS}`, where `now` is the Worker's clock; results must name a check the runner currently holds and arrive inside its acceptance window.

To check that the Worker rejects a forged result, take a real result for a check your runner currently holds, change only one character of its signature and send it: the Worker answers 403 `Invalid signed result` and stores nothing. Sending the same body with its correct signature is then accepted, and the monitor's history shows one result for that check. Do this against a check that is in flight; an old or invented check is refused for other reasons.

When the Worker meets a database fault it names the operation that failed. A racing writer or a failed guard answers 409 with `"code": "conflict"` (nothing was saved; the installation changed while the request ran). Any other D1 fault (overload, reset, timeout, a lost connection, a lock, a missing migration) answers 503 with `"code": "storage_unavailable"` and a `Retry-After` header. Both carry `"class"` (`guard_conflict`, `constraint`, `transient`, `schema` or `other`), the sanitized `"cause"` (the database's own first line with quoted values and long numbers removed) and the `"operation"`, such as `notifications.poll.recordContact`, `notifications.mail.claim`, `runner.claim.contact`, `runner.results` or `publicRateLimit.count`. The Worker logs one JSON line, `{"event":"storage_error","method","route","operation","class","status","cause"}`, and the runner logs the same fields: `Runner notification operation failed (Control-plane response 503 storage_unavailable (transient) in notifications.poll.recordContact: <cause> for /api/runner/notifications); the next poll retries it.` No secret, URL credential or payload appears in either. The runner does not retry in a loop: its next poll is the retry, and a notification the failed poll was preparing is still queued for it.

## Next

Add a [monitor](/docs/monitors) and watch its first checks arrive.

## Independent watches and runner vantages

Since v0.1.2, Uptime uses per-runner keys, immutable probe assignments, stored-evidence state and independent-vantage failure agreement. Mail is selected through Base adapters. See [the monitoring setup and C3/C4 rules](/docs/resilient-monitoring).
