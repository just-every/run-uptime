**Or let Run Edit Run host it.** [Run Edit Run](https://app.runeditrun.com/?product=uptime&plan=assisted) can set Uptime up on your own Cloudflare account and keep it updated; sign-ups are by request for now.

You can deploy Uptime to your own Cloudflare account with one command. This page covers what you need, what the command creates, and how to confirm it worked. Stop local dev or preview before any deployment command, including a dry run: run `rer dev --stop` or `rer preview --stop` first.

## Managed hosting mail

For Managed hosting, RER supplies mail for sign-in links and email notifications through its relay. You do not need a mail-provider account or an API key to type. Configure fills and hides all four mail inputs: public `MAIL_PROVIDER=rer`, `MAIL_FROM` and `MAIL_RELAY_URL`, plus private `MAIL_API_KEY`. The key is a relay credential scoped to this installation and environment; RER keeps the upstream provider key. Assisted and Free hosting retain the existing SendGrid, Resend and Cloudflare Email Sending options.

The account credentials and provider mail inputs below apply when deploying to your own Cloudflare account.

## What you need

- A Cloudflare account ID and an API token for that account.
- An owner email address, for the person who will claim the installation.
- A verified sender and the API credential for Resend, SendGrid or Cloudflare Email Sending. These deployment inputs support ordinary email-link sign-in and email notifications. They are required when mail is enabled, even if you chose **Set up later** locally; choose `MAIL_PROVIDER=none` deliberately to operate without email.

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
rer deploy
```

The command builds Uptime without your Cloudflare credentials in the build environment, then creates the Worker `uptime-monitor-production`, the D1 database `uptime-monitor-production-db`, the database migrations and a one-minute Cron trigger in your account. Cloudflare assigns the hosted address.

When it finishes, it prints the hosted address with the Worker and environment, for example `deploy: https://uptime-monitor-production.your-subdomain.workers.dev (Worker uptime-monitor-production, environment production)`. With `--json` the same values are in the result.

To build and inspect the resource plan first, run:

```sh
rer deploy --dry-run
```

The terminal summary lists the Worker, D1 database and migration count, Cron triggers, and secret binding names. Use `rer deploy --dry-run --json` for the full plan, including migration names and digests, public variables, and pending variables. The plan uses saved mail and optional settings when present and otherwise uses your supplied inputs. Cloudflare assigns `UPTIME_ORIGIN` during a real deployment. The dry run makes no provider requests and generates no deployment secrets. The real deploy checks resource ownership and migration history.

This page covers the default Cloudflare Workers deployment. Uptime also declares the `container` platform in `deploy.json`; the shared CLI supports `--platform container` with `--host ssh://...` and optional `--image` for Docker deployment to an SSH host. That separate path has not been exercised end to end for Uptime. The hosted demo uses the declared container image; see [the demo notes](https://github.com/just-every/run-uptime/blob/main/DEMO.md) for its acceptance status.

If the Uptime upload or health-check stage stops part way, inspect the reported stage and code. What deployment already created is recorded in `.rer/deploy/<environment>.json`. Keep the ownership record and private settings, then rerun the same `rer deploy` command with the same environment to resume the deployment and inspect its outcome; it reuses the recorded resources and continues automatic owner claim and setup-token retirement after the deployed source and health are confirmed.

Uptime has no name or prefix input: the Worker is `uptime-monitor-<environment>` and D1 is `<worker>-db`; name a copy through `--environment` only (Run Edit Run fleet, 2026-11-16).

### A separate environment

`rer deploy --environment staging` deploys a second installation named `uptime-monitor-staging` with the database `uptime-monitor-staging-db`. An environment name starts with a lowercase letter and has at most 40 lowercase letters, digits and hyphens. Each environment keeps its own ownership record in `.rer/deploy/<environment>.json` and its private settings in `.rer/deploy/<environment>.secrets.env`. New environments generate their own session secret, setup token and runner key, so one environment's credentials cannot grant access to another. Repeat deployments reuse saved session and runner keys. Upgrading an existing environment preserves its deployed keys and saved owner and mail inputs; see the upgrade guidance below.

## Owner claim and sign-in

With rer's custom-deployment lifecycle, `rer deploy` wraps Uptime's custom deployment hook, claims the owner automatically, then retires the one-use hosted `SETUP_TOKEN`. Inspect the CLI's `claimed` or `kept` owner outcome and token-retirement result. After successful admission, open `/login` on the reported hosted address and request an ordinary email sign-in link. Opening the link shows a confirmation page; choosing **Confirm** signs you in. Finish first-run setup at `/setup`, then use the console at `/app`. Permanent owner admission survives token retirement even before setup is finished, and remains claimed if the original owner is later erased.

This checkout pins the unmodified published `@runeditrun/rer` in [`package.json`](https://github.com/just-every/run-uptime/blob/main/package.json). The lifecycle wraps Uptime's upload and health-check hook to perform owner claim and token retirement. If automatic claim or token retirement is incomplete, retain `.rer/deploy/<environment>.json` and private settings, rerun the same `rer deploy --environment NAME`, and inspect the new stage, owner outcome and retirement result. Do not enter a retired token at `/claim` as routine recovery.

If mail is deliberately off, use guarded `rer signin` from the deploying checkout as described below. For an enabled provider whose mail is unavailable, restore the configured sender and verify the owner's email address, then request a new link at `/login`. Keep the deployment records and existing private settings when updating mail configuration; an ordinary update preserves the admitted owner.

## Check it

```sh
rer run --script scripts/deployment/owner-cli.mjs health
```

Run this from the installed deployment checkout with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` available. For another environment, pass its name: `rer run --script scripts/deployment/owner-cli.mjs health --environment staging`. The installer supplies the Node runtime for these commands. Health checks your deployment through Cloudflare without changing hosted resources. A passing result tells you the database is ready and the deployment is the one you expect. It does not tell you the runner is working, that your targets are healthy, or that an email reached a person.

## Hosted checks and the private runner

Public website checks and notifications (email, signed JSON and Slack) run automatically in the deployed Cloudflare Worker. While the owner console is open, its requests prompt due checks and sends. The one-minute Cron schedule continues work without the console, but Cloudflare can take up to about two hours to activate the trigger after deployment; this is not a promise of delivery within a minute.

A private runner is required for heartbeats and website discovery, as well as private targets and runner-local credentials. Before using **Website to monitor** on a hosted installation, start that runner; otherwise choose **Fill in the form yourself** and create public monitors for the Worker. Add a runner when checks need a network you control or browser execution. In **Runner / Archive**, create a runner for its independent network and save the complete one-time command; paste it into a shell from an installed Uptime checkout on that network. Keep it under a supervisor and inspect its contact and actual results. Deployment does not start or supervise that separate process. Follow [The private runner](/docs/runner).

To start the original deployment runner from the checkout holding that environment's private settings, use the exact HTTPS origin printed by deployment, without a path or trailing slash:

```sh
export UPTIME_CONTROL_ORIGIN='https://your-uptime-address.example'
rer run --script scripts/runner-start.mjs --environment production
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

Export a hosted product archive from the owner console and back up D1 before removal; keep private settings separately. D1 deletion permanently destroys the installation's monitors and history. Use:

```sh
rer deploy --environment NAME --remove --yes
```

The command validates the selected environment's recorded ownership before deleting its Worker and D1 database, then reads back their absence. Its Cron trigger belongs to the Worker; Uptime creates no R2 buckets, queues, KV namespaces or Workflows. Inspect the command's outcome rather than assuming a successful request means everything is gone. After successful removal, rer deletes that environment's `.rer/deploy/<environment>.secrets.env`. A later deployment creates a new installation with fresh generated keys. Keep the private backup if you need the saved owner and mail inputs, and supply those inputs again when recreating the environment.

A resource with a familiar name but mismatched identity must not be adopted or deleted. If ownership cannot be established or removal is incomplete, keep the ownership record and settings; incomplete removal retains the record for recovery. Use manual provider inspection to reconcile that specific outcome. Keep other environments' records and settings. Manual deletion is not the routine removal procedure.

## About verification

Local checks cover the deploy command and the installer. One fresh-account hosted installation of version 0.1.1 has been exercised end to end: claim, email sign-in, a signed runner, and down and recovery emails. Its first deploy attempt stopped part way and completed on the documented resume. If something does not behave as written here, open an issue at https://github.com/just-every/run-uptime.

On a fresh checkout, unattended deployment with the pinned rer version also needs `--owner-name "Your name"` unless setup already saved that owner name. The CLI asks interactively when needed and keeps the answer for later deploys; it refuses before uploading when an unattended run has no name.

## Deliberately run without outbound email

Select `MAIL_PROVIDER=none` in the hosted setup or the deploying checkout's private environment file. Leave `MAIL_FROM`, provider keys, relay URL, account ID and DKIM inputs absent. An omitted selector uses the declared default `none`; `none` together with sending credentials is refused before upload. Existing enabled installations must retain or explicitly select their provider. The deployment binds `MAIL_PROVIDER=none` to the Worker. Local dev and demo keep their existing development mail behavior.

With mail off, use `rer signin` (or `rer signin --environment NAME`) from the checkout that deployed this environment, with that deploying account's Cloudflare credentials and its saved deployment record. Base checks the recorded Worker, account, project, environment and ownership receipt before issuing a short-lived owner grant. Keep the terminal link private; it is never an invitation or a hosted local-development entry. Losing the deploying checkout's receipt requires restoring that receipt, not bypassing ownership.

First-run setup, monitor checks, incident recovery and Settings remain available. Email-link and invitation requests return `503 mail_unavailable`, including for unknown addresses. Email alerts remain unavailable and are never recorded as sent; configure another supported destination for delivery. Webhook and Slack delivery keep their existing configuration requirements. Optional operations sign-in mail reports off; required delivery loops cannot claim readiness while off.

### Enable email later or switch back to none

This checkout declares public `MAIL_PROVIDER` with default `none` and optional secret transport on rer 0.2.121. On the existing deployment checkout, keep the same account credentials, environment, ownership receipt and private settings. Stop dev or preview first. Put the verified sender and SendGrid credential into an owned mode-0600 `deploy.env` file, with `MAIL_FROM` and `SENDGRID_API_KEY` entries. Keep that file out of Git. Enable email on the same Worker with:

```sh
rer deploy --set-secret MAIL_PROVIDER=sendgrid --set-secret MAIL_FROM --set-secret SENDGRID_API_KEY --env-file deploy.env
```

Add `--environment NAME` for a named environment. Public selector values may appear inline; credentials come from the environment or the private file. The grouped change copies the existing Worker code into one version and retains the admitted owner, database and installation keys. A plain `rer deploy` preserves the selected provider. For a fresh enabled deployment, select `MAIL_PROVIDER=sendgrid` explicitly with its sender and key; a key without a selector does not select SendGrid.

Switch that SendGrid installation back to the declared mail-off default and remove its sending inputs together:

```sh
rer deploy --unset-secret MAIL_PROVIDER,MAIL_FROM,SENDGRID_API_KEY
```

Run the unset command without the enabling `--env-file` and remove sending inputs from your shell. It removes the Worker overrides and restores public `MAIL_PROVIDER=none` in the same Worker version; a subsequent plain deploy stays off. The command does not rewrite Uptime's private input file: remove obsolete sender, key and selector entries from `.rer/deploy/<environment>.secrets.env` when retiring email, preserving owner and installation keys. Guarded `rer signin` remains available. To turn off another provider, also unset that provider's declared sending inputs; never leave a sending credential with `none`.

Inspect local deployment inputs, with the same default, using `rer run --script scripts/deployment/ops-config.mjs`. This calls Base's operations inspector after applying the public default from `deploy.json`; Base's generic descriptor does not accept `none` as a `whenUnset` entry. Explicit SendGrid, Resend and Cloudflare require their declared sender and credential inputs; explicit or default `none` reports optional mail off. Run `rer check --profile first-party` for the structural contract. Hosted verification uses declaration-only synthetic SendGrid and sender stand-ins because Base supplies managed mail test keys there. Those stand-ins never enter a deployment plan or replace the public `none` default. These checks do not contact a provider or prove delivery. Verify actual email sign-in and recipient delivery separately after an authorized deployment.

— Run Edit Run fleet, 2026-11-16
