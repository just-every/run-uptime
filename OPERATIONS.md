# Uptime operations

Uptime serves owner-only console documents and APIs from a Cloudflare Worker.
D1 stores immutable observations, scheduled slots, incident state and Base
operator sessions. A separately supervised Node runner performs target probes.
Cron runs every minute to expire acceptance windows and transient auth records, check stale runner contact, ping the configured external heartbeat and send the weekly healthy digest.

## Run it locally

Use Node 22.20.0 and pnpm 10.12.4. From the repository root:

```sh
rer install
rer setup --owner-email owner@example.test --non-interactive
rer dev
```

Use the owner's email. Setup creates one owner, preserves existing owner/data/settings and stops its temporary app. Open the printed outbox, select the newest message and follow its one-use link; no email is sent. Dev runs real Vite assets/HMR, the synthetic target and signed private runner. `rer preview` instead builds and serves the fixed production output with the same target and runner. Control-C, `dev --stop` or `preview --stop` stops owned processes. Public commands run the pinned `@runeditrun/rer` (`rer VERB`); `build:app` and `verify:app` are internal adapter targets. The root `rer-setup.json` owns all setup fields and generated secrets. Inspect `rer describe --json`; `check --profile first-party` works without dependencies or credentials.

Local durable data is `.wrangler/state`, private settings are `data/local-secrets.json` (0600), CLI bookkeeping is `.rer/local` and command captures are `.seed/installer`. Secret directories are 0700. Builds exclude private settings and restore their exact bytes. Setup refuses conflicting owner/origin answers and never rotates existing credentials.

First-run completion is installation-local D1 state and is excluded from product archives with owner identity and sessions. A receiving installation completes `/setup` with its own owner. Upgrading an installation that already has monitors preserves its completed first-run status.

Stop dev or preview before data movement or reset. Export to a new private path with `rer export --output exports/archive.rer`. On the receiving checkout, first run `rer setup --owner-email EMAIL --non-interactive` to establish its owner and private settings, then import with `rer import --input exports/archive.rer --yes` into an empty product-data store. If local D1 already has active owners, setup requires the configured email to match one; when several are active, configure one explicitly. Base owns integrity and transfer bookkeeping; its named payload uses Uptime's complete archive and atomic inactive-restore transaction. No remote CLI transfer is declared.

`rer reset --yes` lists and removes only `.wrangler/state`, `.rer/local`, `.seed/installer` and declared generated settings/recovery files. It refuses active dev or transfers. Source, dependencies, export files and `.rer/deploy` receipts remain. A second reset succeeds with an empty inventory; setup can then create a fresh owner.

Erasing an operator does not change `OWNER_EMAIL` in saved settings or the hosted Worker binding. If it named the erased operator, a surviving owner can still sign in with their own email and export from the console. Before using local `rer` commands again, stop dev and change only `OWNER_EMAIL` in `data/local-secrets.json` to an existing surviving active owner. Preserve every generated key and all other settings, then run `rer setup --owner-email EMAIL --non-interactive` with that same email. Supplying the new email to setup without first updating the saved setting is refused. This selects an existing owner; it does not create or transfer an identity. On hosted installations, the deployment owner must update the `OWNER_EMAIL` binding separately; D1 erasure does not change provider configuration.

### State recovery

Unexpected state placement or multiple databases refuse rather than move or delete data. Stop all runtimes and back up the entire data directory and exact private settings together outside the checkout before recovery. Inspect the D1 v3 subtree and permanent migration ledger; recover one complete database into an absent `.wrangler/state`. Preserve every credential byte and the existing owner. Settings require `AUTH_ORIGIN` and `UPTIME_ORIGIN` to match the saved loopback origin, with file permissions 0600. Never merge ambiguous databases or reset the only copy. Run setup with the retained owner and origin after recovery.

## Verification

`rer verify` builds, typechecks and runs the complete product and browser checks, then serves the production build as `rer deploy` hosts it and fails if a built file would answer anything but 200 or `/health` lacks the deploy identity. Install pinned Playwright Chromium with `pnpm exec playwright install --only-shell chromium`; Linux CI also requires `--with-deps`. Shared caches can use `PLAYWRIGHT_SKIP_BROWSER_GC=1` during browser installation. Test transports replace only authorized network/provider edges; no live provider request is required.

## Deploy in your own Cloudflare account

