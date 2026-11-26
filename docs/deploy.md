**Or let Run Edit Run host it.** [Run Edit Run](https://app.runeditrun.com/?product=uptime&plan=assisted) can set Uptime up on your own Cloudflare account and keep it updated; sign-ups are by request for now.

You can deploy Uptime to your own Cloudflare account with one command. This page covers what you need, what the command creates, and how to confirm it worked. Stop local dev or preview before any deployment command, including a dry run: run `rer dev --stop` or `rer preview --stop` first.

## Managed hosting mail

For Managed hosting, RER supplies mail for sign-in links and email notifications through its relay. You do not need a mail-provider account or an API key to type. Configure fills and hides all four mail inputs: public `MAIL_PROVIDER=rer`, `MAIL_FROM` and `MAIL_RELAY_URL`, plus private `MAIL_API_KEY`. The key is a relay credential scoped to this installation and environment; RER keeps the upstream provider key. Assisted and Free hosting retain the existing SendGrid, Resend and Cloudflare Email Sending options.

The account credentials and provider mail inputs below apply when deploying to your own Cloudflare account.

## What you need

- Your Cloudflare account ID.
- An API token scoped to that account.
- Your first owner's email address.
- Your first owner's name. Give it with `--owner-name "Your name"` on a fresh checkout unless setup already saved it.

When mail is enabled, also provide a verified sender and the selected provider's credentials, even if you chose **Set up later** locally. Choose `MAIL_PROVIDER=none` to operate without email.

## Set the inputs

`rer deploy` reads the hosting and chosen mail inputs:

- `CLOUDFLARE_ACCOUNT_ID` is your Cloudflare account.
- `CLOUDFLARE_API_TOKEN` needs the account permission groups **Workers Scripts: Edit** and **D1: Edit**, scoped to the account being deployed to (Run Edit Run fleet, 2026-11-16).
- `OWNER_EMAIL` is the address of the first owner.
- `MAIL_FROM` is your verified sender when email is enabled.
- `MAIL_PROVIDER` selects `resend`, `sendgrid`, `cloudflare`, managed `rer`, or `none` (the default when unset; email off).
- Resend uses `MAIL_PROVIDER_API_KEY`; SendGrid uses `SENDGRID_API_KEY`; Cloudflare Email Sending uses `CLOUDFLARE_MAIL_API_KEY` and `MAIL_ACCOUNT_ID`.
- rer checks the selected provider's mail configuration before it builds. For enabled email, supply `MAIL_PROVIDER`, `MAIL_FROM` and that provider's key in the environment or an `--env-file`. The shared `MAIL_API_KEY` input can also supply a direct provider's key; Uptime keeps it under the selected provider's name above. Updates may reuse an existing deployment's mail credential.
- Optional `UPTIME_START_URL` is a public `http` or `https` website for the owner to start with. Uptime asks the owner's runner to look at it when the owner opens first-run setup, and finishing setup opens the console on the monitors it proposes. A hosted address that is not public stops the deployment before anything is created. Set it before the first deploy: like the other saved inputs, it is kept in `.rer/deploy/<environment>.secrets.env` from then on (production: `.rer/deploy/production.secrets.env`). Without it, `/setup` offers the same box.
- Optional `UPTIME_HEARTBEAT_URL` enables the independent heartbeat described in [Watchers and independent checks](/docs/resilient-monitoring).

Uptime also needs three secrets of its own: `SESSION_SECRET`, `SETUP_TOKEN` and `UPTIME_RUNNER_KEY`. You do not make these up. They are generated for a new installation; later deployments reuse the environment's saved keys, while the one-use setup token is retired after owner claim. The sole kept settings file is `.rer/deploy/<environment>.secrets.env` (production: `.rer/deploy/production.secrets.env`), private with mode 0600 and excluded from Git. Keep it private and back it up separately from the database. Fresh installations create no legacy JSON settings files.

## Deploy

```sh
rer dev --stop
rer deploy --owner-name "Your name"
```

The command builds Uptime without your Cloudflare credentials in the build environment, then creates the Worker `uptime-monitor-production`, the D1 database `uptime-monitor-production-db`, the database migrations and a one-minute Cron trigger in your account. Cloudflare assigns the hosted address.

Before provisioning, `rer deploy` reads your Cloudflare Workers account settings. Workers Paid uploads include the `limits.cpu_ms` of `30000` from `wrangler.jsonc`. Workers Free uses Cloudflare’s default. If Cloudflare cannot confirm the plan, deployment stops. The dry run checks the compiled limit offline. Read the [Worker’s settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/) after deploying to confirm `result.limits.cpu_ms`.

When it finishes, it prints the hosted address with the Worker and environment, for example `deploy: https://uptime-monitor-production.your-subdomain.workers.dev (Worker uptime-monitor-production, environment production)`. With `--json` the same values are in the result.

To build and inspect the resource plan first, run:

```sh
rer deploy --owner-name "Your name" --dry-run
```

The terminal summary lists the Worker, D1 database and migration count, Cron triggers, and secret binding names. Add `--json` for the full plan, including migration names and digests, public variables, and pending variables. If the dry run reports any required inputs, supply them before deploying. Current source exits 3 in that case; Uptime 0.5.23 can exit 0 while listing what is still needed. The dry run makes no provider requests and generates no deployment secrets. Cloudflare assigns `UPTIME_ORIGIN` and checks resource ownership and migration history during the real deployment.

This page covers the default Cloudflare Workers deployment. Uptime also declares the `container` platform in `deploy.json`; the shared CLI supports `--platform container` with `--host ssh://...` and optional `--image` for Docker deployment to an SSH host. That separate path has not been exercised end to end for Uptime. The hosted demo uses the declared container image; see [the demo notes](https://github.com/just-every/run-uptime/blob/main/DEMO.md) for its acceptance status.

If the Uptime upload or health-check stage stops part way, inspect the reported stage and code. What deployment already created is recorded in `.rer/deploy/<environment>.json`. Keep the ownership record and private settings, then rerun the same `rer deploy` command with the same environment to resume the deployment and inspect its outcome; it reuses the recorded resources and continues automatic owner claim and setup-token retirement after the deployed source and health are confirmed.

Uptime has no name or prefix input: the Worker is `uptime-monitor-<environment>` and D1 is `<worker>-db`; name a copy through `--environment` only (Run Edit Run fleet, 2026-11-16).

### A separate environment

`rer deploy --environment staging --owner-name "Your name"` deploys a second installation named `uptime-monitor-staging` with the database `uptime-monitor-staging-db`. An environment name starts with a lowercase letter and has at most 40 lowercase letters, digits and hyphens. Each environment keeps its own ownership record in `.rer/deploy/<environment>.json` and its private settings in `.rer/deploy/<environment>.secrets.env`. New environments generate their own session secret, setup token and runner key, so one environment's credentials cannot grant access to another. Repeat deployments reuse saved session and runner keys. Upgrading an existing environment preserves its deployed keys and saved owner and mail inputs; see the upgrade guidance below.

## Owner claim and sign-in

With rer's custom-deployment lifecycle, `rer deploy` wraps Uptime's custom deployment hook, claims the owner automatically, then retires the one-use hosted `SETUP_TOKEN`. Inspect the CLI's `claimed` or `kept` owner outcome and token-retirement result. After successful admission, open `/login` on the reported hosted address and request an ordinary email sign-in link. Opening the link shows a confirmation page; choosing **Confirm** signs you in. Finish first-run setup at `/setup`, then use the console at `/app`. Permanent owner admission survives token retirement even before setup is finished, and remains claimed if the original owner is later erased.

This checkout pins the unmodified published `@runeditrun/rer` in [`package.json`](https://github.com/just-every/run-uptime/blob/main/package.json). The lifecycle wraps Uptime's upload and health-check hook to perform owner claim and token retirement. If automatic claim or token retirement is incomplete, retain `.rer/deploy/<environment>.json` and private settings, rerun the same `rer deploy --environment NAME`, and inspect the new stage, owner outcome and retirement result. Do not enter a retired token at `/claim` as routine recovery.

If mail is deliberately off, use guarded `rer signin` from the deploying checkout as described below. For an enabled provider whose mail is unavailable, restore the configured sender and verify the owner's email address, then request a new link at `/login`. Keep the deployment records and existing private settings when updating mail configuration; an ordinary update preserves the admitted owner.

## Check it

```sh
rer run --script scripts/deployment/owner-cli.mjs health
```

Run this from the installed deployment checkout with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` available. For another environment, pass its name: `rer run --script scripts/deployment/owner-cli.mjs health --environment staging`. The installer supplies the Node runtime for these commands. Health checks your deployment through Cloudflare without changing hosted resources. Wait for `rer deploy` to exit successfully before checking health. If the health command reports a locked deployment, repeat it after deploy finishes. A passing result tells you the database is ready and the deployment is the one you expect. It does not tell you the runner is working, that your targets are healthy, or that an email reached a person.

## Hosted checks and the private runner

Public website checks and notifications (email, signed JSON and Slack) run automatically in the deployed Cloudflare Worker. In the monitor form, choose at least **1** for **Check every (minutes)** whenever the Worker is selected under **Check from**. For the local walkthrough's six-second interval, select only private runners. The owner console prompts due checks and sends while Cron is activating. Once active, Cron runs every minute even when the console is closed. Cloudflare can take up to about two hours to activate the trigger after deployment.

A private runner is required for heartbeats and website discovery, as well as private targets and runner-local credentials. Before using **Website to monitor** on a hosted installation, start that runner; otherwise choose **Fill in the form yourself** and create public monitors for the Worker. When checks need a network you control or browser execution, open **Locations**, choose **Add location**, and run the complete one-time command on the machine that will run the checks. Keep the runner under a supervisor and check its contact in **Locations** and its results in the monitor's history. Follow [The private runner](/docs/runner).

To start the original deployment runner from the checkout holding that environment's private settings, use the exact HTTPS origin printed by deployment, without a path or trailing slash:

```sh
export UPTIME_CONTROL_ORIGIN='https://your-uptime-address.example'
rer run --script scripts/runner-start.mjs --environment production
```

For a named environment, replace `production` with its name and use its own hosted origin. The wrapper reads the environment's saved runner key privately. An added runner instead uses the complete command from its console dialog, including its own ID, key and network label.

## Pick the Cron schedule

`rer deploy` creates one Cron trigger, `* * * * *` (every minute), and Uptime has no setting for another schedule: a different one is set on the Worker's Cron trigger in Cloudflare after deployment, and read back there. The schedule is the company manager's choice. This is what a run costs, so the choice can be made on numbers.

Each run takes at most one scheduled check per due monitor. For four healthy public HTTP monitors at one minute, the current Worker's populated local D1 fixture measured about 190 rows read and 34 written per minute, with all four checks running every minute. Individual runs in the ten-minute cadence test read 162–250 rows.

Cloudflare's 0.5.29 measurements for four healthy one-minute monitors were about 258 rows read per minute with Cron alone and 782 with one Monitors list tab open, including Cron. A window with an outage and recovery averaged 1,076 with the list tab open. The 586 figure in the 0.5.29 release notes was for one **monitor detail** tab including Cron. These hosted measurements predate the cadence fix.

The remaining rows below are from the 0.5.27 local budget fixture. All figures assume one Cron invocation per minute, without retries or an external check.

| Monitors and interval | Rows read per run | Rows written per run | Rows read per day | Rows written per day |
| --- | --- | --- | --- | --- |
| 4 every 1 minute (current fixture) | 189 | 34 | 272,500 | 48,700 |
| 4 every 5 minutes | 77 | 6.5 | 111,000 | 9,400 |
| 10 every 5 minutes | 137 | 16 | 197,000 | 23,600 |
| 20 every 5 minutes | 235 | 33 | 338,000 | 46,900 |
| 10 every 1 minute | 417 | 83 | 600,000 | 119,500 |

Failing checks, incidents and notifications add work. The tighter limit on Workers Free is its published allowance of 100,000 D1 rows written per day. Prometheus scraping every 15 seconds adds about 11,500 rows written per day. Ten one-minute monitors alone exceed the free daily write allowance.

Recommendation: keep the one-minute Cron and set the monitors' own **Check every (minutes)**. A day then takes about 8 rows written for each check taken, so aim for no more than about 6,000 checks a day (60,000 rows written) to leave headroom: four monitors every minute, or twenty every five minutes. A slower Cron saves nothing a longer interval does not: each run still takes one check per due monitor, so a five-minute Cron checks a one-minute monitor every five minutes, delays alerts and recovery by up to five minutes, and has only the 35 outbound requests of its run (about seven healthy checks at the defaults, see [Limits](/docs/limits)) for every monitor due at once.

## Update an existing deployment

Use the checkout that owns the existing deployment. Start with a clean tracked tree and preserve `.rer/deploy/<environment>.json`, the private `.rer/deploy/<environment>.secrets.env` and backups. If the checkout still has legacy JSON settings, preserve those too until deployment migrates them. Resolve local changes before updating; do not delete deployment records or replace private settings.

On the public `main` branch, obtain newer public source:

```sh
git status --short
git pull --ff-only origin main
```

Alternatively, fetch from the public repository and check out a reviewed public commit. Refresh dependencies with `rer install` if the newer source requires it.

A legacy SendGrid installation that kept a key without a selector must explicitly choose SendGrid before updating. With the retained deployment checkout and its existing private inputs, run `MAIL_PROVIDER=sendgrid rer deploy --environment NAME`. The selector is public; keep the existing credential and installation keys. Without a selection, the new default is `none`, so a sending credential is refused with “Remove it or choose a mail provider.”

The next deploy automatically moves legacy `.rer/deploy/production-secrets.json` and `.rer/deploy/environments/<environment>/secrets.json` settings into rer's `.rer/deploy/<environment>.secrets.env` files. No manual conversion is needed. The move preserves `OWNER_EMAIL`, `MAIL_FROM`, `SENDGRID_API_KEY` and every environment's saved keys and inputs; production keys are not regenerated. It verifies the saved values before removing the old JSON files, then stops reading or recreating them.

The installation's own `SESSION_SECRET`, `SETUP_TOKEN` and `UPTIME_RUNNER_KEY` from the legacy files replace any unused copies rer generated beside them, because those are the keys the installation was deployed with; the deploy names the keys it kept, never their values. If any other legacy value, such as an owner or mail input, differs from a value rer already keeps, deployment stops with the key name and file paths, without printing either value or overwriting rer's value. The legacy files remain available until the move is verified. Resolve the reported conflict privately, preserving the intended deployed credentials, then rerun the same deploy command. Do not use `--rotate-secret` to perform this migration: rotation signs operators out and invalidates the runner key.

Then redeploy the same environment:

```sh
rer deploy --environment NAME
rer run --script scripts/deployment/owner-cli.mjs health --environment NAME
```

Compare the recorded Worker and D1 identities before and after; an update retains the same resources, owner, monitors, history, destinations and saved private settings while applying additive migrations and the new code. Inspect deployment readback and health, including the deployed-source identity matching the reviewed public commit, then test ordinary email sign-in at `/login`. Unfinished owners should reach `/setup`; completed owners should reach `/app` with their existing monitors and history. Check runner contact and actual results separately. Deployment does not update or supervise the private runner's host.

## Remove a deployment

Export a hosted product archive from **Settings › Backup and files** and back up D1 before removal. Keep both backups and the private settings somewhere private. Run this in the checkout that deployed the environment, with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` available. Replace `NAME` with the environment (`production` for the default):

```sh
(
  umask 077
  "$HOME/.local/bin/rer" run --script \
    ./node_modules/wrangler/bin/wrangler.js \
    d1 export uptime-monitor-NAME-db \
    --remote --output=./uptime-NAME.sql
)
```

`rer` runs the checkout's Wrangler with the Node runtime supplied by the one-line installer. Choose a new output file so it is created with private permissions. Check that the SQL file exists and contains the expected schema and data before removing the environment. D1 deletion permanently destroys the installation's monitors and history. See [Cloudflare's D1 export instructions](https://developers.cloudflare.com/d1/best-practices/import-export-data/#export-an-existing-d1-database).

```sh
rer deploy --environment NAME --remove --yes
```

The command validates the selected environment's recorded ownership before deleting its Worker and D1 database, then reads back their absence. Its Cron trigger belongs to the Worker; Uptime creates no R2 buckets, queues, KV namespaces or Workflows. Inspect the command's outcome rather than assuming a successful request means everything is gone. After successful removal, rer deletes that environment's `.rer/deploy/<environment>.secrets.env`. A later deployment creates a new installation with fresh generated keys. Keep the private backup if you need the saved owner and mail inputs, and supply those inputs again when recreating the environment.

A resource with a familiar name but mismatched identity must not be adopted or deleted. If ownership cannot be established or removal is incomplete, keep the ownership record and settings; incomplete removal retains the record for recovery. Use manual provider inspection to reconcile that specific outcome. Keep other environments' records and settings. Manual deletion is not the routine removal procedure.

## About verification

Local checks cover the deploy command and the installer. One fresh-account hosted installation of version 0.1.1 has been exercised end to end: claim, email sign-in, a signed runner, and down and recovery emails. Its first deploy attempt stopped part way and completed on the documented resume. If something does not behave as written here, open an issue at https://github.com/just-every/run-uptime.

## Deliberately run without outbound email

Select `MAIL_PROVIDER=none` in the hosted setup or the deploying checkout's private environment file. Leave `MAIL_FROM`, provider keys, relay URL, account ID and DKIM inputs absent. An omitted selector uses the declared default `none`; `none` together with sending credentials is refused before upload. Existing enabled installations must retain or explicitly select their provider. The deployment binds `MAIL_PROVIDER=none` to the Worker. Local dev and demo keep their existing development mail behavior.

With mail off, use `rer signin` (or `rer signin --environment NAME`) from the checkout that deployed this environment, with that deploying account's Cloudflare credentials and its saved deployment record. Base checks the recorded Worker, account, project, environment and ownership receipt before issuing a short-lived owner grant. Keep the terminal link private; it is never an invitation or a hosted local-development entry. Losing the deploying checkout's receipt requires restoring that receipt, not bypassing ownership.

First-run setup, monitor checks, incident recovery and Settings remain available. Email-link and invitation requests return `503 mail_unavailable`, including for unknown addresses. Email alerts remain unavailable and are never recorded as sent; configure another supported destination for delivery. Webhook and Slack delivery keep their existing configuration requirements. Optional operations sign-in mail reports off; required delivery loops cannot claim readiness while off.

### Enable email later or switch back to none

This checkout declares public `MAIL_PROVIDER` with default `none` and optional secret transport on rer 0.2.121. On the existing deployment checkout, keep the same account credentials, environment, ownership receipt and private settings. Stop dev or preview first. Put the verified sender and SendGrid credential into an owned mode-0600 `deploy.env` file, with `MAIL_PROVIDER=sendgrid`, `MAIL_FROM` and `SENDGRID_API_KEY` entries. Keep that file out of Git. Enable email on the same Worker with:

```sh
rer deploy --set-secret MAIL_PROVIDER --set-secret MAIL_FROM --set-secret SENDGRID_API_KEY --env-file deploy.env
```

Add `--environment NAME` for a named environment. `--set-secret` takes names only, never `NAME=value`: every value, the public `MAIL_PROVIDER` selector included, comes from the environment or the private file. The grouped change copies the existing Worker code into one version and retains the admitted owner, database and installation keys. A plain `rer deploy` preserves the selected provider. For a fresh enabled deployment, select `MAIL_PROVIDER=sendgrid` explicitly with its sender and key; a key without a selector does not select SendGrid.

### Send alerts to the owner only

Set public `MAIL_RECIPIENTS=owner` with the mail inputs and every message the installation sends goes to `OWNER_EMAIL` alone. A message to any other address (another alert destination, an invitation, a member notice) is refused before it reaches the provider and shows as rejected with `mail_input_invalid` (`rer_owner_recipient_required` on the RER relay, where Base's owner relay sender holds the guard). The default, `any`, keeps ordinary behaviour. With mail off (`MAIL_PROVIDER=none`) nothing is sent either way.

Use a sender that is not in a zone you cannot change DNS for: the RER relay (`MAIL_PROVIDER=rer`, with the assigned `MAIL_FROM`, `MAIL_RELAY_URL` and `MAIL_API_KEY`) or a SendGrid sender that is already verified. Put the key and the public values (`MAIL_PROVIDER=sendgrid`, `MAIL_RECIPIENTS=owner`, `MAIL_FROM`) in the private `--env-file`, never on the command line, and set it only through `rer deploy`: `wrangler secret put` or a settings PATCH makes rer's receipt stale and the next deploy refuses with `owned-resource-replaced`.

```sh
rer deploy --set-secret MAIL_PROVIDER --set-secret MAIL_RECIPIENTS --set-secret MAIL_FROM --set-secret SENDGRID_API_KEY --env-file deploy.env
```

The same inputs in the environment file (`MAIL_PROVIDER`, `MAIL_RECIPIENTS`, `MAIL_FROM`, `SENDGRID_API_KEY`) show in `rer deploy --dry-run` as secret bindings, so the plan can be checked first. Run `--set-secret` and `--dry-run` on separate runs.

First check: sign in as the owner, open **Settings › Alerts**, add an email destination with the owner address (the owner's own sign-in address needs no second factor), choose **Send test**, and read the drill message in the owner's inbox. Adding any other address and testing it must end rejected, with nothing sent.

Switch that SendGrid installation back to the declared mail-off default and remove its sending inputs together:

```sh
rer deploy --unset-secret MAIL_PROVIDER,MAIL_FROM,SENDGRID_API_KEY
```

Run the unset command without the enabling `--env-file` and remove sending inputs from your shell. It removes the Worker overrides and restores public `MAIL_PROVIDER=none` in the same Worker version; a subsequent plain deploy stays off. The command does not rewrite Uptime's private input file: remove obsolete sender, key and selector entries from `.rer/deploy/<environment>.secrets.env` when retiring email, preserving owner and installation keys. Guarded `rer signin` remains available. To turn off another provider, also unset that provider's declared sending inputs; never leave a sending credential with `none`.

Inspect local deployment inputs, with the same default, using `rer run --script scripts/deployment/ops-config.mjs`. This calls Base's operations inspector after applying the public default from `deploy.json`; Base's generic descriptor does not accept `none` as a `whenUnset` entry. Explicit SendGrid, Resend and Cloudflare require their declared sender and credential inputs; explicit or default `none` reports optional mail off. Run `rer check --profile first-party` for the structural contract. Hosted verification uses declaration-only synthetic SendGrid and sender stand-ins because Base supplies managed mail test keys there. Those stand-ins never enter a deployment plan or replace the public `none` default. These checks do not contact a provider or prove delivery. Verify actual email sign-in and recipient delivery separately after an authorized deployment.

— Run Edit Run fleet, 2026-11-16
