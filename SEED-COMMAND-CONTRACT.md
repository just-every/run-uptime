# Seed command contract 1

This is the required maintained command path for every first-party seed,
including Base's default seed and composed foundation editions. Independently
authored projects may use this CLI and installer, but RER does not require
either; owners keep their own supported operations and integration choices.

## Commands and flags

Run from the project root, or use `--cwd PATH`. Every new verb accepts `--help`, `--cwd PATH`, `--non-interactive` and `--json`. Help exits before tools, configuration, adapters or effects run. Unknown flags, missing flag values and invalid values fail before effects. A single `--` separator is accepted for package-script forwarding. Flags belong only to the verbs listed below; there is no catch-all pass-through in the first-party profile.

| Required verb | Additional flags | Successful end state |
| --- | --- | --- |
| `install` | `--no-queue` | Frozen dependency installation using the pinned pnpm and lockfile; no app setup, global tool changes or deployment. |
| `setup` | `--owner-email EMAIL`, `--owner-name NAME`, `--port P`, `--host HOST`, `--answers FILE`, `--no-queue` | Manifest answers validated; real build, all local migrations, private settings and first owner prepared; temporary app stopped before exit. |
| `dev` | `--port P`, `--host HOST`, `--idle-timeout SECONDS`, `--stop`, `--no-queue` | Managed foreground development server with assets/HMR, health-gated readiness, ordinary owner sign-in and the project's declared Cron Triggers run locally on their schedule (`commandAdapter` option `scheduled: false` turns that off). |
| `preview` | `--port P`, `--host HOST`, `--idle-timeout SECONDS`, `--stop`, `--no-queue` | Managed foreground fixed production output, actual health/outbox readiness, same owner and canonical durable state. |
| `build` | `--no-queue` | Real production Worker/assets built with private local settings excluded, then restored exactly. |
| `verify` | `--no-queue` | The seed's complete verification command runs; it never calls its own public `verify` alias recursively. |
| `reset` | `--yes` | Explicitly confirmed local data, owner, generated settings and installer state removed; no remote effect. |
| `deploy` | `--environment NAME`, `--dry-run`, `--no-queue` | Base deploy-kit owner-account deployment plus health; dry run validates/builds locally and makes zero provider requests. Default environment is `production`. |
| `export` | `--target local\|remote`, `--output FILE`, `--origin URL`, `--session-file FILE`, `--no-queue` | Complete supported installation data written to a new owner-only archive, with integrity receipt and explicit exclusions. Default target is local; output is required. |
| `import` | `--target local\|remote`, `--input FILE`, `--origin URL`, `--session-file FILE`, `--yes`, `--no-queue` | Archive validated and atomically restored into an empty destination under the product's restore policy; input and confirmation are required. |
| `outbox` | `--port P`, `--host HOST`, `--owner-email EMAIL`, `--open` | Prints the running local app's `/__dev/outbox` URL. An explicit owner email requests a fresh ordinary sign-in message. Browser opening requires `--open`. |
| `doctor` | none | Read-only tool/version, local configuration and state-placement diagnostics, naming missing inputs and their documented sources. No provider request. |
| `describe` | none | Describes commands, flags, aliases, effects, pins and state without installing or executing project commands. |
| `check` | `--profile first-party` | Read-only structural contract/operations validation, including required hooks, flags, aliases and pins. No credentials needed for a fresh clone. |
| `release` | existing `--repo`, `--project`, `--repository`, `--output`, `--ref`, `--dry-run`, `--tag [vVERSION]`, `--clean-history`, `--onto`, `--env-file`, `--no-queue` | Existing Base release behavior, receipts, validation, gates, local tags and exit codes preserved. |

`release` is the compatibility exception: preserve its existing parser, required `--repo`/`--output`, JSON receipt and exit codes; do not retrofit the new common flags or infer publishing identities. Root help may list the new commands. Release never pushes or deploys. Source inspection and locking remain edition-authoring commands, not another implementation in `rer`.

`--no-queue` is available only on the heavy commands that list it and only
when the original caller has `CI=true`. The actual descriptor is authoritative
for a given checkout.

