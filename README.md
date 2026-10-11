# Uptime

## Run it on your computer

Use Node exactly 22.20.0 and pnpm 10.12.4. The public source is [just-every/uptime-monitor](https://github.com/just-every/uptime-monitor). Each public release is a clean-history export. Public v0.1.1 is the security predecessor that closed the local development file-exposure issue in v0.1.0; this checkout is the v0.1.2 source.

```sh
git clone https://github.com/just-every/uptime-monitor.git uptime
cd uptime
node scripts/rer.mjs install
node scripts/rer.mjs setup --owner-email owner@example.test --owner-name "Local Owner" --non-interactive
```

Replace the example address with the owner's address. Setup builds, migrates, prepares private settings and creates the first owner, then prints `RER_SETUP_READY` and stops its temporary processes. Repeating setup preserves the owner, data and exact private settings; conflicting owner or origin answers refuse. Setup checks its generated or saved settings before opening its temporary runtime. The Worker validates configuration before handling requests or scheduled work; app, preview, deployment and runner entry points check their own configuration before serving or starting operational work. A missing or malformed value is named without printing its value; the Worker returns 503, including at `/health`, until configuration is complete. Start the foreground application:

```sh
node scripts/rer.mjs dev
```

`rer dev` opens signed in: it prints `RER_SIGNED_IN` (the owner) and `RER_OPEN`, a link that carries this checkout's private dev key in its fragment. Open `RER_OPEN` in a browser on this computer and you land signed in as the owner; a small dev badge switches to the `member` persona (a signed-in operator who is not the owner) or signs out. Never share the link: the key is what keeps the outbox and dev sign-in closed to anything that reaches this port through a proxy or tunnel, and `reset` removes the key so every earlier browser session stops working. `--as member` (or `--as signed-out`) starts as another persona, and `--login` turns dev identity off so dev prints `RER_SIGN_IN` and a key-carrying `RER_OPEN` for the outbox instead: choose the newest message and follow its one-use link (no email is sent). Uptime retains local development sign-in captures until their associated operator is erased or `rer reset --yes`; they do not expire by age or count. Previews open the outbox the same way. `RER_OPEN` is for people at this terminal; scripts use `rer dev --json` or the key header. First-run setup opens at `/setup`; choose **Finish setup** to enter the private console at `/app`. Until then, app routes return the signed-in owner there. `/` and `/docs` are the public landing and documentation. Vite provides assets and HMR alongside the bundled target and signed private runner. Control-C stops all owned processes. From another terminal, `node scripts/rer.mjs outbox` prints the outbox URL; `outbox --owner-email owner@example.test` requests a fresh message.

Use `node scripts/rer.mjs describe` for commands and flags, `node scripts/rer.mjs check --profile first-party` for the read-only contract check, and `node scripts/rer.mjs doctor` to compare your Node and pnpm with the pinned versions (run it under Node 22.20.0) and check that local state is safe. Doctor also lists every input the deployment needs (Cloudflare, the selected mail provider, `RER_DEPLOY_*` and the like) under `missingInputs`. On a local install these are expected to be missing until you deploy, so it reports `ok: false` and exits 3 even when the local app is healthy. Read the `node`, `pnpm` and `state` lines, not `ok`. The structural check works before dependency installation. Private settings are `data/local-secrets.json` (0600); durable data is `.wrangler/state`. There is no automatic credential rotation. See [OPERATIONS.md](OPERATIONS.md) for state custody and recovery.

## Verify

Run `node scripts/rer.mjs verify` for the complete product checks. Browser prerequisites are in [OPERATIONS.md](OPERATIONS.md). Sessionless public routes and assets are declared in `seed.json` and limited by client and path class; excess requests receive 429 with `Retry-After`, and unavailable counter storage returns 503. These source limits are marked estimated and not load-tested. A local passing result establishes neither hosted operation nor recipient acceptance.

## Try the bundled local monitor

After signing in, open **Runner / Archive** and note the number shown under **Authorized local endpoint ports**. The port is selected when `node scripts/rer.mjs dev` starts. In **New monitor**, enter `http://127.0.0.1:<authorized-port>/health` as the **Target URL**, leave **Request method** at `GET` and **Expected HTTP status** at `200`, and keep only **Local check 1** selected under **Checks to include**. Enter `0.1` for **Check every (minutes)**; that is a six-second interval. Set **Alert after this many failed checks** and **Recover after this many passing checks** to `1`, then choose **Save monitor**.

The new scheduled check is due when you save. The private runner polls about once a second and the console refreshes every five seconds, so leave the monitor open until its first result appears. After changing the target mode below, wait for the next scheduled result; the six-second interval is followed by runner polling and the page refresh. **RUN NOW** creates a manual check and does not change scheduled health or incident thresholds.

From the repository root in a second terminal, read the current port from the local grant once. Leave `node scripts/rer.mjs dev` running in its original terminal:

```sh
target_port="$(node --input-type=module -e 'import { readFileSync } from "node:fs"; process.stdout.write(String(JSON.parse(readFileSync(".wrangler/state/synthetic-grant.json", "utf8")).port));')"
```

Start in healthy mode and wait for a scheduled **Healthy** result:

```sh
curl --fail --silent --show-error --request POST "http://127.0.0.1:${target_port}/control" --header 'content-type: application/json' --data '{"mode":"healthy"}'
```

Switch the fixture to failing mode. `/health` now returns HTTP 503; the next scheduled result should be **Degraded**. This single local vantage has no independent agreement. Production failure alerting requires another network or an external passing canary:

```sh
curl --fail --silent --show-error --request POST "http://127.0.0.1:${target_port}/control" --header 'content-type: application/json' --data '{"mode":"failing"}'
```

Switch back to healthy mode and wait for the next scheduled result to show recovery:

```sh
curl --fail --silent --show-error --request POST "http://127.0.0.1:${target_port}/control" --header 'content-type: application/json' --data '{"mode":"healthy"}'
```

The synthetic target binds only to `127.0.0.1`. Its owner-only grant at `.wrangler/state/synthetic-grant.json` records the current process, port, allowed paths and expiry; each probe must match that grant, and the runner checks the fixture's process and response identity. `/health` is an allowed monitor path. `POST /control` is a local fixture control, not a probe target. This walkthrough demonstrates the bundled fixture only; it does not establish the health of an external service or another network vantage.

## Reset the local installation

Stop dev first, then export to a new private file under exports/ within the checkout:

```sh
node scripts/rer.mjs export --output exports/uptime.rer
node scripts/rer.mjs reset --yes --non-interactive
node scripts/rer.mjs setup --owner-email owner@example.test --non-interactive
```

Reset lists and removes only local data, generated settings, command captures and CLI bookkeeping. It retains source, dependencies, external archives and deployment receipts. A second reset succeeds with an empty inventory. Reset refuses while dev or transfer owns the installation.

## Erase an entity

In the owner console, erase a monitor, notification destination, or operator while at least one active owner remains. Monitor erasure requires typing the current monitor name. The action returns a receipt showing the entity kind, per-table counts and completion time; the receipt is retained in later product archives. Destination erasure removes the destination, its credentials, dependent notification jobs and delivery records, replay entries, and matching archive-history copies. Operator erasure revokes that operator's sessions and sign-in material. Erasing the original owner also anonymises its bootstrap reference while keeping setup permanently claimed; the receipt counts that row as anonymised. The durable audit records destructive actions, notification send attempts (including test sends), and authentication-mail sends or local development captures. Audit entries remain with opaque subject references; when an operator is erased, its earlier actor references are anonymised. The audit is included in later product archives.

Erasing an operator does not change `OWNER_EMAIL` in saved settings or the hosted Worker binding. If it named the erased operator, a surviving owner can still sign in with their own email and export from the console. Before using local `rer` commands again, stop dev and change only `OWNER_EMAIL` in `data/local-secrets.json` to an existing surviving active owner. Preserve every generated key and all other settings, then run `node scripts/rer.mjs setup --owner-email EMAIL --non-interactive` with that same email. Supplying the new email to setup without first updating the saved setting is refused. This selects an existing owner; it does not create or transfer an identity. On hosted installations, the deployment owner must update the `OWNER_EMAIL` binding separately; D1 erasure does not change provider configuration.

The last active owner cannot be erased. Use `node scripts/rer.mjs reset --yes` to replace the owner of a local installation. Replace a hosted installation by redeploying and establishing a new owner. Uptime has no R2 storage or uploads, so there are no uploaded attachments to erase. Erasure cannot change archives already downloaded, recall messages already sent to external email, webhook or Slack services, or stop a request already in progress from reaching its provider. If restoring an older offline archive after erasure, first choose **Export erasure journal** in **Runner / Archive**, then supply it with the archive. Local import uses the absolute journal path: `UPTIME_LATER_JOURNAL=/absolute/path/to/uptime-erasure-journal.json node scripts/rer.mjs import --input exports/older-uptime.rer --yes`. The old archive alone cannot identify erasures in a brand-new installation that has never received that journal; this is a limit of Base's offline transfer model.

## Put it on your own Cloudflare account

Supply the owner deployment inputs for `node scripts/rer.mjs deploy`. Hosted sign-in requires a selected Base mail adapter (Resend, SendGrid or Cloudflare), a verified sender, and its provider credentials. The review names Worker `uptime-monitor-production` and database `uptime-monitor-production-db`; Cloudflare assigns the hosted origin after deployment. It needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `OWNER_EMAIL`, `MAIL_FROM`, and the selected mail credentials (`SENDGRID_API_KEY`, or `MAIL_PROVIDER=resend` with `MAIL_PROVIDER_API_KEY`, or `MAIL_PROVIDER=cloudflare` with `CLOUDFLARE_MAIL_API_KEY` and `MAIL_ACCOUNT_ID`). The independent `SESSION_SECRET`, `SETUP_TOKEN`, and `UPTIME_RUNNER_KEY` are generated for a new installation or reused from the owner-only `.rer/deploy/production-secrets.json` settings file. Keep that file private and back it up separately from D1.

Run `node scripts/rer.mjs deploy` to build and provision the Worker, D1 database, migrations, and Cron in your account. The command reports the hosted origin. Use `SETUP_TOKEN` from `.rer/deploy/production-secrets.json` at `/claim` once to create the hosted owner, then finish `/setup`; the owner then works in the console at `/app`. A Cloudflare account deployment path is implemented, but no fresh-account hosted installation has been verified. The deploy command does not run the private probe runner for you.

On infrastructure authorized to reach your targets, load `UPTIME_CONTROL_ORIGIN` with the exact hosted HTTPS origin and `UPTIME_RUNNER_KEY` from the private deployment settings, then run:

```sh
node runners/src/private-runner.mjs
```

The runner signs its enrolment before polling and reuses its independently keyed durable runner identity after restart. Keep it under a supervisor. A healthy Worker does not establish that the runner is operating. See [ACCEPTANCE.md](ACCEPTANCE.md) for hosted acceptance requirements.

## Move your data

Use `node scripts/rer.mjs export --output exports/uptime.rer` after stopping dev. The new 0600 file is a Base integrity archive containing Uptime's product payload: definitions, observations, events, destination definitions, delivery and preserved archive history, erasure receipts, the permanent action audit and source erasure journal. On a new receiving checkout, first run `node scripts/rer.mjs setup --owner-email owner@example.test --non-interactive` to establish its owner and private settings, then run `node scripts/rer.mjs import --input exports/uptime.rer --yes` while its product data is empty. Monitors remain paused, destinations disabled and imported notifications quarantined. Installation settings, sessions, grants, runner authority, webhook and Slack URLs, and signing keys are excluded; available email addresses travel with destination definitions. Hosted CLI transfer is unsupported; the authenticated console retains its existing archive format and actions. Private settings remain a separate backup. The installation-authority and webhook/Slack-credential exclusion is an intentional archive policy whose BASE-DATA-001 owner confirmation is still pending.

## Get told when a check fails

Open **Notifications** and add an email, signed JSON webhook, or Slack incoming webhook. An enabled destination applies to every monitor in that installation. Email uses the same selected Base mail adapter and sender configuration as operator sign-in. When the private runner polls, the Worker submits queued email through the selected Base mail adapter and the runner sends signed JSON and Slack requests. Keep the runner running on infrastructure authorized to reach the configured targets so queued notifications and target checks can run.

The saved email address is visible to the signed-in owner and editable in **Edit**. Private webhook and Slack URLs are never listed again. If credentials become unavailable, edit the destination and re-enter its address or URL; a signed webhook receives a new one-time secret.

Deleting a destination erases its credentials and dependent local jobs, delivery records, replay entries and archive-history copies. A network request already started by the runner may still reach its provider. Rotating a webhook secret asks for confirmation and invalidates the old secret immediately: copy the new secret from the named dialog and update your receiver. The dialog includes collapsed verification instructions; closing clears its secret from browser memory and it cannot be retrieved. Email destinations show a warning until the installation sender is configured; use **Set up email** for the next step.

Use **Send test** to queue a test event for one destination. It does not change monitor evidence, open an incident, or recover one. “Accepted” means the provider or endpoint acknowledged the request; it does not prove that a person read it or was paged. A `500`, timeout, lost connection, or unknown response is uncertain and is never sent again automatically. Inspect the receiver before taking any manual action.

For Lamp's native alert intake, create an HMAC-SHA256 alert source in **Alerts** and use the endpoint Lamp displays. Set its timestamp header to `x-lamp-timestamp`, signature header to `x-lamp-signature`, deduplication path to `$.incidentKey`, title path to `$.title`, state path to `$.state`, and recovered value to `recovered`. These are top-level fields in Uptime's signed JSON event. Use the one-time signing secret shown when the destination is created as literal UTF-8 bytes; do not hex-decode it. Uptime sends an ISO 8601 UTC timestamp ending in `.000Z` and an unprefixed, unpadded base64url HMAC-SHA256 over the exact UTF-8 timestamp, a dot, and the exact body; Lamp checks the timestamp within five minutes. Uptime also sends Base `webhook-*` headers for Base-compatible receivers, but Lamp's native intake source authenticates with the configured `x-lamp-*` pair. A test event has `incidentKey: null` and `state: "test"`, so it is not a valid Lamp incident intake; use it to check a generic receiver, then verify Lamp with an authorized firing/recovery event.

Email, signed JSON, and Slack routing is installation-wide. Uptime does not provide per-monitor destination filters, Teams or Discord delivery, SMS, on-call paging, incident escalation, or public status communication. One runner is one network vantage, even when monitor names suggest different locations.

## Monitoring behavior

Uptime stores immutable scheduled evidence for HTTP(S), keyword, and incoming heartbeat monitors. Missing or expired evidence is **Unknown**. A successful past response does not promise current availability. Manual checks do not confirm or recover incidents. Public HTTP(S) connections validate every DNS answer and redirect hop and pin the socket while retaining the original Host and TLS identity. Request secrets stay in protected runner-local files.

HTTP monitors support status, body text, header, JSON, and latency assertions. Keyword monitors require a body text assertion. Heartbeats use owner-issued, revision-scoped tokens and increasing sequences; receipt ingestion alone cannot change target health. DNS, ping, TCP, domain-expiry, and browser checks are not implemented.

Restores require empty product data. A local CLI restore requires setup on the receiving checkout first, so its owner and private settings are in place before import. Imported definitions are paused, leases interrupted, destinations disabled, and alerts quarantined. Destination type, name, enabled setting, and available email address travel with delivery history for destinations that remain in the source data; webhook and Slack URLs, signing keys, and credentials remain with the installation. Re-enter webhook and Slack URLs, plus any email address unavailable in the archive, then deliberately enable destinations and resume monitoring before execution. Imported incidents never send notifications. Archive hashes check integrity, not trustworthy provenance.

Observation metadata has no automatic deletion. Entity erasure is a separate, explicit operator action. Target response bodies and probe-request secrets are not retained in observations; notification destination credentials remain installation-local and are omitted from portable archives. View, monitor, and archive bounds are not a storage retention policy or measured capacity claim. Network isolation, independent runner placement, operator acceptance, accessibility, hosted operation, and notification recipient acceptance each need their own evidence.

Before browser verification, install the browser matching pinned Playwright 1.60.0 with `pnpm exec playwright install --only-shell chromium` under Node 22.20.0. See [OPERATIONS.md](OPERATIONS.md) for Linux CI and shared-cache prerequisites.

See [CONTRACT.md](CONTRACT.md) for guarantees, [BASELINE.md](BASELINE.md) for shared baseline evidence, [ACCEPTANCE.md](ACCEPTANCE.md) for validation requirements, [OPERATIONS.md](OPERATIONS.md) for setup and delivery operations. `node scripts/rer.mjs verify` runs local build, type, and runtime checks; those checks alone do not establish hosted operation or recipient acceptance.

## Source and licence

Original implementation and original interface assets are licensed under [MIT](LICENSE). No competitor screenshots, captures, or proprietary assets are included. Base provenance is retained in the declared source metadata. [HANDOVER.md](HANDOVER.md) maps the maintained components.

Notification credentials are encrypted in D1 using a purpose-separated key
from the installation's existing `SESSION_SECRET`. Preserve that secret across
upgrades and restarts. Notification setup completes the key-bearing upgrade
before using stored credentials. An unavailable credential stops only its
destination from sending; monitoring and sign-in remain available. After a
session-secret rotation, sign in again and edit unavailable destinations to
re-enter their credentials. Webhook rotation cancels queued work for the old
credential. Once no send is in progress, its endpoint, signing key and ciphertext
are scrubbed and `retired_at` is set; an in-progress send keeps its credential
until its outcome is recorded. Destination erasure removes every credential
version and its dependent local delivery history. Slack uses only its private
incoming-webhook URL and has no Uptime signing secret. See the notification
custody and upgrade procedure in [OPERATIONS.md](OPERATIONS.md).

Assisted delivery artifacts and the owner editor are described in
[`scripts/delivery/README.md`](scripts/delivery/README.md). Packaging is local;
stage installation and publishing stay with the owner.

## Independent watches and runner vantages

Public v0.1.2 uses per-runner keys, immutable probe assignments, stored-evidence state and independent-vantage failure agreement. Mail is selected through Base adapters. See [the monitoring setup and C3/C4 rules](docs/resilient-monitoring.md). Public v0.1.1 does not include these.