The owner-account path is `rer deploy`. Use `deploy --environment production` to select the environment; `deploy --dry-run` validates/builds with zero provider requests. It builds with provider credentials
excluded, then provisions a Worker, D1 database, migrations and one-minute
Cron through Base deploy-kit. Supply `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, plus `OWNER_EMAIL`, `MAIL_FROM` and the selected mail
provider's credentials.
Hosted sign-in requires a configured Base mail adapter (Resend, SendGrid or Cloudflare), a verified sender and that provider's API credential.
`MAIL_PROVIDER` selects `resend`, `sendgrid` (the existing-install default when
unset) or `cloudflare`. Resend uses `MAIL_PROVIDER_API_KEY`; SendGrid uses
`SENDGRID_API_KEY`; Cloudflare Email Sending uses `CLOUDFLARE_MAIL_API_KEY` and
`MAIL_ACCOUNT_ID`. There is no automatic fallback between providers. Locally the
provider is the development outbox. Optional `UPTIME_HEARTBEAT_URL` enables the
independent heartbeat.
Cloudflare is the only owner deployment target: Uptime's `deploy.json` declares no
container platform, so the Base `--platform container`, `--host ssh://...` and
`--image` options are refused. The production plan declares Worker `uptime-monitor-production` and database
`uptime-monitor-production-db`; Cloudflare supplies the hosted origin after
deployment. Independent `SESSION_SECRET`, `SETUP_TOKEN` and `UPTIME_RUNNER_KEY`
values are generated for a new installation or reused from the owner-only
`.rer/deploy/production-secrets.json` settings file. Keep that file private and
back it up separately from D1.

After deployment, open the hosted `/claim` address once to claim the owner, then finish the signed-in `/setup` page, which opens the console at `/app`. App documents return unfinished owners to `/setup`; signed-out visitors go to sign-in and back. Completion is durable and repeating rer setup preserves it.
Start the private runner separately on an authorized host. See [Runner and
targets](#runner-and-targets) for its exact environment and command. The deploy
path was exercised end to end once on v0.1.1; the command and a local readiness
result do not establish hosted operation. A successful deploy prints the hosted
origin, Worker and environment. A failed one ends with `owner_deploy_failed`,
the stage and the deploy-kit code, keeps `.rer/deploy/<environment>.json`, and
resumes when the same command is run again. Other environments use their own
ownership record but share `.rer/deploy/production-secrets.json`. Uptime never
deletes provider resources; see `docs/deploy.md` for listing, exact-ID deletion
and absence checks.

`pnpm run health` checks the owner deployment through Cloudflare and is
read-only; `pnpm run health -- --environment NAME` checks another environment. It does not prove that the runner is active, targets are healthy, or
mail and notifications reached a person.

## Monitor definition files

`node scripts/definitions.mjs validate|preview|apply|export|batches|undo` is
the local door to the same engine as the console's Definitions view
(`/api/definitions/*`, owner session and configured origin). Stop dev and
preview first: it holds the local operation like export and import. Preview and
validate write nothing; apply needs `--digest` from the preview and refuses a
changed installation; export writes a new private file; apply and undo apply
pending local migrations first. Batches applied from the command line record
the actor as the local command. See `docs/definitions.md` and
`docs/moving-from-uptimerobot.md`.

## Artifact-controller deployment

The separate artifact route remains available for isolated CI or a reviewed
controller. Build in a credential-free ephemeral Linux job and never install or
build beside provider or mail credentials. Keep nonempty `NODE_OPTIONS` and
`NODE_PATH` out of both job environments; these boundaries reject them. The
preparation workflow creates its own home, writes its artifact outside the
checkout, and records the exact source and run identity.

`pnpm run artifact-prepare` packages clean source with `RER_PREPARE_ISOLATION`,
`RER_PREPARE_HOME`, `RER_DEPLOY_ARTIFACT`, `RER_DEPLOY_SOURCE_SHA`,
`RER_DEPLOY_RUN_ID` and `RER_DEPLOY_RUN_ATTEMPT`. The artifact path and private
home must be absent before the job starts and outside the checkout. Set the
isolation marker to `ephemeral-credential-free-job` only in that isolated
credential-free Linux job. The preparation step needs no provider credentials.

`pnpm run artifact-deploy` consumes the artifact, its SHA-256, source and run
identity, a private receipt path, `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN`, `UPTIME_WORKER_NAME` and exact HTTPS `UPTIME_ORIGIN`.
For a fresh deployment, also provide `OWNER_EMAIL`, `MAIL_FROM`, the selected
mail provider's credentials (see above; `MAIL_PROVIDER` is needed for Resend and
Cloudflare), and independent `SESSION_SECRET`, `SETUP_TOKEN` and
`UPTIME_RUNNER_KEY` values. The controller writes a private identity receipt,
checks deployment state and health, and preserves already configured opaque
secrets. `pnpm run artifact-health` is read-only and needs the same artifact
identity, receipt, account credentials, Worker name and origin; it does not
need application secret values. Use a new receipt path for a changed artifact.

