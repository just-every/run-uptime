You can deploy Uptime to your own Cloudflare account with one command. This page covers what you need, what the command creates, and how to confirm it worked. Stop local dev or preview before any deployment command, including a dry run: run `rer dev --stop` or `rer preview --stop` first.

## Managed hosting mail

For Managed hosting, RER supplies mail for sign-in links and email notifications through its relay. You do not need a mail-provider account or an API key to type. Configure fills and hides all four mail inputs: public `MAIL_PROVIDER=rer`, `MAIL_FROM` and `MAIL_RELAY_URL`, plus private `MAIL_API_KEY`. The key is a relay credential scoped to this installation and environment; RER keeps the upstream provider key. Assisted and Free hosting retain the existing SendGrid, Resend and Cloudflare Email Sending options.

The account credentials and provider mail inputs below apply when deploying to your own Cloudflare account.

## What you need

- A Cloudflare account ID and an API token for that account.
- An owner email address, for the person who will claim the installation.
- A verified sender and the API credential for Resend, SendGrid or Cloudflare Email Sending. These deployment inputs support ordinary email-link sign-in and email notifications, and are required even if you chose **Set up later** locally.

## Set the inputs

`rer deploy` reads the hosting and chosen mail inputs:

- `CLOUDFLARE_ACCOUNT_ID` is your Cloudflare account.
- `CLOUDFLARE_API_TOKEN` is a token that can deploy to that account.
- `OWNER_EMAIL` is the address of the first owner.
- `MAIL_FROM` is your verified sender.
- `MAIL_PROVIDER` selects `resend`, `sendgrid` (the existing-install default), or `cloudflare`.
- Resend uses `MAIL_PROVIDER_API_KEY`; SendGrid uses `SENDGRID_API_KEY`; Cloudflare Email Sending uses `CLOUDFLARE_MAIL_API_KEY` and `MAIL_ACCOUNT_ID`.
- rer 0.2.22 checks the selected provider's mail configuration before it builds. Supply `MAIL_PROVIDER`, `MAIL_FROM` and that provider's key in the environment or an `--env-file`. The shared `MAIL_API_KEY` input can also supply a direct provider's key; Uptime keeps it under the selected provider's name above. Updates may reuse an existing deployment's mail credential.
- Optional `UPTIME_START_URL` is a public `http` or `https` website for the owner to start with. Uptime asks the owner's runner to look at it when the owner opens first-run setup, and finishing setup opens the console on the monitors it proposes. A hosted address that is not public stops the deployment before anything is created. Set it before the first deploy: like the other saved inputs, it is kept in `.rer/deploy/<environment>.secrets.env` from then on (production: `.rer/deploy/production.secrets.env`). Without it, `/setup` offers the same box.
- Optional `UPTIME_HEARTBEAT_URL` enables the independent heartbeat described in [Watchers and independent checks](/docs/resilient-monitoring).

Uptime also needs three secrets of its own: `SESSION_SECRET`, `SETUP_TOKEN` and `UPTIME_RUNNER_KEY`. You do not make these up. They are generated for a new installation; later deployments reuse the environment's saved keys, while the one-use setup token is retired after owner claim. The sole kept settings file is `.rer/deploy/<environment>.secrets.env` (production: `.rer/deploy/production.secrets.env`), private with mode 0600 and excluded from Git. Keep it private and back it up separately from the database. Fresh installations create no legacy JSON settings files.

## Deploy

```sh
rer dev --stop
rer deploy
```

The command builds Uptime without your Cloudflare credentials in the build environment, then creates the Worker `uptime-monitor-production`, the D1 database `uptime-monitor-production-db`, the database migrations and a one-minute Cron trigger in your account. Cloudflare assigns the hosted address.

When it finishes, it prints the hosted address with the Worker and environment, for example `deploy: https://uptime-monitor-production.your-subdomain.workers.dev (Worker uptime-monitor-production, environment production)`. With `--json` the same values are in the result.

To build and inspect the resource plan first, run:

```sh
rer deploy --dry-run
```

