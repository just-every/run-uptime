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
| `dev` | `--port P`, `--host HOST`, `--idle-timeout SECONDS`, `--stop`, `--as PERSONA`, `--login`, `--no-queue` | Managed foreground development server with assets/HMR, health-gated readiness and the project's declared Cron Triggers run locally on their schedule (`commandAdapter` option `scheduled: false` turns that off). A seed declaring `devIdentity` opens signed in as the owner `rer setup` claimed; `--as` starts as another declared persona or `signed-out`, and `--login` turns dev identity off for the outbox sign-in. Other seeds keep the ordinary outbox sign-in. |
| `preview` | `--port P`, `--host HOST`, `--idle-timeout SECONDS`, `--stop`, `--no-queue` | Managed foreground fixed production output, actual health/outbox readiness, same owner and canonical durable state. |
| `build` | `--no-queue` | Real production Worker/assets built with private local settings excluded, then restored exactly. A `devIdentity` seed's build fails with exit 4, naming the file, when its output contains the dev layer's marker. |
| `verify` | `--no-queue` | The seed's complete verification command runs; it never calls its own public `verify` alias recursively. |
| `reset` | `--yes` | Explicitly confirmed local data, owner, generated settings and installer state removed; no remote effect. |
| `deploy` | `--environment NAME`, `--dry-run`, `--no-queue` | Base deploy-kit owner-account deployment plus health; dry run validates/builds locally and makes zero provider requests. Default environment is `production`. Both refuse with exit 4, before building, a deploy binding, secret or secret source named `RER_DEV_KEY` or any key the adapter declares in `localOnlyKeys`; deploy-kit's owner plan refuses the same. |
| `export` | `--target local\|remote`, `--output FILE`, `--origin URL`, `--session-file FILE`, `--no-queue` | Complete supported installation data written to a new owner-only archive, with integrity receipt and explicit exclusions. Default target is local; output is required. The seed's `prepare` hook runs first. |
| `import` | `--target local\|remote`, `--input FILE`, `--origin URL`, `--session-file FILE`, `--yes`, `--no-queue` | Archive validated and atomically restored into an empty destination under the product's restore policy; input and confirmation are required. The seed's `prepare` hook runs first, so a copy that never ran setup or build can import. |
| `outbox` | `--port P`, `--host HOST`, `--owner-email EMAIL`, `--open` | Prints the running local app's `/__dev/outbox` URL (and, for a `devIdentity` seed, its `RER_OPEN` key-exchange URL). An explicit owner email requests a fresh ordinary sign-in message. Browser opening requires `--open`. |
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

Human dev output also prints one line `RER_SCHEDULED TIME "CRON" ok MSms` (or `failed (...)` / `skipped (...)`) per local Cron Trigger run, and `--json` a `scheduled` event; `preview` runs no schedules. Human dev/preview output includes exactly one line `RER_READY http://HOST:P` (IPv6 bracketed, no trailing slash) only after the real application health check succeeds. Then:

- **Dev identity** (a `devIdentity` seed's `dev` without `--login`): `RER_SIGNED_IN EMAIL` names the identity the browser will hold (the owner, or the `--as` persona; omitted for `--as signed-out`), then `RER_OPEN http://HOST:P/#rer-dev=KEY&as=PERSONA`. Opening it signs the browser in.
- **Outbox sign-in** (`--login`, `preview`, `outbox` and seeds without `devIdentity`): `RER_SIGN_IN http://HOST:P/__dev/outbox` and the explanation: open the outbox, choose the newest sign-in message and follow its link; no email was sent. A `devIdentity` seed's outbox needs the key gate, so these also print `RER_OPEN` with `next=/__dev/outbox` (dev: `http://HOST:P/#rer-dev=KEY&next=…`; preview and outbox: `http://HOST:P/__dev/key#rer-dev=KEY&next=…`). Seeds without `devIdentity` print exactly the `RER_SIGN_IN` lines above, unchanged.

**Why `RER_OPEN` may carry the key.** `RER_DEV_KEY` admits only this checkout's loopback runtime and is never a deploy binding, so the line hands the person at this terminal the same authority as reading `.rer/local/`. The key travels only in the URL fragment: browsers never send a fragment to a server, proxy or log, and the page removes it from the address bar before trading it, through a same-origin POST to `/__dev/key`, for a host-only `HttpOnly; SameSite=Strict; Path=/` cookie. It never appears in a query string, captured log (rer redacts it), JSON progress event or file outside `.rer/local/`. Treat the line as a credential: do not paste it into chats, tickets or another machine.

Setup prints `RER_SETUP_READY URL` and exits with no server left running; with dev identity it then says that `pnpm run dev` opens the app signed in as the owner, otherwise it prints the sign-in instructions and `Next: pnpm run dev`. Outbox prints `RER_SIGN_IN URL`; print neither message contents nor a token-bearing sign-in URL. Build/install/verify/reset/deploy/export/import print their verb, outcome and relevant safe path or URL. Dry-run deployment explicitly says no deployment occurred.

With `--json`, stdout is UTF-8 NDJSON only: `{version:1,verb,event,...}`. Bounded commands end in exactly one `event:"result"` with `ok` and `exitCode`; failures emit `event:"error"` with a stable `code`, safe `message` and `exitCode`. Dev/preview emits one `event:"ready"` with `url` and `signInUrl`; a `devIdentity` seed's event also carries `openUrl` and, for dev, `signedInAs` (an email, or null when signed out or using the outbox). Then comes its eventual result. Progress belongs in JSON events or redacted stderr. Never include values, cookies, generated settings, archives or token-bearing URLs; `openUrl` is the one deliberate exception, for the reason above. A declared-command result can include numeric `childExitCode` and signal.

`describe --json` is one object (the inspection exception to event streaming): `contractVersion:1`, `profile:"first-party"|"independent"`, `pins:{node,pnpm}`, `verbs:{VERB:{flags:[FLAG],effects:TEXT}}`, `aliases:{ALIAS:VERB}`, and, for first-party, `local:{state:".wrangler/state",settings:[RELATIVE_FILE],installerState:".seed/installer",outbox:"/__dev/outbox"}`, plus `devIdentity:true,devKey:".rer/local/dev-key.env"` for a `devIdentity` seed. It must describe what the parser/adapter actually supports. `check --json` returns a result event with `clauses:[{id,ok,message?}]`; structural failures name the missing verb/flag/alias/pin and how to fix it. Use clause IDs SC-01 through SC-12 below, with more specific subclauses allowed.

| Code | First-party/new CLI meaning |
| --- | --- |
| 0 | Success, help or completed read-only check. |
| 1 | Executed command/test/health/transfer failed, or contract check failed. |
| 2 | Invalid invocation, flag/value, malformed descriptor or answer/archive syntax. |
| 3 | Missing setup answer, prerequisite/tool version, configuration, authentication or input file. |
| 4 | Safety refusal: unconfirmed reset/import, unsafe state/path/host, occupied requested port, conflicting saved identity, active local operation, unsupported capability, a build holding the dev layer, a local-only deploy key, an archive holding dev sessions or dev-minted credentials, or dev identity beside a managed installation. |
| 130 / 143 | SIGINT / SIGTERM after owned children stop and private files recover. |

Release keeps 0 success, 1 BLOCKED receipt, 2 failed argument/source/artifact validation. Independent declared commands preserve their child's exit status and signal conventions; wrapper validation uses the new CLI codes. An error is never success with a warning. Check is structural; doctor is environment-dependent; neither claims app acceptance or remote health.

## Local sign-in and state

All first-party local runs use Base mail's development provider and `/__dev/outbox`. No external mail credential, static session, sample owner or email-provider fallback. Setup builds/migrates, briefly starts the app through the shared runner, claims its first owner through operator-auth with the private one-use setup token, requests an ordinary sign-in message, checks it reached the outbox, then stops the app. An already-claimed owner and data survive setup; it must not create a second owner or rotate secrets. These setup and dev requests carry the CLI's `x-rer-local-cli` proof (HMAC-SHA256 of `local-cli\0sign-in` keyed by `SESSION_SECRET`, supplied by the shared adapter and honoured by operator-auth only in local mode), so restarts never spend the owner's sign-in rate limit; a person's requests and any non-local server still count. HTML forms use POST before hydration.

**No built-in routes or private files on the public listener.** For every seed, nothing the local runtime serves under `/cdn-cgi/*` (Wrangler's and the Cloudflare Vite plugin's Local Explorer, the scheduled and email trigger handlers, the R2 and platform proxies) answers on the port a person or proxy reaches, and neither do the checkout's private folders (`.rer`, `.seed`, `.wrangler`, `.dev.vars*`) or export archives (the `exports/` folder and any `*.rer` file). rer starts every runtime with `X_LOCAL_EXPLORER=false`, setup's temporary app runs without trigger handlers, rer's public listener answers 404 for those paths, and rer's scheduler calls the runtime's internal port. `rer export` refuses an `--output` the dev server would still serve: save archives under `exports/` or give them a `.rer` name. A seed's Vite config limits `server.fs.allow` to the folders the app is built from (`src`, `public`, `node_modules`) so nothing else in the checkout is served.

**The key gate** (a `devIdentity` seed). A tunnel or local reverse proxy makes remote requests look local, so the loopback origin is not a guard. For a `devIdentity` seed, `rer setup` writes a random `RER_DEV_KEY` (32 random bytes) per checkout to `.rer/local/dev-key.env` (directory 0700, file 0600); a repeat setup keeps its bytes, `rer reset --yes` removes it and the next setup makes a new one. Only local runtimes receive it: Vite's dev server, setup's temporary app and preview. Opening `RER_OPEN` trades it for the gate cookie. Dev sign-in, persona switching, `/__dev/personas`, `/__dev/outbox` and tests' `signInAs` need that cookie (or, for the CLI and test harnesses, the key in an `x-rer-dev-key` header); without it each answers 404, through any proxy. A cookie from before a reset is refused. A runtime without the key binding serves none of them.

**Dev identity** (`commandAdapter.devIdentity`). The operator-auth `dev` layer, server-only in its own directory, serves `/auth/dev/enter?as=PERSONA`, which creates or reuses a real `oa_sessions` row of kind `dev` for the owner `rer setup` claimed, or for a persona, so version fences, revocation and deactivation behave exactly as in production. A dev session, and any credential minted while using one, is admitted only on a request that passes the key gate. Until first-run is finished the owner lands on `/setup`. A dev-only badge switches between `owner`, `signed-out` and the seed's `devPersonas()`: real operators at `<as>@dev.localhost`, created only by local dev sign-in. Export drops dev sessions and dev-minted credentials and marks personas suspended; import refuses an archive that holds either. Dev identity refuses to start when `RER_INSTALLATION_ID` is set beside a non-loopback `RER_MANAGEMENT_ORIGIN`. There is still no static session, sample owner or mail fallback: every dev session belongs to a real operator in the app's own database.

The seed loads the layer only through a local-only entry (a Vite-serve or local `wrangler dev` entry), never from the deployed main, and declares `devIdentity: {entry, output, emailLinkTest}`: `rer build` scans `output` and refuses any file containing the layer's marker, naming it. Each seed keeps **one end-to-end email-link test** (owner claimed, ordinary link mailed to the key-gated outbox, confirmation, signed-in session), so the email path stays proven while people use dev identity. `rer dev --login` turns dev identity off and uses that outbox sign-in, the same experience as seeds without `devIdentity`.

**Seeds without `devIdentity`** get no key: they keep the outbox guarded to the configured loopback origin and unavailable to a remote Host (a tunnel that rewrites Host to loopback passes that guard; the key gate is what closes it), and `rer dev` requests a fresh link for the saved owner before readiness and prints `RER_SIGN_IN …/__dev/outbox` unchanged.

HappyToHelp and Slate retain their own accounts, sessions and roles: their owner and sign-in hooks use their real auth while preserving first-owner idempotence, prior data and the same Base outbox experience. Base operator-auth identity reaches them only through an accounts adapter over their own tables. The foundation template includes a real minimal owner/auth/mail/D1 path. Owners may remove it only by deliberate divergence.

Canonical local durable data is `.wrangler/state/`, outside dist/build output. CLI bookkeeping is `.rer/local/`; installer drafts/logs are `.seed/installer/`; private settings default to `.dev.vars` (0600). An existing seed may explicitly inventory a retained private file such as `data/local-secrets.json`; it has the same custody/reset rules. Directories containing secrets are 0700. No symlink/traversal/overlap with source, exports, dependencies or build outputs is accepted as state. Preserve and report ambiguous legacy state; never silently adopt/move/delete it. Setup reruns keep exact existing private bytes, permissions and owner/data; builds preserve interrupted-operation recovery and credential exclusion.

Reset acquires the shared local lock and refuses while dev/installer/transfer owns the state. It lists exactly the removal inventory before confirmation. `--non-interactive` requires `--yes`; neither JSON nor non-interactive implies consent. Remove local D1/R2/KV/DO state, owners/sessions/outbox, `.rer/local/` (including the dev key, so earlier gate cookies stop working), `.seed/installer/`, and declared generated private settings/backups only. Keep Git/source/lockfiles, `rer-setup.json`, edition baselines, dependencies, owner export archives and `.rer/deploy/` receipts. Do not remove a broad `.wrangler`, `.rer`, `data` or checkout directory. A second confirmed reset succeeds with an empty inventory. A fresh setup then creates a fresh owner, with no previous domain rows or messages.

## First-run setup at /setup

Every first-party seed serves its owner's first-run setup at `/setup`: while setup is unfinished the signed-in owner completes it there (and any app route sends the owner to it); once finished, `/setup` takes the owner into the app (or to settings for later changes). Signed-out visitors are sent to sign-in and back. `rer setup`, dev identity and the outbox sign-in link return the owner to `/setup` until first-run is complete, and the README/AGENTS name it (owner, 10 Oct 2026).

First-run completion is stored durably; a setup rerun does not clear it.

## Seed theme

A first-party seed may declare one theme so the shared installer, sign-in confirmation and `/setup` frames wear its look: a CSS file at the root of its served static directory (conventionally `public/rer-theme.css`) holding only `:root` `--rer-*` tokens (page, surface, text, muted, border, focus, optional accent pair, link, font stacks, radius, logo) and `@font-face` rules for font files the app serves. The app serves it at `/rer-theme.css` (a Worker that admits only listed static paths lists it). The installer seed descriptor names it as `theme: 'public/rer-theme.css'`; the Worker passes `/rer-theme.css` to operator-auth `branding.theme` and to `firstRunResponse(..., { theme })`. The installer refuses a theme outside that grammar, naming a file the app does not serve, or whose declared colours fail contrast (4.5:1 for text pairs, 3:1 for focus and borders). Without a theme the pages are unchanged. The token table and wiring are in `scripts/base-onboarding/README.md`.

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
- SC-05: Base outbox and ordinary one-use sign-in with pre-hydration POST; no `/cdn-cgi/*` route or private checkout folder answering on the public listener; for a `devIdentity` seed, the per-checkout key gate on every local sign-in surface, real key-gated dev sessions and personas, a local-only entry whose layer `rer build` refuses in output, refused local-only deploy keys, dev data kept out of archives, and one end-to-end email-link test. `rer check --profile first-party` enforces the entry, the build exclusion and the declared email-link test (`SC-05.dev-identity.*`). Copies of Base's operator-auth layers that the seed records (`base-copies.json`, `composition.lock.json` or `foundation.lock.json`) stay byte-exact to one pinned Base revision; `rer check` names each drifted, missing or unrecorded file (`SC-05.auth-copy.*`).
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
explicitly conflicting host/port/timeout, or a different `--login` choice, refuses
with exit 4 and the correct stop instruction; `--as` only changes the printed
`RER_OPEN`, so it reuses a running dev server. Mode changes require stop then start. `--stop` is idempotent when
absent, needs no tools/settings/build, refuses another live mode, and rejects
start-only flags before effects.

Idle timeout precedence: explicit `--idle-timeout`, `RER_SERVER_IDLE_SECONDS`,
then 1800 seconds. Positive integers only. The clock starts at readiness.
Application HTTP, assets and outbox activity reset it; active requests/streams
prevent expiry. Internal management/readiness probes and HMR control
traffic alone do not count. Real application WebSocket data messages do count.

Private registry: OS home `~/.rer/servers`, with `RER_SERVERS_DIR` override.
Combined cap: 2, with positive-integer `RER_SERVER_LIMIT`. Atomic reservations
precede ports/heavy work and count toward capacity. Concurrent different limits
use the stricter limit among counted servers. At capacity refuse 4 with a plain
message naming every running server's checkout, URL and stop instruction; a
server is stopped only by its own checkout (explicit stop, idle timeout, signal),
never to make room for another, in any mode. A run that declares itself a test
or CI journey with `RER_SERVER_JOURNEY=1`, on its own free port, is neither
counted nor refused by the cap. Verify lifetime/process identities and health; preserve
foreign/unverifiable processes. Cleanup all owned descendants and private/state
custody before freeing records/ports; old generations cannot remove replacements.
Explicit stop/idle exit 0; child failure remains nonzero; INT/TERM retain
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
  cross-process admission, with complete cleanup before reuse.
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
approved flag, then open the app: a `devIdentity` seed's `dev` prints
`RER_OPEN`, which opens it signed in as the owner (`--as` and `--login`
change that); other seeds sign in through the local outbox URL printed by
`dev`, using the newest ordinary sign-in message. State whether external mail is sent
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