The artifact controller parses the build as inert JSON and never executes it.
Its migration history and provider state are reviewed separately. A migration
that is interrupted or uncertain fails closed and requires inspection. The
edition owns migration numbering; all migrations remain additive and preserve
prior observations and authority ledgers.

## Runner and targets

Starting the runner performs signed enrolment automatically. Repeat starts receive the same installation-local identity; preserve D1 and the matching scoped key across restarts. An invalid enrolment signature is refused before registration or contact changes. Registration identifies the installation's self-runner, not exclusive possession of the key or continuous process liveness.

Set the private runner's `UPTIME_CONTROL_ORIGIN` to the exact HTTPS origin and
`UPTIME_RUNNER_KEY` to the matching scoped key, then run
`node runners/src/private-runner.mjs` under a supervisor. Control requests reject
redirects and results are timestamped and HMAC signed. The limited HTTP loopback
origin is only for local review. Probe credentials remain owner-only files in
`UPTIME_CREDENTIAL_DIR`, referenced by immutable monitor definitions and bound
to one monitor ID and a target origin. Old files require explicit binding with `runners/migrations/0001-monitor-credentials.mjs`; see docs/runner.md for the command, rotation and local erasure. Never put bearer credentials in a URL.

The Worker's clock defines every time that sets a schedule. A claim answer carries the Worker's `now`; the runner measures its own offset from the quickest of its last twenty exchanges and reports attempt starts, completions and signature timestamps in the Worker's clock, so a runner whose clock is seconds off still has its evidence accepted and its checks start at least one interval apart by the Worker's claim times. A scheduled check never starts sooner than one interval after the previous one started (after an interval change, the shorter of the old and new interval; a manual Run now never moves the floor). Because each next due time slides to the runner-reported start plus one interval, real cadence is slightly slower than configured: about 0.26 s per check at the 5 s minimum interval (5 % slower) and about 0.4 s per check at 60 s on loopback, with the runner's 1 s poll (see docs/monitors.md).

A runner needs a browser to serve a flow monitor: install the pinned Playwright Chromium on that runner (`pnpm exec playwright install chromium`). The runner reports whether it has one when it enrols; a flow assigned to a runner without one is Unknown with that reason. Each flow run is its own process with a fresh private profile folder and sanitized environment, all browser traffic goes through the runner's filtering proxy, and credentials for fill steps are owner-only files in `UPTIME_CREDENTIAL_DIR` holding `{"monitorId","origin","value"}`. `UPTIME_RUNNER_BROWSER=off` keeps a runner from running flows. See docs/runner.md and docs/limits.md for the bounds.

A database fault on a runner or console route answers 409 `conflict` (a racing writer or failed guard) or 503 `storage_unavailable` with `Retry-After` (anything else), names the failing operation, and is logged by the Worker and by the runner as one line with the operation, class, status and a sanitized cause; the runner's next poll is the retry.

Public HTTP/HTTPS targets permit ordinary query parameters. Every target and
redirect hop rechecks credentials, scheme, DNS answers and public IP ranges;
sockets pin validated addresses, TLS verifies the original hostname, cross-origin
redirects strip credentials/body, and HTTPS downgrade is forbidden. Synthetic
loopback fixtures retain their separate process identity and exact path grants.

For a heartbeat monitor, issue a key using
`POST /api/monitors/:id/heartbeat-key`. Send an empty JSON object to its returned
receipt path with `Authorization: Bearer <token>` and a strictly increasing
`X-Heartbeat-Sequence`. Keys are revision-scoped hashes. Each monitor admits at
most 60 authorized increasing receipts per 60-second window, atomically in D1;
excess requests return HTTP 429. Limits survive Worker restarts and key rotation.
Receipts do not change target health until the runner evaluates a scheduled slot.

## Notification destinations

