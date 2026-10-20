Public website checks run automatically in the hosted Cloudflare Worker. New public HTTP(S) and keyword monitors use the Worker by default, with a minimum interval of one minute. You do not need to keep a private runner running for those checks. The Worker validates public DNS answers and each redirect, uses Cloudflare’s public Internet fetch transport with certificate verification, and bounds response size and time; it has no private-network binding. Add a private runner when a check needs to run from a network you control, such as a private network, or needs runner-local credentials, an explicit TLS trust exception or browser execution.

## Why it is separate

A private runner is a small Node process on a machine you operate. Its checks use that machine's network vantage, and request credentials stay on that machine. The Worker stores the evidence and evaluates health. A runner being reachable does not establish that its targets are healthy.

Hosted email, signed JSON and Slack notifications are sent by the Worker without a private runner. A runner can also claim notification work when it polls. Heartbeat evaluation and website discovery require a private runner, including on hosted installations. See [Notifications](/docs/notifications).

## Start it

In the signed-in console, open **Locations** and choose **Add location**. The panel shows a complete command with this app's origin, the new runner ID, its one-time key and the startup command. Copy it; the key is shown only until you choose **Done**.

On the runner machine, use an installed Uptime source checkout with Node 22 or later. From its root, paste the command. Its shape is:

```sh
export UPTIME_CONTROL_ORIGIN='https://your-uptime-address.example'
export UPTIME_RUNNER_ID='the runner ID from the panel'
export UPTIME_RUNNER_KEY='the one-time key from the panel'
node runners/src/private-runner.mjs
```

- `UPTIME_CONTROL_ORIGIN` is the exact HTTPS origin of your Uptime app, without a path or trailing slash. The panel fills in the origin you are signed into.
- The runner ID and key authorize this runner in this installation. Never share its command or commit it to source control. **Remove** on Locations refuses its future requests.
- When the runner first reaches Uptime, the location is named after where it connects from: the city of its public address (or region or country), such as "Sydney", with "Sydney 2" for a second one there. If no place is known it keeps a short generated name. **Rename** changes it any time; a name you give is never replaced. Monitors saved afterwards carry the new name; saved revisions keep the name they were saved with.
- Give each independent network a separate runner and key. Names identify network vantages; different names alone do not make two runners independent. Older commands that set `UPTIME_NETWORK_LABEL` still work; the runner's own label is ignored.
- For the original deployment runner, `node scripts/runner-start.mjs --environment NAME` reads that environment's saved key privately. Set `UPTIME_CONTROL_ORIGIN` first; omitting `--environment` selects production. See [Deploy to Cloudflare](/docs/deploy).

`rer dev` starts a local runner for you. The manual steps above are for a separately operated runner. Local loopback review permits `http://127.0.0.1:PORT` only with `UPTIME_LOCAL_REVIEW=true`; the panel includes this setting when opened at that local origin.

## Heartbeat evaluation