The plan names the Worker, D1 database, migration names and digests, Cron triggers, public variables and secret bindings (names only). It uses saved mail and optional settings when present; otherwise it uses your supplied inputs. It makes no provider requests and does not generate deployment secrets. Cloudflare assigns the hosted origin during a real deployment, so `UPTIME_ORIGIN` is listed as pending. The plan does not establish whether those resources already exist, who owns them, or which migrations have already run; the real deploy checks that state. With `--json`, the result includes `plan` and `pendingVariables`.

This page covers the default Cloudflare Workers deployment. Uptime also declares the `container` platform in `deploy.json`; the shared CLI supports `--platform container` with `--host ssh://...` and optional `--image` for Docker deployment to an SSH host. That separate path has not been exercised end to end for Uptime. The hosted demo uses the declared container image; see [the demo notes](https://github.com/just-every/run-uptime/blob/main/DEMO.md) for its acceptance status.

If the Uptime upload or health-check stage stops part way, inspect the reported stage and code. What deployment already created is recorded in `.rer/deploy/<environment>.json`. Keep the ownership record and private settings, then rerun the same `rer deploy` command with the same environment to resume the deployment and inspect its outcome; it reuses the recorded resources and continues automatic owner claim and setup-token retirement after the deployed source and health are confirmed.

### A separate environment

`rer deploy --environment staging` deploys a second installation named `uptime-monitor-staging` with the database `uptime-monitor-staging-db`. An environment name starts with a lowercase letter and has at most 40 lowercase letters, digits and hyphens. Each environment keeps its own ownership record in `.rer/deploy/<environment>.json` and its private settings in `.rer/deploy/<environment>.secrets.env`. New environments generate their own session secret, setup token and runner key, so one environment's credentials cannot grant access to another. Repeat deployments reuse saved session and runner keys. Upgrading an existing environment preserves its deployed keys and saved owner and mail inputs; see the upgrade guidance below.

## Owner claim and sign-in

With rer's newer custom-deployment lifecycle (0.2.3 and later), `rer deploy` wraps Uptime's custom deployment hook, claims the owner automatically, then retires the one-use hosted `SETUP_TOKEN`. Inspect the CLI's `claimed` or `kept` owner outcome and token-retirement result. After successful admission, open `/login` on the reported hosted address and request an ordinary email sign-in link. Opening the link shows a confirmation page; choosing **Confirm** signs you in. Finish first-run setup at `/setup`, then use the console at `/app`. Permanent owner admission survives token retirement even before setup is finished, and remains claimed if the original owner is later erased.

This checkout pins the unmodified published `@runeditrun/rer` exactly 0.2.66. The lifecycle wraps Uptime's upload and health-check hook to perform owner claim and token retirement. If automatic claim or token retirement is incomplete, retain `.rer/deploy/<environment>.json` and private settings, rerun the same `rer deploy --environment NAME`, and inspect the new stage, owner outcome and retirement result. Do not enter a retired token at `/claim` as routine recovery.

If mail is unavailable, restore the configured mail sender and verify the owner's email address, then request a new link at `/login`. Keep the deployment records and existing private settings when updating mail configuration; an ordinary update preserves the admitted owner.

## Check it

```sh
node scripts/deployment/owner-cli.mjs health
```

Run this from the installed deployment checkout under Node 22.20.0 with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` available. For another environment, pass its name: `node scripts/deployment/owner-cli.mjs health --environment staging`. This avoids requiring `pnpm` on your shell's PATH. If pnpm is available, `pnpm run health -- --environment staging` runs the same command; its forwarded `--` is accepted. Health checks your deployment through Cloudflare without changing hosted resources. A passing result tells you the database is ready and the deployment is the one you expect. It does not tell you the runner is working, that your targets are healthy, or that an email reached a person.

## Hosted checks and the private runner

Public website checks and notifications (email, signed JSON and Slack) run automatically in the deployed Cloudflare Worker. While the owner console is open, its requests prompt due checks and sends. The one-minute Cron schedule continues work without the console, but Cloudflare can take up to about two hours to activate the trigger after deployment; this is not a promise of delivery within a minute.

A private runner is required for heartbeats and website discovery, as well as private targets and runner-local credentials. Before using **Website to monitor** on a hosted installation, start that runner; otherwise choose **Fill in the form yourself** and create public monitors for the Worker. Add a runner when checks need a network you control or browser execution. In **Runner / Archive**, create a runner for its independent network and save the complete one-time command; paste it into a shell from an installed Uptime checkout on that network. Keep it under a supervisor and inspect its contact and actual results. Deployment does not start or supervise that separate process. Follow [The private runner](/docs/runner).

To start the original deployment runner from the checkout holding that environment's private settings, use the exact HTTPS origin printed by deployment, without a path or trailing slash:

```sh
export UPTIME_CONTROL_ORIGIN='https://your-uptime-address.example'
node scripts/runner-start.mjs --environment production
```

For a named environment, replace `production` with its name and use its own hosted origin. The wrapper reads the environment's saved runner key privately. An added runner instead uses the complete command from its console dialog, including its own ID, key and network label.

## Update an existing deployment

Use the checkout that owns the existing deployment. Start with a clean tracked tree and preserve `.rer/deploy/<environment>.json`, the private `.rer/deploy/<environment>.secrets.env` and backups. If the checkout still has legacy JSON settings, preserve those too until deployment migrates them. Resolve local changes before updating; do not delete deployment records or replace private settings.

On the public `main` branch, obtain newer public source:

```sh
git status --short
git pull --ff-only origin main
```

Alternatively, fetch from the public repository and check out a reviewed public commit. Refresh dependencies with `rer install` if the newer source requires it.

The next deploy automatically moves legacy `.rer/deploy/production-secrets.json` and `.rer/deploy/environments/<environment>/secrets.json` settings into rer's `.rer/deploy/<environment>.secrets.env` files. No manual conversion is needed. The move preserves `OWNER_EMAIL`, `MAIL_FROM`, `SENDGRID_API_KEY` and every environment's saved keys and inputs; production keys are not regenerated. It verifies the saved values before removing the old JSON files, then stops reading or recreating them.

If a legacy value differs from a value rer already keeps, deployment stops with the key name and file paths, without printing either value or overwriting rer's value. The legacy files remain available until the move is verified. Resolve the reported conflict privately, preserving the intended deployed credentials, then rerun the same deploy command. Do not use `--rotate-secret` to perform this migration: rotation signs operators out and invalidates the runner key.

Then redeploy the same environment:

```sh
rer deploy --environment NAME
node scripts/deployment/owner-cli.mjs health --environment NAME
```

Compare the recorded Worker and D1 identities before and after; an update retains the same resources, owner, monitors, history, destinations and saved private settings while applying additive migrations and the new code. Inspect deployment readback and health, including the deployed-source identity matching the reviewed public commit, then test ordinary email sign-in at `/login`. Unfinished owners should reach `/setup`; completed owners should reach `/app` with their existing monitors and history. Check runner contact and actual results separately. Deployment does not update or supervise the private runner's host.

## Remove a deployment

Export a hosted product archive from the owner console and back up D1 before removal; keep private settings separately. D1 deletion permanently destroys the installation's monitors and history. Use:

```sh
rer deploy --environment NAME --remove --yes
```

The command validates the selected environment's recorded ownership before deleting its Worker and D1 database, then reads back their absence. Its Cron trigger belongs to the Worker; Uptime creates no R2 buckets, queues, KV namespaces or Workflows. Inspect the command's outcome rather than assuming a successful request means everything is gone. After successful removal, rer deletes that environment's `.rer/deploy/<environment>.secrets.env`. A later deployment creates a new installation with fresh generated keys. Keep the private backup if you need the saved owner and mail inputs, and supply those inputs again when recreating the environment.

A resource with a familiar name but mismatched identity must not be adopted or deleted. If ownership cannot be established or removal is incomplete, keep the ownership record and settings; incomplete removal retains the record for recovery. Use manual provider inspection to reconcile that specific outcome. Keep other environments' records and settings. Manual deletion is not the routine removal procedure.

## About verification

Local checks cover the deploy command and the installer. One fresh-account hosted installation of version 0.1.1 has been exercised end to end: claim, email sign-in, a signed runner, and down and recovery emails. Its first deploy attempt stopped part way and completed on the documented resume. If something does not behave as written here, open an issue at https://github.com/just-every/run-uptime.

On a fresh checkout, unattended deployment with rer 0.2.54 or later also needs `--owner-name "Your name"` unless setup already saved that owner name. The CLI asks interactively when needed and keeps the answer for later deploys; it refuses before uploading when an unattended run has no name.
