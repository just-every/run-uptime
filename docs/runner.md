The private runner is the part of Uptime that actually visits your sites and APIs. It is a small Node process that you start yourself, on a machine you trust to reach your targets, and that you keep running. Without it the console works but no checks happen.

## Why it is separate

The Worker stores evidence and decides what it means, but it does not make the requests. Keeping the runner separate means your targets are probed from a network you choose, and credentials for those targets never need to leave it.

The runner also does the delivery work for notifications: it sends signed JSON webhooks and Slack messages when it polls. See [Notifications](/docs/notifications).

## Start it

Give the runner the exact address of your Uptime installation and the runner key, then start it.

```sh
export UPTIME_CONTROL_ORIGIN="https://your-uptime-address.example"
export UPTIME_RUNNER_KEY="the key from your private deployment settings"
node runners/src/private-runner.mjs
```

- `UPTIME_CONTROL_ORIGIN` is the exact HTTPS origin of your installation. It is required, and the runner refuses to start without it.
- `UPTIME_RUNNER_KEY` is the scoped key that matches your installation. For a hosted deployment, it is in `.rer/deploy/production-secrets.json`. See [Deploy to Cloudflare](/docs/deploy).

The runner is run from a clone of the source, so use the same checkout you installed from. `rer dev` starts a runner for you; the steps above are for a hosted installation.

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

Shared and unused files stay unbound. Setup, and each dev or preview start, reports the reference and all known monitor IDs, with a complete numbered command for each possible selection. A scheduled HTTP or browser check that encounters an unbound file stays Unknown and records the reference, its intended monitor, the known IDs from the last migration, and the exact command in **Recent checks**. The report is diagnostic only: checks never bind files. With several missing flow credentials, each check reports the first unbound reference it encounters; resolve it and the next check identifies the next one.

Review the intended monitor (its ID is in the console URL), stop the runner, then run the command for that monitor on the runner machine:

```sh
node runners/migrations/0001-monitor-credentials.mjs --directory "$UPTIME_CREDENTIAL_DIR" --reference partner-api --monitor-id MONITOR_ID
```

This adds the explicit binding atomically and prints no credential value. It refuses a file already bound to another monitor. If a file used to serve several monitors, create a separate owner-only file and reference for each, review the intended account, and bind each separately before restarting the runner. Once one of them is bound, a check of each other monitor that still names the file stays Unknown and its **Recent checks** names a new reference for that monitor (the old reference and the first eight characters of its ID), the definitions change that points the monitor at it, and the exact binding command; a copied, new or definitions-imported monitor that names a bound file gets the same step. An unused file is reported at setup; if a monitor later names it, the check reports the required binding without modifying the file. Hosted runners without the local database use the explicit per-monitor command.

Archives preserve non-secret credential references and monitor IDs; they never contain local credential files or runner authority. Restore remains paused. After reviewing the restored monitor and assigning a receiving runner, it may reuse its same-ID local file if that file was retained separately on that runner. A receiving runner without the file has no credential access. A copied, new or definitions-imported monitor receives a different ID and cannot reuse that file.

Rotation means replacing the contents of the bound file on the runner, preferably by atomically renaming a new mode-0600 file over it. The next check reads the new value. Removing the file makes subsequent checks Unknown. A check already in progress may have read the old value; stop the runner before immediate revocation. Erasing a monitor in the console does not delete files on a separate runner: remove its local credential files yourself. A new monitor has a new ID and cannot use those leftover files. Rebinding requires explicit owner review and re-entry. Keep runner credential backups separate from product archives.

## Browser flows

A [flow monitor](/docs/monitors#browser-flow) runs in a real browser, so the runner that serves it needs one. Install the pinned browser once on that machine:

```sh
pnpm exec playwright install chromium
```

At enrolment the runner starts the browser once to prove it can, and reports `"capabilities": {"browser": true|false}`; the console lists a runner without a browser as having none. A flow assigned to a runner without a browser, or to one that has `UPTIME_RUNNER_BROWSER=off` set, is Unknown with that reason; it is never a pass and never a failure.

Each flow run is isolated:

- It runs in its own process with a fresh private profile folder that is deleted afterwards, a sanitized environment (no inherited credentials, proxy settings or Node hooks) and a stricter home folder, one flow at a time. Profiles live in a folder the runner owns (owner-only, mode 0700): one per runner under `UPTIME_FLOW_DIR`, or under the system temporary folder when that is unset. A runner refuses to run flows from a folder that is a link or belongs to another user.
- The whole browser network goes through one filtering proxy inside the runner. It resolves each destination itself, connects only to the address it checked, and refuses private, loopback, link-local and metadata addresses for every page, redirect, subresource and WebSocket. A local fixture is reachable only through the same owner-only grant file the HTTP runner uses.
- The run is killed, browser and all, when its wall-clock limit passes. A run that ends any other way is still cleaned up: if the runner is killed outright, the flow's own process ends the browser and deletes the profile; if that process is killed, the runner does; and if everything stops at once (a power loss), the runner empties its flow folder, ending any browser still using it, the next time it starts.

Credentials for `fill` steps are files in the folder named by `UPTIME_CREDENTIAL_DIR`, one `<credentialRef>.json` per credential, owner-only, holding exactly `{"monitorId": "MONITOR_ID", "origin": "https://app.example.com", "value": "…"}`. The value is read on the runner, handed to the browser process over a pipe, and used only on a page whose origin matches the file's origin. It never reaches Uptime: not the database, a definitions file, an archive, an export, a log, the trace or the audit table. A missing or invalid credential makes the flow Unknown, never a failure of the target.

A flow's observation keeps a sanitized step trace (step, result, duration, the expectation it matched or missed, and the page's URL without its query string or fragment) and no screenshots or page bodies. Before anything is stored, every value of a credential the flow named is replaced with `[credential]` wherever it appears, each character as typed, lowercased or uppercased, raw or percent-encoded, once or twice (so a site that escapes only part of an address, lowercases an accented address, re-encodes an encoded path, or turns a space into '+', is covered too), and only then is a URL cut to its 300-character limit, so a site that puts your sign-in address in its URL path does not put it, or any part of it, in the trace. See [Limits](/docs/limits#browser-flows-are-small-and-bounded).

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

Public v0.1.2 uses per-runner keys, immutable probe assignments, stored-evidence state and independent-vantage failure agreement. Mail is selected through Base adapters. See [the monitoring setup and C3/C4 rules](/docs/resilient-monitoring).