Base default-seed and exported foundation typechecks in `verify` use checkout-local, gitignored `.cache/typecheck.tsbuildinfo` in the package; deleting it forces a full check, while `build` still builds the real Worker and assets.

`P` is a decimal integer 1–65535. An explicit occupied port fails; never silently choose another. Default port is the saved local port, otherwise 8787. `HOST` is exactly `127.0.0.1`, `localhost` or `::1`; default is saved host, otherwise `127.0.0.1`. Public/listen-all hosts fail. First setup saves the selected origin. Dev/preview/outbox overrides apply together to runtime bindings and never rewrite private settings. Setup refuses a conflicting saved owner or origin with an actionable reset/recovery instruction; it does not silently ignore flags. No automatic secret rotation; existing reviewed rotation APIs remain outside these public verbs.

First setup requires an owner email explicitly, through the manifest answers file, or through an interactive prompt showing any proposed git-email default. Non-interactive mode never silently claims the git identity. Email must be a valid plain mailbox, normalized consistently with mail/auth; never put it or secrets into a shell command. Owner name defaults to `Owner` unless supplied or declared by the manifest. `--answers` is a regular private JSON answer file using manifest names, not an environment file; conflicting flag/file values fail. Conditional required fields and seed-specific workspace answers come from `rer-setup.json`, never new seed-specific CLI flags. Secrets are read privately from declared files/environment or asked privately, never accepted as CLI values or printed. `--non-interactive` means no stdin prompt/browser launch; missing answers exit 3. JSON also suppresses automatic browser opening and prompts.

Missing-answer errors name the missing manifest fields. An answers file is a
private mode-0600 JSON object keyed by those names, for example
`{"OWNER_EMAIL":"owner@example.com"}`, passed with
`node scripts/rer.mjs setup --answers PATH --non-interactive`. Keep secret
values in declared private inputs.

Local setting names come from the seed's existing declarations: `commandAdapter.hooks.secrets.originKey` selects the saved origin, and the setup manifest's `owner-claim.emailField` selects the owner mailbox. Without an owner-claim step, `commandAdapter.input.names.email` selects the mailbox. Undeclared names default to `AUTH_ORIGIN` and `OWNER_EMAIL`. Setup preflight, dev/preview/outbox prerequisites and sign-in input, and doctor all use these same keys and the adapter's declared settings file/format. Native-auth seeds retain their own setting names; do not add duplicate aliases or redeclare the manifest's owner field in the adapter.

## Output and exits

Human dev output also prints one line `RER_SCHEDULED TIME "CRON" ok MSms` (or `failed (...)` / `skipped (...)`) per local Cron Trigger run, and `--json` a `scheduled` event; `preview` runs no schedules. Human dev/preview output includes exactly one line `RER_READY http://HOST:P` (IPv6 bracketed, no trailing slash) only after the real application health check succeeds, and `RER_SIGN_IN http://HOST:P/__dev/outbox`. Explain: open the outbox, choose the newest sign-in message and follow its link; no email was sent. Setup prints `RER_SETUP_READY URL`, the sign-in instructions and `Next: pnpm run dev`, but exits with no server left running. Outbox prints `RER_SIGN_IN URL`; print neither message contents nor a token-bearing sign-in URL. Build/install/verify/reset/deploy/export/import print their verb, outcome and relevant safe path or URL. Dry-run deployment explicitly says no deployment occurred.

With `--json`, stdout is UTF-8 NDJSON only: `{version:1,verb,event,...}`. Bounded commands end in exactly one `event:"result"` with `ok` and `exitCode`; failures emit `event:"error"` with a stable `code`, safe `message` and `exitCode`. Dev/preview emits one `event:"ready"` with `url` and `signInUrl`, then its eventual result. Progress belongs in JSON events or redacted stderr. Never include values, cookies, generated settings, archives or token-bearing URLs. A declared-command result can include numeric `childExitCode` and signal.

