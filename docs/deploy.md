You can deploy Uptime to your own Cloudflare account with one command. This page covers what you need, what the command creates, and how to confirm it worked. One thing to know up front: the hosted path has been exercised end to end only once, so treat your first deployment as a careful one.

## What you need

- A Cloudflare account ID and an API token for that account.
- An owner email address, for the person who will claim the installation.
- A verified sender and the API credential for Resend, SendGrid or Cloudflare Email Sending. Hosted sign-in uses email links, so this is required even if you chose **Set up later** for email on your own computer.

## Set the inputs

`rer deploy` reads the hosting and chosen mail inputs:

- `CLOUDFLARE_ACCOUNT_ID` is your Cloudflare account.
- `CLOUDFLARE_API_TOKEN` is a token that can deploy to that account.
- `OWNER_EMAIL` is the address of the first owner.
- `MAIL_FROM` is your verified sender.
- `MAIL_PROVIDER` selects `resend`, `sendgrid` (the existing-install default), or `cloudflare`.
- Resend uses `MAIL_PROVIDER_API_KEY`; SendGrid uses `SENDGRID_API_KEY`; Cloudflare Email Sending uses `CLOUDFLARE_MAIL_API_KEY` and `MAIL_ACCOUNT_ID`.
- Optional `UPTIME_START_URL` is a public `http` or `https` website for the owner to start with. Uptime asks the owner's runner to look at it when the owner opens first-run setup, and finishing setup opens the console on the monitors it proposes. A hosted address that is not public stops the deployment before anything is created. Set it before the first deploy: like the other saved inputs, it is kept in `.rer/deploy/production-secrets.json` from then on. Without it, `/setup` offers the same box.
- Optional `UPTIME_HEARTBEAT_URL` enables the independent heartbeat described in [Watchers and independent checks](/docs/resilient-monitoring).

Uptime also needs three secrets of its own: `SESSION_SECRET`, `SETUP_TOKEN` and `UPTIME_RUNNER_KEY`. You do not make these up. They are generated for a new installation, or reused from `.rer/deploy/production-secrets.json` if you have deployed before. Keep that file private and back it up separately from the database.

## Deploy

```sh
rer deploy
```

The command builds Uptime without your Cloudflare credentials in the build environment, then creates the Worker `uptime-monitor-production`, the D1 database `uptime-monitor-production-db`, the database migrations and a one-minute Cron trigger in your account. Cloudflare assigns the hosted address.

When it finishes, it prints the hosted address with the Worker and environment, for example `deploy: https://uptime-monitor-production.your-subdomain.workers.dev (Worker uptime-monitor-production, environment production)`. With `--json` the same values are in the result. Add `--dry-run` first if you want to see the plan without any provider requests.

Cloudflare is the only place this command deploys to. Uptime declares no container platform, so the shared `--platform container`, `--host ssh://...` and `--image` options are refused for it; there is no Docker or SSH-host deployment.

If the Uptime upload or health-check stage stops part way, inspect the reported stage and code. What deployment already created is recorded in `.rer/deploy/<environment>.json`. Keep the ownership record and private settings, then rerun the same `rer deploy` command with the same environment to resume the deployment and inspect its outcome; it reuses the recorded resources. This does not add automatic owner claim under this checkout's pinned CLI.

### A separate environment

`rer deploy --environment staging` deploys a second installation named `uptime-monitor-staging` with the database `uptime-monitor-staging-db`. An environment name starts with a lowercase letter and has at most 40 lowercase letters, digits and hyphens. Each environment keeps its own ownership record in `.rer/deploy/<environment>.json`, but the three generated secrets are shared: every environment deployed from this checkout uses `.rer/deploy/production-secrets.json`.

## Owner claim and sign-in