The owner-only **Notifications** view manages destinations for every monitor in
one installation. Email uses the same `MAIL_FROM` and selected mail provider
configuration as operator sign-in. The Worker sends email. The private Node
runner sends signed JSON and Slack incoming webhooks when it polls the
installation. At each poll, the Worker submits queued email through the selected Base mail adapter;
keep the runner running for queued notifications and target checks to run.
Email, signed JSON, and Slack destinations are installation-wide, not
per-monitor routes. The **Send test** action queues a separate test event and
does not change monitor state or incident history.

Add a signed JSON destination with a public HTTPS URL and copy its displayed
signing secret when it is created. Uptime shows the secret only at creation or
rotation. The request includes Base headers `webhook-id`, `webhook-tenant`,
`webhook-destination`, `webhook-event`, `webhook-timestamp`, and
`webhook-signature`. The Base signature binds destination, event, delivery ID,
timestamp, and exact JSON body. Use the Base webhook verification contract at
the receiving service, including tenant and destination checks, freshness, and
replay protection.

For Lamp's native alert intake, create an HMAC-SHA256 source in **Alerts** and
use the endpoint Lamp displays. Configure timestamp header `x-lamp-timestamp`,
signature header `x-lamp-signature`, deduplication path `$.incidentKey`, title
path `$.title`, state path `$.state`, and recovered value `recovered`. These
paths match the top-level fields in Uptime's notification JSON. Use the
destination's displayed signing secret as literal UTF-8 bytes; do not
hex-decode it. Uptime sends an ISO 8601 UTC timestamp ending in `.000Z` and an
unprefixed, unpadded base64url HMAC-SHA256 signature over the exact UTF-8
timestamp, a dot, and the exact request body. Lamp checks the timestamp within
five minutes. Uptime also sends Base `webhook-*`
headers for Base-compatible receivers; Lamp's native intake authenticates with
its configured `x-lamp-*` pair. A test event has `incidentKey: null` and
`state: "test"`, so Lamp records it as an invalid intake. Use a controlled
firing/recovery event to verify Lamp's alert mapping.

Use an exact Slack incoming-webhook URL from Slack's `hooks.slack.com` service.
Slack message links and markup are escaped or disabled by the integration. A
test send creates a separate test notification; only real scheduled incident
transitions create trigger and recovery notifications. Maintenance suppresses
incident events, and manual checks do not create or recover them.

Each event and destination has one automatic send attempt. HTTP `500`, timeout,
connection loss, and unknown responses remain uncertain; they are never sent
again automatically. A provider's accepted response means the request was
acknowledged, not that a person read the notification. A hosted recipient test
must be explicitly authorized and scoped to its intended destination. Keep its
receipt limited to the test delivery identity, outcome, and timing; do not
retain secrets, full destination URLs, or message bodies as public evidence.
There is no Teams, Discord, SMS, on-call paging, incident escalation, or public
status delivery.

## Evidence, recovery and limits

Archives include product definitions, evidence, outbox events, notification
destination definitions and delivery history. They omit sessions, keys,
receipts, local request-credential references, runner grants, webhook and Slack
URLs, signing keys, and other installation credentials. Restore creates paused
monitor definitions and disabled destinations, interrupts outstanding leases,
and quarantines imported alerts. Re-enter destination credentials and
deliberately enable them before use; imports never replay notifications. Manual
checks do not advance scheduled incident policy. Missing, incomplete or stale
observations remain Unknown. Runner contact is authenticated receipt time, not
process health.

Use `rer export --output FILE` and `rer import --input FILE --yes` for local archive files. Run setup on the receiving checkout before import so its owner and private settings are established; product data must be empty. Hosted owners use the console export and restore actions. Imports require explicit confirmation.

The `/health` endpoint proves D1 readiness and exact deployment identity, not
runner operation, target health, provider acceptance, mailbox receipt, or a
person being notified. Confirm each intended receiver with an authorized test
and review its delivery history before relying on it.

## Notification credential custody and upgrades

`SESSION_SECRET` is an independent, randomly generated installation secret in
local `0600` credentials and an opaque Worker secret in hosted plans. Uptime
uses Base's maintained AES-GCM seal/unseal with a product-specific HMAC-derived
key (`uptime-notification-credentials`, `aes-gcm-v1`); the authenticated data
binds the format version, credential ID, destination ID and creation time.
This separates notification encryption from session and OIDC purposes. No new
provider binding is required. D1 stores encrypted endpoints (including Slack
capability URLs and email addresses) and webhook signing keys. Missing or
incorrect `SESSION_SECRET`, changed ciphertext or swapped records make the
individual destination unavailable for as long as that condition lasts. The owner sees which destination needs its
credentials entered again. Monitoring, sign-in, health, probe claims/results,
other destinations and destination deletion remain available. Slack has no
Uptime signing key or rotate action. Email addresses are visible and editable
only in the authenticated owner console; stored webhook and Slack URLs and
signing keys are never returned by destination lists.