`describe --json` is one object (the inspection exception to event streaming): `contractVersion:1`, `profile:"first-party"|"independent"`, `pins:{node,pnpm}`, `verbs:{VERB:{flags:[FLAG],effects:TEXT}}`, `aliases:{ALIAS:VERB}`, and, for first-party, `local:{state:".wrangler/state",settings:[RELATIVE_FILE],installerState:".seed/installer",outbox:"/__dev/outbox"}`. It must describe what the parser/adapter actually supports. `check --json` returns a result event with `clauses:[{id,ok,message?}]`; structural failures name the missing verb/flag/alias/pin and how to fix it. Use clause IDs SC-01 through SC-12 below, with more specific subclauses allowed.

| Code | First-party/new CLI meaning |
| --- | --- |
| 0 | Success, help or completed read-only check. |
| 1 | Executed command/test/health/transfer failed, or contract check failed. |
| 2 | Invalid invocation, flag/value, malformed descriptor or answer/archive syntax. |
| 3 | Missing setup answer, prerequisite/tool version, configuration, authentication or input file. |
| 4 | Safety refusal: unconfirmed reset/import, unsafe state/path/host, occupied requested port, conflicting saved identity, active local operation or unsupported capability. |
| 130 / 143 | SIGINT / SIGTERM after owned children stop and private files recover. |

Release keeps 0 success, 1 BLOCKED receipt, 2 failed argument/source/artifact validation. Independent declared commands preserve their child's exit status and signal conventions; wrapper validation uses the new CLI codes. An error is never success with a warning. Check is structural; doctor is environment-dependent; neither claims app acceptance or remote health.

## Local sign-in and state

All first-party local runs use Base mail's development provider and `/__dev/outbox`, guarded to the configured loopback origin and unavailable remotely. No external mail credential, static dev session, sample owner or email-provider fallback. Setup builds/migrates, briefly starts the app through the shared runner, claims its first owner through operator-auth with the private one-use setup token, requests an ordinary sign-in message, checks it reached the outbox, then stops the app. An already-claimed owner and data survive setup; it must not create a second owner or rotate secrets. Dev supplies the same origin/private bindings and requests a fresh link for the saved owner before readiness. These setup and dev requests carry the CLI's `x-rer-local-cli` proof (HMAC-SHA256 of `local-cli\0sign-in` keyed by `SESSION_SECRET`, supplied by the shared adapter and honoured by operator-auth only in local mode), so restarts never spend the owner's sign-in rate limit; a person's requests and any non-local server still count. A subsequent ordinary sign-in uses the same outbox. HTML forms use POST before hydration.

HappyToHelp and Slate retain their approved auth overrides: their owner and
sign-in hooks use their real auth while preserving first-owner idempotence,
prior data and the same Base outbox experience. This contract does not authorize
migrating those auth systems. The foundation template includes a real minimal
owner/auth/mail/D1 path. Owners may remove it only by deliberate divergence.

Canonical local durable data is `.wrangler/state/`, outside dist/build output. CLI bookkeeping is `.rer/local/`; installer drafts/logs are `.seed/installer/`; private settings default to `.dev.vars` (0600). An existing seed may explicitly inventory a retained private file such as `data/local-secrets.json`; it has the same custody/reset rules. Directories containing secrets are 0700. No symlink/traversal/overlap with source, exports, dependencies or build outputs is accepted as state. Preserve and report ambiguous legacy state; never silently adopt/move/delete it. Setup reruns keep exact existing private bytes, permissions and owner/data; builds preserve interrupted-operation recovery and credential exclusion.

Reset acquires the shared local lock and refuses while dev/installer/transfer owns the state. It lists exactly the removal inventory before confirmation. `--non-interactive` requires `--yes`; neither JSON nor non-interactive implies consent. Remove local D1/R2/KV/DO state, owners/sessions/outbox, `.rer/local/`, `.seed/installer/`, and declared generated private settings/backups only. Keep Git/source/lockfiles, `rer-setup.json`, edition baselines, dependencies, owner export archives and `.rer/deploy/` receipts. Do not remove a broad `.wrangler`, `.rer`, `data` or checkout directory. A second confirmed reset succeeds with an empty inventory. A fresh setup then creates a fresh owner, with no previous domain rows or messages.

## First-run setup at /setup

