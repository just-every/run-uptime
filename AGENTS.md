# AGENTS.md

## Launch for review

When asked to launch, run or review this app, run this from the checkout root
first:

```sh
rer dev
```

- It installs and sets up a fresh checkout by itself. A first local start usually takes about a minute.
  On a busy computer it can take longer: `rer dev` prints progress every 20 seconds, with the limit to allow.
  If the tool times out, run the same `rer dev` again: it resumes.
- Never run install, setup, reset or deploy for this, and never ask for an
  email, port, password or answers file.
- Give the owner the `RER_READY` address and complete dev’s browser sign-in
  handoff. Never print or share a sign-in credential.
- Stop the app with `rer dev --stop`. If a start is refused, the message names
  the cause and the next command: run that command.

Without `rer` on PATH, install it once with `npx -y @runeditrun/rer cli install`
or the installer script: `curl -fsSL https://runeditrun.com/install.sh | sh`.

## Run it locally

Use Node 22 or later and pnpm 10.12.4. Run commands from the repository root; rer selects the pinned Node 22.20.0 runtime. `rer` runs each verb with the `@runeditrun/rer` version this checkout pins in `package.json`:

```sh
rer install
rer setup --owner-email owner@example.test --owner-name "Local Owner" --non-interactive
rer dev
```

Replace the example email with the owner's address. To start with proposed monitors, add `--answers answers.json` to setup, a private (mode 0600) file holding `{"UPTIME_START_URL":"https://example.com"}`; the owner's runner checks that public site when `/setup` opens and finishing setup lands on its proposals. Dev prints `RER_READY`. Complete dev’s browser sign-in handoff and keep local access credentials private. The product name reads **Uptime Dev**. `rer demo` opens a throwaway installation with sample data as **Uptime Demo**. Public checks run for real; demo notifications return success without sending. Development and demo email completes successfully without sending. `--as member` and `--as signed-out` select other local personas. Stop with `rer dev --stop` or `rer demo --stop`. First-run setup opens at `/setup`; finish it to enter `/app`.

For local setup, `rer dev` prints the private first-owner sign-in link on its own `RER_OPEN` line.

After stopping dev, run `rer verify`. `rer reset --yes` removes local data and generated settings; export first if you need the data.

On the app origin, `/` is the Lobby, `/setup` is first-run setup, `/docs` is public documentation, and `/app` is the private operator console. The separate marketing site is `https://run-uptime.com/`, with its `/run` page; that site is not the app Lobby.

```sh
rer export --output exports/uptime.rer
rer import --input exports/uptime.rer --yes
```

Import requires an empty product-data destination whose receiving owner and private settings have already been established. On the receiving checkout, run `rer setup --owner-email EMAIL --non-interactive` before `rer import --input exports/uptime.rer --yes`; monitors stay paused and destinations disabled. An archive exported by Uptime 0.1.2 or earlier is refused (exit 4) with a plain message: re-export it from the upgraded installation first. Use the [archive readback commands](docs/data.md#check-your-backup) to check the exported monitor names.

Stop dev or preview before any deployment command, including a dry run. An authorized owner-account deployment requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `OWNER_EMAIL` and the owner's name. On a fresh checkout run `rer deploy --owner-name "Your name"`, or omit the name flag if setup already saved it. Add `--dry-run` to check the required inputs and plan without provider requests. See the [deployment guide](docs/deploy.md) for mail inputs and saved environments. Use `rer describe` for the other commands and `rer check --profile first-party` for the structural contract.

## Set up Uptime for a business

After hosted setup with mail off, `rer signin` prints the one-time HTTPS owner sign-in link on its own line. Pass the hosted link to the business harness as `sign_in` in Uptime’s `tools[i]` entry in `session.report`. Keep the link out of chat and files.

To send alerts to the owner's inbox and no one else, deploy with `MAIL_PROVIDER`, a verified `MAIL_FROM` outside any zone you cannot change DNS for, its key and `MAIL_RECIPIENTS=owner` through `rer deploy` (see [Send alerts to the owner only](docs/deploy.md#send-alerts-to-the-owner-only)); never `wrangler secret put`. First check: add the owner address under **Settings › Alerts** and **Send test**.

Set Uptime up first, before the tools it will watch: it needs none of them. Wait for the owner's real email before running setup (`--owner-email`; a hosted deploy needs the same address as `OWNER_EMAIL`): setup refuses a different owner address afterwards instead of replacing it. Once it is set up, give it the company's old monitor targets. Use the company's public website as `UPTIME_START_URL`, **New monitor › Paste many URLs or a CSV**, or a file from the old service under **Settings › Backup and files**: an `uptime.monitors.json` definition file, or saved UptimeRobot, Pingdom, Better Stack or Site24x7 responses (imported monitors arrive paused until someone starts them).

Its first check after a new install: a monitor on the company's own domain reads **Healthy** once its first scheduled check passes; until a scheduled result arrives it reads Unknown. The console's state words are Healthy, Degraded, Failing and Unknown, and Healthy needs a passing check, never a missing one. A hosted installation cannot watch its own address from the Worker, but the company's domain is not that address. For the hosted Cron schedule, see [Pick the Cron schedule](docs/deploy.md#pick-the-cron-schedule). In short: keep the one-minute Cron, which costs about 6 D1 rows written for each check taken against Workers Free's 100,000 a day, and set monitor intervals to fit (eight one-minute monitors, or forty at five minutes); the schedule itself is the company manager's choice.

# Uptime contributor guidance

Read README.md, CONTRACT.md, BASELINE.md, ACCEPTANCE.md, OPERATIONS.md and HANDOVER.md before changing the application. The console uses TanStack Start documents, Hono private APIs, additive D1 migrations and a separately scoped signed Node runner.

Preserve immutable revisions, scheduled slot and attempt identity, fixed configured-probe coverage, scheduled-only incident thresholds, explicit Unknown state, network pinning, installation-local credential authority and inactive archive restore. Destination definitions, including available email addresses, and delivery histories that remain after erasure travel in archives; webhook and Slack URLs, signing keys, sessions and runner authority stay local. Destination erasure removes dependent notification history and archive-history copies, while its receipt and opaque audit entry remain. Missing evidence must never become Healthy; imported alerts must never replay. Every private document and operation must check server-side operator or scoped runner authority. Loopback binding and browser guards do not authenticate requests.

The rer adapter uses the shared Base lifecycle and generated rer-local-setup.json manifest. Hosted Managed setup uses root rer-setup.json. Run pnpm spec:generate after rer build to refresh the local manifest, deployment spec and descriptor digest; Verify rejects drift. Keep product policy in the edition and authentication in Base. Preserve owner identity, exact private settings and permanent migration history. Dev must provide real Vite assets and HMR. Keep owner-account deployment separate from the credential-free artifact controller. A command exit does not establish hosted operation or recipient acceptance.

Keep tests small and prove user flows through public routes or commands, with fakes only at network/provider edges. Never weaken assertions, special-case inputs or conceal failures with mock application code. Never commit secrets, private settings, owner archives or machine paths. Refresh source locks through the edition-authoring tool after intentional source changes.

## Contract documents

CONTRACT.md is the only acceptance text and status source. ACCEPTANCE.md and docs/CLAIMS.md are generated from it; after a contract change, run these from the repository root, then commit the generated files with the contract:

Lander-Regenerate: node src/base/contract-docs.mjs write
Lander-Regenerate: node scripts/edition-authoring/cli.mjs lock