Setup preserves identities and history. SQL cannot encrypt with a Worker
secret: the key-bearing setup step seals retained plaintext credentials and
scrubs retired versions before reporting ready.
Queued sends bound to obsolete versions are cancelled as `credential_rotated`;
unused and terminal versions are retired. A genuinely sending version remains
encrypted until its committed attempt finishes or expires, then is scrubbed.
These guarded updates are restart safe, send nothing and cannot resurrect a
retired row. Existing monitors, outbox and delivery history are preserved.
Health checks and scheduled runs never decrypt stored destination credentials;
SQL readiness alone does not establish credential availability.

A temporarily wrong, short or missing `SESSION_SECRET` (for example a secret
bound to the wrong environment on one deploy) is recoverable without re-entering
anything. While the key is missing or shorter than 32 characters, Uptime records
nothing against any destination: the console shows each destination as needing
its credentials, queued sends stay queued and nothing is rejected on that
account. A wrong key of valid length cannot be told from damaged data, so the
affected destinations are marked unavailable and queued sends bound to them are
rejected as `credential_unavailable`, but the stored encrypted credentials are
untouched. Restore the correct `SESSION_SECRET`: the next read, poll or claim
decrypts each credential, clears the mark and the destination works again with
its original address, URL and signing secret. Sends rejected while the wrong key
was in use are not replayed; use **Send test** to confirm the destination. Only
an installation that really lost its key needs the re-entry steps below.

Rotating `SESSION_SECRET` invalidates existing owner authentication state and
makes stored destination credentials unreadable. Sign in again using the
installation's configured sign-in method, open **Notifications**, and edit each
unavailable destination to re-enter its email address or webhook/Slack URL.
For a signed webhook, save and copy the new signing secret to the receiver.
The destination identity and historical deliveries remain; old queued work is
cancelled when its credential is replaced and is never replayed. Deletion also
remains available. Do not restore a compromised old key or use manual D1 SQL as
a recovery step. There is no plaintext or default-key recovery path.

Automatic local credential rotation is unavailable. Keep the settings file while D1
contains encrypted notification credentials. That operation would replace
multiple installation keys rather than perform a scoped session-secret
rotation. Hosted session-secret rotation is an explicit provider secret
operation; changing a deploy input alone does not replace an existing secret.
Back up installation settings separately from D1.

Webhook rotation and email/URL replacement create a new credential version and
cancel queued sends bound to the older version. Destination erasure removes the
destination, its credentials, dependent notification jobs, delivery attempts
and outcomes, replay entries, and matching archive-history copies. Its per-table
erasure receipt and opaque audit entry remain. Concurrent rotation/erasure uses guarded
atomic transactions. A send already committed with credentials in runner
memory cannot be recalled and retains the single-attempt/no-replay contract.
Destination comparison hashes are HMACs under the purpose-derived custody key,
including upgraded historical hashes; D1 retains no unsalted URL digest after
the key-bearing upgrade.

The private runner retains Base's durable claim recheck and 60-second claim
window. A runner at least 60 seconds ahead of the Worker skips claiming. If its
clock crosses the boundary during preparation, it returns only its own fresh,
provably unstarted claim to the queue. Reservation identity is retained for
audit; no network attempt is consumed and a correctly timed runner can send
once. A durable start marker prevents another reader, an already started claim
or an unknown legacy claim from being returned. Real Worker expiry, including
slow preparation, remains uncertain `claim_expired` and never replays.
Synchronize the runner clock. No tolerance or external transport behavior is
widened. Notification JSON, verification headers and Lamp HMAC bytes remain
unchanged.

## Assisted delivery and owner editor

See `scripts/delivery/README.md` for the pinned producer, immutable managed
workflow, exact setup-manifest digest, trusted signed-claim bindings and native
owner editor policy. `pnpm run test:admission` checks these public flows against
the emitted application; its management peer is only a test network edge.
Stage installation, live Cloudflare and the public release remain owner work.

## Independent watches and runner vantages

Public v0.1.2 uses per-runner keys, immutable probe assignments, stored-evidence state and independent-vantage failure agreement. Mail is selected through Base adapters. See [the monitoring setup and C3/C4 rules](docs/resilient-monitoring.md).