Every first-party seed serves its owner's first-run setup at `/setup`: while setup is unfinished the signed-in owner completes it there (and any app route sends the owner to it); once finished, `/setup` takes the owner into the app (or to settings for later changes). Signed-out visitors are sent to sign-in and back. `rer setup` and the outbox sign-in link return the owner to `/setup` until first-run is complete, and the README/AGENTS name it (owner, 10 Oct 2026).

First-run completion is stored durably; a setup rerun does not clear it.

## Pins, aliases and responsibility

Required first-party pins: `.node-version` is `22.20.0`; `package.json.engines.node` is `22.20.0`; `packageManager` is `pnpm@10.12.4`. Keep any `.nvmrc`, CI/bootstrap and documentation declarations consistent. These are today's tested Base cloud-bootstrap/foundation pins, not a requirement for independent projects. Commands that execute project work select the exact Node pin, using an exact matching installed runtime or a checksum-verified user-cache copy at `~/.rer/node/node-vVERSION-PLATFORM-ARCH/`; when needed on supported platforms, the runner retrieves the official release and verifies its SHA-256 against `SHASUMS256.txt`. The runner never changes global Node installations. `RER_NODE_AUTO=0` opts out; a failure reports the repair invocation `npm exec --yes --package=node@VERSION -- node SCRIPT VERB --cwd PROJECT`. Help, check, describe, doctor and stop do not select or acquire Node. Refresh lockfiles legitimately for pnpm 10 and retain the reviewed native-build allowlist (esbuild/workerd where needed).

Ship a byte-exact pinned Base CLI export at `scripts/base-cli/`, with thin `scripts/rer.mjs` dispatching it. It includes its transitive portable command/release sources and export inventory; it never reaches a neighboring Base checkout. Do not duplicate a second onboarding tree: import the seed's existing byte-exact `scripts/base-onboarding/` through the documented export boundary. Base itself retains `bin/rer.mjs` as a thin dispatcher.

Package scripts for `setup dev preview build verify reset deploy export import release outbox doctor describe check` are exactly `node scripts/rer.mjs VERB`. Invoke them as `pnpm run VERB -- FLAGS`; in particular use `pnpm run deploy`, not pnpm's built-in deploy. Never define a package `install` lifecycle script to launch `rer install`; `pnpm install --frozen-lockfile` is the equivalent dependency action. Provide `"deps":"node scripts/rer.mjs install"` and `"rer":"node scripts/rer.mjs"`. Internal adapter targets use distinct names/files (for example, a verify suite entrypoint) to prevent alias recursion.

Use OPERATIONS v2, preserving environmentSources and loops. Its `commands` declares every required verb with real argv, inputs and effects; inspector/CLI verbs still perform only their documented inspection. Opt in to the first-party profile with `seedContract:{version:1,profile:"first-party",adapter:"scripts/installer/local.mjs"}`. This is a small operations extension, not another configuration file or a second setup schema. An explicit `rer check --profile first-party` must enforce the profile even if its marker has been deleted; this flag is additional to check's common flags. References and generation tests must also require the marker. No package/edition presence alone makes an independent project first-party.

Each seed adapter exports `commandAdapter` alongside its installer integration:
declarative hooks and targets for dependencies, build, migrations, start,
health, owner, sign-in, verification, deploy and portability; state/settings
removal inventory; and the selected manifest. Reuse `localInstaller`,
`onboarding/commands.mjs` and `onboarding/local/` guarantees. The CLI owns
argument validation, profile resolution, locks/recovery, sequencing, pins,
captured/redacted child execution, health readiness, confirmation, JSON/exit
mapping and cleanup. The seed owns product answers, real resource
names/migrations, approved auth overrides, data policy and actual
build/dev/verify targets.

A seed whose build rewrites tracked-looking files that are not source (generated migrations, widget or download assets, route trees, delivery output) lists them in `commandAdapter.generatedOutputs`: project-relative files or directories, for example `generatedOutputs: ['.generated', 'public/widget.js']`. Preview's fixed-build receipt and its during-build check ignore exactly those paths and nothing else. A real source edited during the build is still refused with its file named, and an undeclared file the build rewrites is refused with a message naming it and this declaration. Without the declaration nothing changes.