Heartbeats also need the runner. The job sends receipts to Uptime, but only a completed signed scheduled evaluation turns those receipts into monitoring evidence. Keep the assigned runner polling even when every monitor is a heartbeat. See [Incoming heartbeat](/docs/monitors#incoming-heartbeat) for creation, token issuance and increasing sequences.

## Keep it under a supervisor

Run the runner under something that restarts it when it stops, such as systemd, a container restart policy or a process manager. A runner that quietly stopped looks like a quiet night, so you want to notice.

A healthy Worker does not mean the runner is operating. Uptime shows when it last heard from your runner as "contact", and that is separate from whether your targets are healthy. Contact counts as fresh for 120 seconds. If the runner stops, checks that should have run appear as Unknown rather than green.

Keep the runner's clock roughly in sync with real time, but it does not have to be exact. The Worker's clock defines every time that sets a schedule: when a check is claimed, when the next one is due, and the one-interval gap between starts. Each claim answer carries the Worker's time (`now`); the runner measures how far its own clock is from it, using the quickest of its last twenty exchanges, and reports the start and completion of every attempt, and the timestamp of every signature, in the Worker's clock. A runner whose clock is 5 seconds fast or slow therefore still has its results accepted, and its checks still start at least one interval apart by the Worker's own claim times. Enrolment is the one request made before the first measurement, so the runner's clock must be within 60 seconds of the Worker's when it first enrols. A runner that predates this behaviour and is more than a second off has its results refused; if its clock is a minute or more ahead it also skips claiming notification work, which then waits for a correctly timed runner instead of being sent twice.

## One runner, one vantage

Everything the runner checks, it checks from where the runner sits. A monitor can list up to three named probes and assign each to a separately keyed runner. Probes assigned to locations with the same name share one vantage. Different names should represent actual independent networks that the owner operates. To run more than one runner, add a location for each, so each has its own `UPTIME_RUNNER_ID` and `UPTIME_RUNNER_KEY`, as described in [Watchers and independent checks](/docs/resilient-monitoring).

## Request secrets stay with the runner

If a check needs headers, a body, Basic, bearer, Digest, OAuth 2.0, signed JWT or a client TLS certificate, put its settings in a file on the runner's machine and point the monitor at it. Files are bound to one monitor ID and the exact origin they are meant for, including scheme and any nondefault port. The runner takes the monitor ID from the authenticated claim, never from a field in the monitor definition.

- Credential files are owner-only regular files in the folder named by `UPTIME_CREDENTIAL_DIR`. Use mode `0700` for the folder and `0600` for files, owned by the runner's operating-system user. Symlinks, multiply linked files, files readable by other users and HTTP files over 64 KiB are refused.
- A monitor refers to `<credentialRef>.json` by name and never contains the secret itself. References contain 1–80 letters, digits, underscores or hyphens. Each file must contain `"monitorId"` matching that monitor's ID (shown in its console URL), plus `"origin"`. For example: `{"monitorId":"MONITOR_ID","origin":"https://app.example.com","auth":{"type":"bearer","token":"…"}}`. Replace the ellipsis locally; never paste the value into a definition file.
- The same reference and origin on another monitor do not grant access. Give each monitor its own file and reference, even when two monitors intentionally use the same account.
- A missing, empty, expired or invalid credential file leaves the check Unknown with a credential error. It does not fall back to an unauthenticated request. A target's final HTTP 401 or 403 remains its actual response, with authentication rejection identified in the check reason.
- Never put a bearer credential in a URL.

Raw credentials, acquired tokens and private keys never go into stored evidence, logs, definition exports or product archives. An origin-changing redirect permanently discards authentication, custom headers, body, client certificate and any TLS trust exception, including if a later redirect returns to the original origin. HTTPS downgrades are refused.

### HTTP credential fields

An HTTP file accepts only `monitorId`, `origin`, `headers`, `body`, `auth`, `tls`, `expiresAt` and `allowUnverifiedTls`. Unknown fields refuse the file. At least one header, body, authentication mode or client certificate must be configured. `origin` is an exact origin such as `https://app.example.com`, without a path or trailing slash. OAuth, JWT and client-certificate files require an HTTPS target origin.

| Optional field | Value |
| --- | --- |
| `headers` | Object with at most 30 header names and string values, each at most 4,096 characters. Names are case-insensitive; duplicates and transport-owned headers such as Host, Connection, Content-Length, Accept-Encoding and proxy authorization are refused. |
| `body` | String of at most 16 KiB. A body cannot accompany GET or HEAD. |
| `expiresAt` | Positive integer Unix timestamp in **milliseconds**. At or after this instant the file cannot authorize a check. Omit it for no file-level expiry. |
| `allowUnverifiedTls` | Boolean, default `false`. A separate local-owner grant permitting this file's credentials to use the monitor's configured TLS trust exception. It does not configure an exception itself. |
| `auth` | Exactly one of the closed schemas below. Do not also supply an Authorization header. |
| `tls` | Client-certificate settings described below; may accompany an `auth` mode. |

The `auth` object accepts exactly the fields listed for its mode, plus the stated optional fields:

| Mode | Required fields | Optional fields |
| --- | --- | --- |
| Basic | `type: "basic"`, `username`, `password` | None |
| Bearer | `type: "bearer"`, `token` | None |
| Digest | `type: "digest"`, `username`, `password`, `realm` | None |
| OAuth client credentials | `type: "oauth2"`, `grant: "client_credentials"`, `tokenUrl`, `clientId`, `clientSecret`, `clientAuthentication` | `scope` |
| OAuth refresh token | `type: "oauth2"`, `grant: "refresh_token"`, `tokenUrl`, `clientId`, `clientSecret`, `clientAuthentication`, `refreshToken` | `scope` |
| Signed JWT | `type: "jwt"`, `algorithm`, `key`, `issuer`, `subject`, `audience`, `lifetimeSeconds` | `keyId`, `claims` |

The listed authentication fields are strings except `scope`, the array form of `audience`, integer `lifetimeSeconds` and object `claims`. Bearer tokens and passwords are limited to 4 KiB, usernames and Digest realms to 1 KiB. Basic permits an empty username or password; Digest requires a nonempty username and realm. These ordinary text credentials refuse control characters.

Basic and Digest use the supplied username and password; a Basic username cannot contain a colon. Digest requires the exact expected realm. It supports MD5, SHA-256 and SHA-512-256, their `-sess` variants, and `auth` or `auth-int` quality of protection. The runner first receives a challenge, then sends the response for the actual method, path/query and body. A stale nonce permits one additional challenge response. Unsupported or mismatched challenges refuse authentication; there is no Basic fallback. These exchanges share the check's timeout and claim deadline.

JWT `algorithm` is `HS256`, `RS256` or `ES256`. `key`, limited to 16 KiB, is the literal signing secret for HS256 (at least 32 UTF-8 bytes), an unencrypted RSA private-key PEM of at least 2,048 bits for RS256, or a P-256 private-key PEM for ES256. `audience` is a nonempty string or an array of up to 16 nonempty strings. Issuer, subject and each audience value are limited to 1 KiB; optional `keyId` is limited to 128 bytes. `lifetimeSeconds` is an integer from 1 to 3,600. Each preparation generates fresh `iat`, `exp` and `jti`; the runner sets `iss`, `sub` and `aud` from the required fields. Custom `claims` is a JSON object of at most 4 KiB, with a depth limit of four, at most 32 fields per object and 16 elements per array. Claim strings are limited to 1,024 characters and object keys to 80 bytes. Reserved names `iss`, `sub`, `aud`, `iat`, `nbf`, `exp`, `jti`, `__proto__`, `constructor` and `prototype` are refused within custom claims. A rendered JWT authorization value over 16 KiB is refused.

Browser fill files keep their separate shape: exactly `monitorId`, `origin` and `value`, with a nonempty value of at most 1,024 characters. Their existing 4 KiB file bound excludes the added monitor-binding bytes. HTTP authentication settings do not turn a browser fill file into an HTTP credential.

### OAuth endpoint authority and durable refresh

`tokenUrl` is the full canonical public HTTPS URL the owner authorizes to receive the OAuth client credentials, such as `https://id.example.com/token`. It may differ from the monitored origin; that does not authorize the client credentials anywhere else. The URL is limited to 2,048 characters and cannot contain credentials, whitespace or a fragment. Nonempty `clientId` and `clientSecret` are limited to 1 KiB and 4 KiB respectively; `refreshToken` is limited to 8 KiB. `clientAuthentication` is exactly `"basic"` or `"body"`. The former sends percent-encoded client ID and secret through HTTP Basic; the latter sends them as form fields. Optional `scope` is an array of up to 32 distinct, nonempty OAuth scope strings, each at most 256 characters of visible ASCII excluding quotes and backslashes, without whitespace. Only the two declared grants above are supported; an interactive authorization-code sign-in flow is not performed by the runner.

The token request is a bounded form-encoded POST. The runner validates all public DNS answers, pins the connection and verifies the token server's normal TLS certificate. It follows no token-endpoint redirects and never applies the monitored target's trust exception or client certificate to that endpoint. The token server receives the grant, client credentials, requested scopes and, for the refresh grant, the refresh token. The response must be HTTP 200 with a Bearer `access_token` and integer `expires_in` from 1 to 86,400 seconds; its body is limited to 16 KiB. Access and refresh tokens are each limited to 8 KiB. A malformed response, token-endpoint failure or local-state failure is a credential error, never evidence that the application passed.

Access tokens and any rotated refresh token are persisted before the access token is used, in mode-0600 files under the owner-only `.uptime-auth` subdirectory of `UPTIME_CREDENTIAL_DIR`. State is keyed by credential reference, monitor ID, origin and the exact credential-file content digest. The owner configuration is never overwritten. Normal restarts reuse the stored token until expiry and retain the latest refresh token. An explicit `invalid_token` response permits one forced acquisition or refresh within the same check deadline; there is no unbounded retry loop.

Refresh operations are serialized within a runner and protected by an exclusive local lock against another process. A competing process refuses the credential while the lock is held. Before a refresh-token request starts, the lock is marked uncertain; only successfully persisting the returned tokens clears that uncertainty. A failed, aborted, redirected or lost refresh response, including an HTTP error, leaves the lock in place. A killed process also leaves its lock. The runner does not automatically replay the refresh, because the provider may already have rotated the token. A handled client-credentials acquisition failure does not retain an uncertain refresh lock.

Do not delete a lock to force another exchange. Stop all affected runners, reconcile the provider's credentials and local state, revoke old provider authority and reauthorize the bound file with fresh provider credentials when the outcome is uncertain. Changed file content selects a new state identity. Retire obsolete state and locks only after all runners using that credential directory have stopped and no in-flight operation can use them. Malformed state is refused, not replaced with the older token from the configuration. Keep this state private and outside product archives.

### Client TLS certificates

The optional `tls` object accepts exactly `clientCertificatePem` and `clientPrivateKeyPem`, plus optional string `passphrase` of at most 4 KiB for an encrypted private key. Both PEM values are strings of at most 32 KiB within the complete 64 KiB HTTP file. The certificate value may contain a chain of up to eight certificates. The runner checks their validity dates and that the leaf certificate matches the private key; RSA client keys require at least 2,048 bits. The certificate chain and proof of key possession reach the authorized target during TLS; the private key stays on the runner. A client certificate can accompany any `auth` mode.

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

Revoke OAuth grants, signing keys or client certificates at their provider as well when they must cease working outside Uptime. Replacing an OAuth file does not revoke an access token already issued by its provider. Expired files, invalid client certificates and missing private keys stay Unknown; none are sent as an unauthenticated substitute.

## Explicit TLS trust for legacy targets

Default HTTPS checks verify the normal certificate chain, host name and validity. For a public HTTP or keyword monitor using HTTPS, the editor/API and definition files can save one `tlsTrust` policy. These modes require an assigned private runner; the hosted Worker does not execute trust exceptions. Public-address checks and numeric socket pinning still apply, so a private CA does not itself authorize a private-network destination.

| `tlsTrust` object | Meaning |
| --- | --- |
| `{"mode":"fingerprint","sha256":"…"}` | Pin the leaf certificate's SHA-256 fingerprint. Supply 64 hexadecimal digits, optionally colon-separated; saved output is lowercase without colons. This is the preferred exception for a known self-signed or legacy leaf. A changed certificate fails until the owner reviews and saves its new fingerprint. |
| `{"mode":"ca","certificate":"…"}` | Trust one buyer-supplied CA certificate in PEM form, at most 16 KiB. The application connection must verify with that CA and match the original hostname. The diagnostic and application connections must observe the same leaf certificate. |
| `{"mode":"ignore","acknowledged":true}` | Explicitly acknowledge the warning and ignore certificate verification errors for the initial HTTPS origin. This is broader than pinning and requires owner review. |

Replace ellipses with the public certificate material; client certificates and private keys belong only in the local credential file. Omit `tlsTrust` to restore default verification. A policy is part of the immutable monitor revision, is labelled in the console and travels in definition exports and inactive archives. It does not change a separate TLS certificate monitor's truthful results.

Each retained TLS fact records the origin, mode, observed leaf SHA-256, bounded certificate-error codes, whether errors were bypassed and whether credentials were allowed. Facts accompany the runner's signed result and are validated against the slot's saved definition. A signature identifies the runner key holder; it does not independently prove the observation. A pin mismatch never becomes a bypassed success.

Any named request credential, including a client certificate, needs **both** the reviewed monitor policy and `"allowUnverifiedTls": true` in its own monitor-bound local file before it can use a configured exception. Saving a fingerprint, CA or ignore policy grants no credential authority by itself. The runner refuses the credential-bearing connection without this separate grant. An origin change permanently removes both the exception and all request credentials; returning to the original origin does not restore them. OAuth token endpoints always keep normal verified TLS.

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


## Private network grants

A private location uses an enrolled Node runner inside your network, with outbound access to Uptime. Update and restart the runner first: **Locations** shows when it was last seen; its version, private-network support and current check capacity are in `GET /api/runners`. Contact means the control plane heard from the runner; it does not prove target health. You can run it beside an existing agent without giving Uptime that agent’s credentials.

Start the runner with `UPTIME_PRIVATE_GRANT_DIR` set to an absolute, real directory you own, with permissions `0700`. Keep it outside your checkout. Grant files must be regular files you own, mode `0600`, with no symlinks or hard links. No grant is inferred from a network label or from enrollment.

In **New monitor**, choose **Private network on an authorized runner** and a grant reference such as `warehouse-local`. Save the monitor to obtain its ID and assigned runner ID. Coverage stays Unknown until its matching grant exists. On that runner, create `warehouse-local.json` in the protected grant directory:

```json
{
  "runnerId": "self-11111111-1111-4111-8111-111111111111",
  "monitorId": "replace-with-this-monitor-id",
  "hosts": ["checkout.internal.example"],
  "cidrs": ["10.24.3.10/32"],
  "ports": [8080],
  "expiresAt": 1793404800000
}
```

Replace both IDs, the exact service hostname, its private CIDR, its port and the UTC expiry in epoch milliseconds. Every dimension must match. Use narrow CIDRs and short expiry. All DNS answers must be authorized before any socket opens; a mixed answer refuses the check. Grant only services you own or are authorized to test.

HTTP, keyword and TCP checks use the console form. A private browser flow uses a version 5 definition with `"network":"private"` and `"privateGrantRef":"warehouse-local"`; its preview names the scope and local reference. Every browser origin and dependency needs a matching host, CIDR and port in that monitor’s grant. Each request and redirect re-reads the protected file. Public checks cannot borrow private grants. Loopback, link-local, metadata, known management services and management ports remain forbidden even with a grant.

To revoke permission, remove the grant file or let it expire. To revoke the runner, choose **Revoke runner**: later control-plane requests refuse. Lost permission, missing files and unavailable capacity stay Unknown; they never become a passing check or fabricated recovery. Work already in progress may finish its current connection. Grant references travel with definitions and inactive archives; grant files, runner keys and request credentials remain local. A receiving installation must authorize its own runner and grant before deliberately resuming checks. Remove the old local file when retiring its monitor.
