# Uptime operations

Uptime serves owner-only console documents and APIs from a Cloudflare Worker.
D1 stores immutable observations, scheduled slots, incident state and Base
operator sessions. A separately supervised Node runner performs target probes.
Cron runs every minute to expire abandoned leases and transient auth records.

## Run it locally

Use Node 22.20.0 and pnpm 10.12.4. From the repository root:

```sh
node scripts/rer.mjs install
node scripts/rer.mjs setup --owner-email owner@example.test --non-interactive
node scripts/rer.mjs dev
```

Use the owner's email. Setup creates one owner, preserves existing owner/data/settings and stops its temporary app. Open the printed outbox, select the newest message and follow its one-use link; no email is sent. Dev runs real Vite assets/HMR, the synthetic target and signed private runner. `node scripts/rer.mjs preview` instead builds and serves the fixed production output with the same target and runner. Control-C, `dev --stop` or `preview --stop` stops owned processes. Public commands use `scripts/rer.mjs`; `build:app` and `verify:app` are internal adapter targets. The root `rer-setup.json` owns all setup fields and generated secrets. Inspect `node scripts/rer.mjs describe --json`; `check --profile first-party` works without dependencies or credentials.

Local durable data is `.wrangler/state`, private settings are `data/local-secrets.json` (0600), CLI bookkeeping is `.rer/local` and command captures are `.seed/installer`. Secret directories are 0700. Builds exclude private settings and restore their exact bytes. Setup refuses conflicting owner/origin answers and never rotates existing credentials.

First-run completion is installation-local D1 state and is excluded from product archives with owner identity and sessions. A receiving installation completes `/setup` with its own owner. Upgrading an installation that already has monitors preserves its completed first-run status.

Stop dev or preview before data movement or reset. Export to a new private path with `node scripts/rer.mjs export --output .exports/archive.jsonl`. Import with `node scripts/rer.mjs import --input .exports/archive.jsonl --yes` into an empty installation, then run setup for the receiving owner. Base owns integrity and transfer bookkeeping; its named payload uses Uptime's complete archive and atomic inactive-restore transaction. No remote CLI transfer is declared.

`node scripts/rer.mjs reset --yes` lists and removes only `.wrangler/state`, `.rer/local`, `.seed/installer` and declared generated settings/recovery files. It refuses active dev or transfers. Source, dependencies, export files and `.rer/deploy` receipts remain. A second reset succeeds with an empty inventory; setup can then create a fresh owner.

### State recovery

Unexpected state placement or multiple databases refuse rather than move or delete data. Stop all runtimes and back up the entire data directory and exact private settings together outside the checkout before recovery. Inspect the D1 v3 subtree and permanent migration ledger; recover one complete database into an absent `.wrangler/state`. Preserve every credential byte and the existing owner. Settings require `AUTH_ORIGIN` and `UPTIME_ORIGIN` to match the saved loopback origin, with file permissions 0600. Never merge ambiguous databases or reset the only copy. Run setup with the retained owner and origin after recovery.

## Verification

`node scripts/rer.mjs verify` builds, typechecks and runs the complete product and browser checks. Install pinned Playwright Chromium with `pnpm exec playwright install --only-shell chromium`; Linux CI also requires `--with-deps`. Shared caches can use `PLAYWRIGHT_SKIP_BROWSER_GC=1` during browser installation. Test transports replace only authorized network/provider edges; no live provider request is required.

## Deploy in your own Cloudflare account

The owner-account path is `node scripts/rer.mjs deploy`. Use `deploy --environment production` to select the environment; `deploy --dry-run` validates/builds with zero provider requests. It builds with provider credentials
excluded, then provisions a Worker, D1 database, migrations and one-minute
Cron through Base deploy-kit. Supply `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, plus `OWNER_EMAIL`, `MAIL_FROM` and `SENDGRID_API_KEY`.
Hosted sign-in requires SendGrid, a verified sender and a Mail Send API key.
The production plan declares Worker `uptime-monitor-production` and database
`uptime-monitor-production-db`; Cloudflare supplies the hosted origin after
deployment. Independent `SESSION_SECRET`, `SETUP_TOKEN` and `UPTIME_RUNNER_KEY`
values are generated for a new installation or reused from the owner-only
`.rer/deploy/production-secrets.json` settings file. Keep that file private and
back it up separately from D1.

After deployment, open the hosted `/claim` address once to claim the owner, then finish the signed-in `/setup` page, which opens the console at `/app`. App documents return unfinished owners to `/setup`; signed-out visitors go to sign-in and back. Completion is durable and repeating rer setup preserves it.
Start the private runner separately on an authorized host. See [Runner and
targets](#runner-and-targets) for its exact environment and command. The deploy
path is implemented but has not been verified with a fresh Cloudflare account;
the command and a local readiness result do not establish hosted operation.

`pnpm run health` checks the owner deployment through Cloudflare and is
read-only. It does not prove that the runner is active, targets are healthy, or
mail and notifications reached a person.

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
For a fresh deployment, also provide `OWNER_EMAIL`, `MAIL_FROM`,
`SENDGRID_API_KEY`, and independent `SESSION_SECRET`, `SETUP_TOKEN` and
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
to a target origin. Never put bearer credentials in a URL.

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
one installation. Email uses the same `MAIL_FROM` and `SENDGRID_API_KEY`
configuration as operator sign-in. The Worker sends email. The private Node
runner sends signed JSON and Slack incoming webhooks when it polls the
installation. At each poll, the Worker submits queued email through SendGrid;
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

Use `node scripts/rer.mjs export --output FILE` and `node scripts/rer.mjs import --input FILE --yes` for local archive files;
hosted owners use the console export and restore actions. Imports require explicit confirmation and an empty destination.

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
cancel queued sends bound to the older version. Deletion cancels queued work
and erases all credentials. Durable history and identity remain. Concurrent
rotation/deletion uses guarded atomic transactions. A committed attempt that
already has credentials in runner memory cannot be recalled; it retains the
single-attempt/no-replay contract. Destination comparison hashes are HMACs
under the purpose-derived custody key, including upgraded historical hashes;
D1 retains no unsalted URL digest after the key-bearing upgrade.

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