Every first-party adapter selects one root `rer-setup.json` manifest. The CLI,
installer and deploy producer share its field selection and digest rules; do not
create a second setup schema. Every first-party seed proves local
export/import/export equivalence across all supported resources. Local
export/import must cover every supported resource. Remote transfer is optional
and requires complete resource coverage; an unsupported remote target fails
with exit 4 and names the missing capability.

Independent projects without an adapter use `OPERATIONS.json` v2 `commands.NAME.argv`, `inputs`, effects, environmentSources and loops. Execute argv directly with shell false in the checkout, forwarding explicit arguments after `--` unchanged; never translate them into Cloudflare/pnpm/Base behavior. Common wrapper flags are consumed before the separator. No declared verb means exit 4, not an inferred command/fallback. Existing v1 inspection remains supported. Do not infer runnable commands from the platform registration descriptor's shell strings. No global pins, aliases, installer, outbox, state layout or required verb set is imposed on independent projects; runtime requirements remain project-owned. Independent check still validates the actual declaration and refuses missing/outside-checkout inputs.

## Acceptance clauses

- SC-01: required verbs, real flags, thin self-contained dispatcher and truthful describe output.
- SC-02: exact pins and public aliases, no lifecycle/built-in collision or recursion.
- SC-03: real manifest-driven setup, private custody, idempotent owner and failure recovery.
- SC-04: managed foreground development/HMR and fixed production preview, requested origin, health/outbox-gated ready output, intact public-input/output build reuse and descendant cleanup.
- SC-05: Base outbox, ordinary one-use sign-in, pre-hydration POST and local-only guard.
- SC-06: confirmed, contained, local-only reset and clean subsequent setup.
- SC-07: real build/verify and production preview, owner-account deploy/dry-run and unchanged release producer/receipt/exits; bounded expensive execution joins the shared queue.
- SC-08: complete local export/import, integrity, empty-destination/confirmation and credential exclusions.
- SC-09: structural check rejects omissions, doctor names missing inputs, stable JSON and exits.
- SC-10: optional independent execution uses only declared argv, preserves child outcomes and forces no stack.

## Managed servers and bounded work

Dev and preview are managed foreground servers with explicit stop and
idle-timeout controls. The first invocation stays active while serving. A
compatible repeated invocation verifies the registered live application,
emits its ready/outbox URLs and exits 0 without another build/sign-in. They
share one canonical-checkout slot;
symlink/cwd aliases share it, distinct worktrees do not. The other mode or an
explicitly conflicting host/port/timeout refuses with exit 4 and the correct stop
instruction. Mode changes require stop then start. `--stop` is idempotent when
absent, needs no tools/settings/build, refuses another live mode, and rejects
start-only flags before effects.

Idle timeout precedence: explicit `--idle-timeout`, `RER_SERVER_IDLE_SECONDS`,
then 1800 seconds. Positive integers only. The clock starts at readiness.
Application HTTP, assets and outbox activity reset it; active requests/streams
prevent expiry/eviction. Internal management/readiness probes and HMR control
traffic alone do not count. Real application WebSocket data messages do count.

Private registry: OS home `~/.rer/servers`, with `RER_SERVERS_DIR` override.
Combined cap: 2, with positive-integer `RER_SERVER_LIMIT`. Atomic reservations
precede ports/heavy work and count toward capacity. Concurrent different limits
use the stricter applicable limit. At capacity stop the oldest eligible server
(last activity, then start time, then checkout), requiring at least 60 seconds
inactivity and no active request/stream. Otherwise refuse 4 with safe URLs and
stop instructions. Verify lifetime/process identities and health; preserve
foreign/unverifiable processes. Cleanup all owned descendants and private/state
custody before freeing records/ports; old generations cannot remove replacements.
Explicit stop/idle/eviction exit 0; child failure remains nonzero; INT/TERM retain
130/143. Starting duplicates wait boundedly and never announce a failing startup.

