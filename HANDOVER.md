# Uptime maintenance handover

## Commands and runtime

Use the **Run it locally** section in [AGENTS.md](AGENTS.md): `rer install`, `setup --owner-email EMAIL`, `dev`, and the printed Base development outbox. The signed-in first-run page is `/setup`; completion is installation-local D1 state. `/claim` hosts the one-use token form for an unclaimed hosted installation. Setup stops its temporary runtime; dev stays in the foreground with Vite assets/HMR, the synthetic target and signed private runner. `verify` runs the complete product and browser checks. `describe --json` and `check --profile first-party` are read-only. [OPERATIONS.md](OPERATIONS.md) covers reset, data movement, deployment and recovery.

`@runeditrun/rer`, pinned in `package.json`, is the Base CLI. `scripts/installer/local.mjs` declares the shared lifecycle hooks and product targets. `rer-setup.json` is the sole setup manifest. `scripts/local` supplies the real runtime, migrations and complete product transfer. Settings remain in `data/local-secrets.json`; state is `.wrangler/state`. Existing owners, data and exact private settings survive setup. Reset is confirmed and contained. No automatic credential rotation is supported.

## Component ownership

The edition owns Start/React documents, Hono routing, monitor configuration, migrations, scheduling, incident policy, archives, notifications and operator feedback. `src/domain/policy.mjs` projects evidence and coverage; separate domain modules handle control, heartbeat, runner contact, evidence validation, notification custody/dispatch and runner RPC. `runners/src` owns real requests, destination guards, protected credential files, synthetic grants and signed claims/results.

Base supplies operator-auth, mail, integrations, owner claim, editor, deploy-kit, the CLI and lifecycle. `edition.json`, `sources.lock.json` and `base-copies.json` declare selected source and retained provenance. Refresh selected-source locks through `node scripts/edition-authoring/cli.mjs lock`; keep surviving verbatim source at its recorded pin.

## Durable requirements

Preserve immutable definitions and attempts, fixed selected-probe coverage, scheduled-only confirmation/recovery and atomic evidence/state/outbox/job writes. Missing or stale evidence stays Unknown. Contact freshness proves authenticated receipt time, not process liveness or target health. Each independently keyed runner retains its installation-local identity across restarts. Every signed attempt must satisfy its immutable revision assignment, acceptance window, probe, clocks, transport and assertion bundle.

Public HTTP targets validate every DNS answer and redirect hop, pin sockets and retain TLS identity. Runner-local credentials bind one monitor ID from the authenticated task and an exact origin; legacy files need explicit owner binding via the numbered local-file migration documented in docs/runner.md. Independent egress isolation remains an operating requirement. Synthetic fixtures require exact process/path/port grants.

Archives carry product definitions, immutable evidence, destination definitions and the notification history that remains in the source. Receiving definitions remain paused, destinations disabled, leases interrupted and alerts quarantined. Restore transformations retain original records in archive history. Sessions, runner/heartbeat authority, grants, request credentials, webhook/Slack URLs and signing keys stay installation-local. Local CLI restore requires the receiving checkout's `rer setup --owner-email EMAIL --non-interactive` before import into empty product data. If canonical local D1 already has active owners, setup requires its configured owner email to match one; with multiple active owners, configure one explicitly. Historical latency compatibility applies only to inactive restore; live results use conservative completion validation. Imported alerts never replay.

An owner can erase a monitor, destination or operator and its dependent records. Erasure leaves a per-table receipt and opaque audit entry; erasing an operator anonymizes that operator's earlier audit actor references. Destination erasure also removes dependent notification jobs, delivery attempts and outcomes, replay entries, and matching archive-history copies. Later exports carry the source erasure journal, which fences restored source records and erased-operator actor references. An older offline archive cannot show later erasures without the separately exported later journal. The last active owner cannot be erased; local reset or hosted replacement establishes a new owner.

Notifications cover installation-wide email, signed JSON and Slack. The Worker submits email through the selected Base mail adapter when the runner polls; the runner sends webhooks and Slack. Preserve the session secret while D1 contains encrypted credentials. Each event/destination has one automatic attempt; uncertain outcomes never retry automatically. Receiver acknowledgement does not prove human receipt.

## Deployment and acceptance

`rer deploy` provisions the owner-account Worker, D1 and Cron through Base deploy-kit. Hosted sign-in requires a configured Base mail adapter (Resend, SendGrid or Cloudflare); deployment settings are separate from local settings. The private runner needs its own authorized supervised host. The credential-free artifact controller remains a separate CI operation. Assisted delivery and the native owner editor use the policy in [scripts/delivery/README.md](scripts/delivery/README.md).

[CONTRACT.md](CONTRACT.md) defines product guarantees; [ACCEPTANCE.md](ACCEPTANCE.md) defines local and hosted validation. [BASELINE.md](BASELINE.md) retains baseline obligations and the pending owner decision on the BASE-DATA-001 authority/credential exclusion. Local tests do not establish a fresh-account installation, stage/public release, network placement, recipient acceptance, screen-reader behavior or full baseline satisfaction. Observation metadata has no automatic deletion; storage growth is an installation responsibility.

## Public source and releases

Uptime is developed in the public repository `just-every/run-uptime`: candidate work goes on branches and accepted work on `main`, with Verify passing on the exact commit. `RELEASE.json`, the edition identity and the generated managed descriptor agree on that destination. A release raises the version in `seed.json`, `package.json` and `RELEASE.json`, passes `rer release --repo . --project just-every/uptime-monitor --repository https://github.com/just-every/run-uptime --output ../uptime-release-preview --dry-run` and the complete publication scan with zero findings and no exceptions, and is tagged `vVERSION` on `main`. Tagging, real Cloudflare acceptance and site/platform pin activation remain owner work.

## Independent watches and runner vantages

Public v0.1.2 uses per-runner keys, immutable probe assignments, stored-evidence state and independent-vantage failure agreement. Mail is selected through Base adapters. See [the monitoring setup and C3/C4 rules](docs/resilient-monitoring.md).
