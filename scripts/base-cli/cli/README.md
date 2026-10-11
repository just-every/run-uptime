# Portable command sources

`bin/rer.mjs` dispatches `cli/main.mjs`. Parsing/contract declarations, project
resolution, output/exits, shared lifecycle orchestration, local state/reset,
transfers, independent argv and diagnostics are separate modules. `dev-identity.mjs`
holds the per-checkout dev key (`.rer/local/dev-key.env`), the `RER_OPEN` URL,
the managed-installation refusal and the build-output dev-layer scan. Release retains
its own compatibility parser and producer and does not use the generic executor.

The browser installer that `rer install` opens, and Base's sign-in confirmation and
`/setup` frames, wear the seed's declared theme (`public/rer-theme.css`); the
contract and token table are under "Seed theme" in `onboarding/README.md`.

`node scripts/export-cli.mjs SEED_ROOT` copies the deterministic `sourceRoots`
in `cli/export.mjs`, preserving their relative topology under
`scripts/base-cli/`. `inventory.json` lists every source and SHA-256. Python
publication tooling and its data are included for release. The thin seed
`scripts/rer.mjs` dispatches that copy. `cli/shared.mjs` is the sole relocation
boundary and imports the existing `scripts/base-onboarding/`; no second onboarding
tree or neighboring checkout is used. The foundation composition maps copy these
same sources from an explicit committed Base revision and record their provenance.

`node scripts/export-reference.mjs NEW_PATH` creates a standalone copy of the
reference with runtime imports relocated into its own source tree and an explicit
transformation inventory. It preserves source/tool pins and the real app; it does
not substitute an application fixture. Frozen dependency installation occurs
separately. Refresh copied sources with the export tools after shared edits.

Every first-party seed declares `commandAdapter` alongside its installer hooks.
`localInstaller.run` supplies shared setup lifecycle behavior; the RER command
path propagates failures as nonzero exits. Setup and the seed's configured local
workflow use `onboarding/commands.mjs`, local locks/recovery and the same
owner/sign-in hooks. The reference hook declaration is
`onboarding/operator-installer.mjs`. Seeds own answers, real migrations,
internal build/dev/verify targets and deployment policy. The CLI owns flags,
pins, containment, cancellation, capture, output and sequencing.

Successful terminal setup saves declared nonsecret installer answers in owned
0600 storage under `.seed/installer`. A non-interactive repeat reuses those
answers, with explicit flags or an answers file taking precedence. Runtime
bindings remain separate: a local mail transport need not be a hosted setup
choice. Retained settings still determine secret readiness and owner conflicts;
setup never rebinds an existing owner. A newly required unanswered field causes
exit 3 with its manifest name and accepted input shape. Reset clears the saved
answers with the rest of the local installer state.
For older installations without an answer record, a runtime selection outside
the installer field's choices cannot replace an adapter-declared local choice.
Explicit answers and recorded installer choices still undergo strict validation.

Local `export --output FILE` and `import --input FILE --yes` use the Base
portability implementation through the shared command runner and real Wrangler
bindings. Seed adapters declare their database, buckets and archive policy.
Export writes a new 0600 archive and reports its verified content hash, resource
counts, exclusions and configuration names. Import applies migrations, verifies
the archive and restores atomically into an empty destination. Stop dev or
preview before either operation. Reset preserves exports. Remote transfer is
available only when the adapter declares complete resource coverage; an
unsupported target exits 4.

Local D1 transfer includes SQLite VIRTUAL and STORED generated columns. Archives
retain their schema and carry only writable base cells; native expressions and
indexes in the migrated destination recompute on restore. The public runner's
generated-column journey compares every visible SQL cell as well as the archived
base rows across a fresh installation. Ordinary-table archives from before this
support remain compatible with the same schema.

Every first-party seed verifies local export/import/export equivalence across
all supported resources. The technical foundation currently has no product
domain or background jobs; default-seed includes its durable jobs and schedule
records while excluding transient queue delivery attempts. Owner/auth, local
outbox, transfer bookkeeping and private settings are excluded. Restore does
not re-dispatch jobs. Run setup after restore to establish a fresh owner and
local configuration. A new binding or product effect needs an explicit policy
and integrated proof.

Setup reads the declared `rer-setup.json` with the shared reader and validates
answers against the shared manifest model. The manifest owns fields and managed
secret generation. `--owner-email` maps to its owner-claim email field; private
`--answers` uses declared field names. Existing owner, settings and data are kept.
The owner name is prompted or defaulted only when the installer model declares
the adapter's name field (normally `displayName`). Nameless installers proceed
without it and refuse `--owner-name`.

Run `node --test --test-concurrency=2 cli/*.test.mjs` from Base. Base's shared tests
stay in Base; exported seeds carry runtime source and their own adopting tests.

## Managed local serving

Choose `pnpm run preview` for a fixed production build and `pnpm run dev` for
source editing with Vite HMR. Preview fingerprints actual source, configuration,
lockfiles, tool versions and output bytes in a nonsecret `.rer/local` receipt;
changed or incomplete output is rebuilt. Changes made while serving do not
rebuild preview. A build that regenerates its own files declares them as
`generatedOutputs` on the command adapter (see the seed command contract); those
paths are not inputs, while any other file touched during the build is refused by name. Both use the same `.wrangler/state`, saved owner and ordinary
fresh sign-in through the development outbox. Stop before changing modes.
Stop dev or preview before build, verification or data transfer; use the
documented `--stop` flag or Ctrl-C.