Preview serves real built Worker/assets/routes/private streams/404 with exactly
one workerd, no Vite/HMR, source/config watcher or automatic rebuild. Queue one
cache-miss build; reuse only when actual dirty/untracked/shared/copied runtime,
config/lock/tool inputs and intact output bytes match a nonsecret `.rer/local`
receipt. Never hash private settings. Missing/corrupt/interrupted output or an
input change during build invalidates certification. Require ordinary prior
setup/migrations; missing prerequisites name `rer setup` and exit 3. Preserve
private bytes/modes, owner, origin overrides and canonical `.wrangler/state`
D1/R2/KV/DO. Request fresh ordinary sign-in and verify health/outbox before ready.

Heavy install/build/verify targets, directly documented browser suites and
indirect/generated scripts use the exported dependency-free Base job queue module.
Setup uses the shared RER installer lifecycle for build, migrations and a
bounded temporary runtime. Dev/preview queue finite preparation; managed serving uses the server
cap and never outlives a released job as its descendant. Deploy queues local
build/validation including zero-provider dry run; release queues expensive steps
without changing its producer/parser/receipt/exits except adding `--no-queue`.
Export/import queues local resource runtime work. Help/describe/check/doctor,
outbox URL, stop and reset inventory/removal stay light.

Labels identify the declared project, initiating verb/phase and safe checkout
identity without credential remotes or secrets. Status/waits are human progress,
valid JSON events or redacted stderr. Human queue waits report immediately with
a reason and numeric one-based position, then refresh about every 15 seconds.
From the runnable project root, inspect the live queue with
`node scripts/base-cli/modules/job-queue/cli.mjs status`.
Nested commands share only validated live
owned membership, never a boolean bypass; slots=1 works. Queue cancellation
removes pending work; admitted cancellation stops owned children and restores
private files before releasing the lease. Queue/state locks cannot deadlock.
Original-caller `CI=true` skips queue admission. Heavy-capable verbs alone accept
`--no-queue`, only with original `CI=true`; other use fails 2 before effects.
`CI=false`/unset queue. Synthesized install child CI cannot change the original
policy. Independent commands preserve their declared argv/stack and outcomes.

- SC-11: canonical managed foreground server lifecycle, real request activity,
  exact idle/stop/cap defaults, identity-safe crash recovery and deterministic
  cross-process admission/eviction, with complete cleanup before reuse.
- SC-12: real queue coverage of every bounded expensive path, portable
  dependency-free sources, safe labels/output, validated nested membership,
  original CI policy, cancellation/custody and light inspection boundaries.

## First-party agent instructions and current entry points

Every first-party `AGENTS.md` and `CLAUDE.md` opens with a `Run it locally`
section for the checkout it governs. From a runnable edition root, show the
current command sequence:

```sh
node scripts/rer.mjs install
node scripts/rer.mjs setup --owner-email you@example.com
node scripts/rer.mjs dev
```

Explain how to enter the real owner mailbox through the setup prompt or an
approved flag, then sign in through the local outbox URL printed by `dev`,
using the newest ordinary sign-in message. State whether external mail is sent
and preserve the actual local auth and data requirements. Stop `dev` with
`node scripts/rer.mjs dev --stop` or Ctrl-C, and stop `preview` with
`node scripts/rer.mjs preview --stop` before build or verification. The opening
section also shows the current verification, reset, transfer, deployment and
description commands:

```sh
node scripts/rer.mjs verify
node scripts/rer.mjs reset --yes
node scripts/rer.mjs export --output exports/installation.rer
node scripts/rer.mjs import --input exports/installation.rer --yes
node scripts/rer.mjs deploy
node scripts/rer.mjs describe
```

Document the actual flags, effects and cautions for each operation.

Base's root guide directs maintainers into its runnable first-party seed.
Composed foundation input becomes runnable after composition, and its agent
guide runs from that edition checkout. Describe managed foreground server
behavior and compatible repeat invocations according to the current command
contract.

Maintain first-party documents and entry points as current guidance. Remove
superseded setup, dev, install, reset, deploy and verify wrappers and
instructions, including descriptions of earlier flows. Keep the commands and
behavior the RER CLI actually uses, and retain real product, architecture,
authentication, data, security and deployment requirements. RER adoption stays
optional for independently authored projects.