With rer's newer custom-deployment lifecycle (0.2.3 and later), `rer deploy` wraps Uptime's custom deployment hook, claims the owner automatically, then retires the one-use hosted `SETUP_TOKEN`. Inspect the CLI's `claimed` or `kept` owner outcome and token-retirement result. After successful admission, open `/login` on the reported hosted address and request an ordinary email sign-in link. Opening the link shows a confirmation page; choosing **Confirm** signs you in. Finish first-run setup at `/setup`, then use the console at `/app`. Permanent owner admission survives token retirement even before setup is finished, and remains claimed if the original owner is later erased.

This checkout intentionally retains `@runeditrun/rer` 0.2.2, and `rer` commands use that pin; do not assume the older pin already auto-claims. Its Uptime deployment hook uploads the Worker and checks health, but does not automatically claim the owner or retire the token. The newer lifecycle wraps that hook to perform claim and retirement after deployment. Updating the pin is a separate dependency-adoption decision; repeating `rer deploy` with 0.2.2 may resume deployment but does not add automatic claim or retirement. The 0.2.2 CLI still supports this checkout's update, health-check and removal procedures. If automatic claim or token retirement is incomplete while using 0.2.3 or later, retain `.rer/deploy/<environment>.json` and private settings, rerun the same `rer deploy --environment NAME`, and inspect the new stage, owner outcome and retirement result. Do not enter a retired token at `/claim` as routine recovery.

## Check it

```sh
pnpm run health
```

For another environment, pass its name: `pnpm run health -- --environment staging`. This is read-only and checks your deployment through Cloudflare. A passing result tells you the database is ready and the deployment is the one you expect. It does not tell you the runner is working, that your targets are healthy, or that an email reached a person.

## Start the runner

Deploying does not run the private runner. Checks do not happen until you start it on a machine that can reach your targets. Follow [The private runner](/docs/runner).

## Update an existing deployment

Use the checkout that owns the existing deployment. Start with a clean tracked tree and preserve `.rer/deploy/<environment>.json` plus the private `.rer/deploy/production-secrets.json` and backups. Resolve local changes before updating; do not delete deployment records or replace private settings.

On the public `main` branch, obtain newer public source:

```sh
git status --short
git pull --ff-only origin main
```

Alternatively, fetch from the public repository and check out a reviewed public commit. Refresh dependencies with `rer install` if the newer source requires it, then redeploy the same environment:

```sh
rer deploy --environment NAME
pnpm run health -- --environment NAME
```

Compare the recorded Worker and D1 identities before and after; an update retains the same resources, owner, monitors, history, destinations and saved private settings while applying additive migrations and the new code. Inspect deployment readback and health, including the deployed-source identity matching the reviewed public commit, then test ordinary email sign-in at `/login`. Unfinished owners should reach `/setup`; completed owners should reach `/app` with their existing monitors and history. Check runner contact and actual results separately. Deployment does not update or supervise the private runner's host.

## Remove a deployment

Export a hosted product archive from the owner console and back up D1 before removal; keep private settings separately. D1 deletion permanently destroys the installation's monitors and history. Use:

```sh
rer deploy --environment NAME --remove --yes
```

The command validates the selected environment's recorded ownership before deleting its Worker and D1 database, then reads back their absence. Its Cron trigger belongs to the Worker; Uptime creates no R2 buckets, queues, KV namespaces or Workflows. Inspect the command's outcome rather than assuming a successful request means everything is gone.

A resource with a familiar name but mismatched identity must not be adopted or deleted. If ownership cannot be established or removal is incomplete, keep the ownership record and settings; incomplete removal retains the record for recovery. Use manual provider inspection to reconcile that specific outcome. Keep shared settings while other environments still use them. Manual deletion is not the routine removal procedure.

## About verification

Local checks cover the deploy command and the installer. One fresh-account hosted installation of version 0.1.1 has been exercised end to end: claim, email sign-in, a signed runner, and down and recovery emails. Its first deploy attempt stopped part way and completed on the documented resume. If something does not behave as written here, open an issue at https://github.com/just-every/run-uptime.