The shared public dev/preview proxy gives font bytes a real browser cache
lifetime so dev stylesheet replacement does not revalidate them on every page
load. Package fonts and content-hashed URLs are public and immutable for a year;
unhashed source fonts are public and fresh for an hour. Other response headers
are preserved, including CSS/JavaScript font imports and error responses. After
editing a font, hard reload the browser to fetch the changed bytes. Preview
continues to serve its fixed build; stop and restart it to rebuild edited source.
Existing seeds receive this policy by refreshing `scripts/base-cli/` with
`node scripts/export-cli.mjs SEED_ROOT` from Base (which also refreshes its paired
onboarding copy). For production, adopt the persistent root-head stylesheet,
primary preload and matched fallback described in `export/UI-CONVENTIONS.md`.

Both are managed foreground servers; their first invocation stays active while
serving. A compatible repeated invocation verifies the registered application,
prints its safe ready/outbox URLs and exits without a new build or sign-in.
Explicit conflicting host, port or timeout, or the other mode, refuses with
exit 4 and the correct stop command. `--stop` is idempotent;
start-only flags cannot accompany it. It requires no setup or tool versions.

### Scheduled triggers under dev

`rer dev` runs the Cron Triggers a project declares (`triggers.crons` in
`wrangler.jsonc` or `wrangler.json`) on their schedule, so alert evaluation,
retries and checks work on the owner's computer as they do deployed. Each
minute the CLI calls the local runtime's scheduled test endpoint
(`/cdn-cgi/handler/scheduled?cron=EXPRESSION`) for every trigger whose
expression matches, in UTC, and prints one line per run:
`RER_SCHEDULED 2026-10-10T18:32:00Z "* * * * *" ok 7ms` (or `failed (HTTP 500) ...`;
`--json` emits a `scheduled` event with `cron`, `ok`, `status`, `ms`). A run that
is still going when its next minute arrives is reported as skipped. The grammar
is the one the deploy kit accepts: five numeric fields with lists, ranges and
steps, day of week 1 (Sunday) to 7; anything else refuses `dev` at start by
name. Runs go straight to the runtime, so they do not count as activity for the
idle timeout, and they stop with `dev` (explicit stop, idle timeout, Ctrl-C or
an application exit). `preview` does not run schedules. A seed that does not
want this declares one adapter option: `commandAdapter(lifecycle, { scheduled: false, ... })`.

### The CLI's own sign-in requests

`setup` and every `dev` start ask the local application for one ordinary
sign-in message (and `setup` claims the first owner) so the outbox is ready.
Those requests carry `x-rer-local-cli`, an HMAC-SHA256 of `local-cli\0sign-in`
keyed by the installation's private session secret (the setting the adapter
declares as `sessionSecretKey`, default `SESSION_SECRET`)
(`onboarding/adapter-auth.mjs`; checked in
`modules/operator-auth/local-cli.mjs`). A server in local (loopback) mode skips
the sign-in and owner-claim rate limit for a request with a valid proof, so
restarting `dev` any number of times never spends the owner's sign-in budget; a
person's own sign-in requests, and every request to a non-local server, still
count exactly as before. Seeds receive the change by refreshing their copies as
described above.

Idle timeout is `--idle-timeout SECONDS`, then `RER_SERVER_IDLE_SECONDS`, then
1800 seconds. Only positive integer seconds are accepted. HTTP requests,
including assets/outbox, reset inactivity; a live request/stream prevents idle
shutdown. Internal health probes and Vite HMR control traffic do not prolong
serving; application WebSocket data messages count. Explicit stop and idle
expiry clean up owned descendants before releasing state and capacity.

The private registry defaults to the OS user's `~/.rer/servers` independently
of checkout and Codex home; `RER_SERVERS_DIR` selects an isolated directory.
The combined dev/preview cap is 2 (`RER_SERVER_LIMIT`, positive integer).
Starting reservations count. At the cap a start is refused with a plain message
naming each running server, its checkout and its stop command; rer never stops
another checkout's server to make room, in any mode. A run that declares itself
a test or CI journey with `RER_SERVER_JOURNEY=1`, on its own `--port`, neither
counts toward the cap nor is refused by it; its port must be free, as for any
server. Concurrent policy uses the stricter active limit among counted servers.
Symlink/cwd spellings share an instance; distinct worktrees remain distinct.

Bounded workflows enter the queue before checkout custody. Managed serving
reserves under a short machine transaction, releases that transaction, then takes
checkout custody before finite preparation. A competing local operation refuses
immediately rather than waiting with a lease. Cleanup stops processes and releases private/state custody
before removing a generation's registry record. Stop waits never need
the machine transaction during process cleanup. A stale generation cannot remove
its replacement. Unverifiable foreign processes are never adopted or signalled.

## Bounded work

Heavy commands share the dependency-free Base job queue module exported with
the CLI: install/build/verify, browser suites, setup preparation and temporary app,
deploy's local build/validation, release's expensive phases and local transfer
resource work. Serving uses the registry, with finite preparation queued.
Labels include project, initiating verb/phase and a safe checkout digest. Use
`node scripts/base-cli/modules/job-queue/cli.mjs status` to inspect admission.
Waits go to redacted progress/stderr. Nested commands validate live lease
membership and actual process ancestry before sharing the admitted slot.
Direct documented browser/runtime entrypoints and indirect package scripts join
the same executor. Original-caller `CI=true` skips admission; `CI=false` and unset CI queue.
Heavy verbs alone accept `--no-queue`, only with `CI=true`. Synthesized install
child CI does not change the original decision. Inspection/help/outbox URL,
stop and reset inventory/removal do not start a heavy job or application.

Run the CLI contract and current first-party seed checks as part of Base's
documented verification workflow. Structural `check` results and local runtime
checks do not establish hosted acceptance or provider delivery.
