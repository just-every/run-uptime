You can deploy Uptime to your own Cloudflare account with one command. This page covers what you need, what the command creates, and how to confirm it worked. One thing to know up front: the hosted path is implemented, but no fresh-account hosted installation has been verified yet, so treat your first deployment as a careful one.

## What you need

- A Cloudflare account ID and an API token for that account.
- An owner email address, for the person who will claim the installation.
- A verified sender and the API credential for Resend, SendGrid or Cloudflare Email Sending. Hosted sign-in uses email links, so this is required even if you chose **Set up later** for email on your own computer.

## Set the inputs

`node scripts/rer.mjs deploy` reads the hosting and chosen mail inputs:

- `CLOUDFLARE_ACCOUNT_ID` is your Cloudflare account.
- `CLOUDFLARE_API_TOKEN` is a token that can deploy to that account.
- `OWNER_EMAIL` is the address of the first owner.
- `MAIL_FROM` is your verified sender.
- `MAIL_PROVIDER` selects `resend`, `sendgrid` (the existing-install default), or `cloudflare`.
- Resend uses `MAIL_PROVIDER_API_KEY`; SendGrid uses `SENDGRID_API_KEY`; Cloudflare Email Sending uses `CLOUDFLARE_MAIL_API_KEY` and `MAIL_ACCOUNT_ID`.
- Optional `UPTIME_HEARTBEAT_URL` enables the independent heartbeat described in [Watchers and independent checks](/docs/resilient-monitoring).

Uptime also needs three secrets of its own: `SESSION_SECRET`, `SETUP_TOKEN` and `UPTIME_RUNNER_KEY`. You do not make these up. They are generated for a new installation, or reused from `.rer/deploy/production-secrets.json` if you have deployed before. Keep that file private and back it up separately from the database.

## Deploy

```sh
node scripts/rer.mjs deploy
```

The command builds Uptime without your Cloudflare credentials in the build environment, then creates the Worker `uptime-monitor-production`, the D1 database `uptime-monitor-production-db`, the database migrations and a one-minute Cron trigger in your account. Cloudflare assigns the hosted address.

When it finishes, it reports the hosted address. Add `--dry-run` first if you want to see the plan without any provider requests.

## Claim the installation

Open `/claim` on the hosted address once and enter the `SETUP_TOKEN` from `.rer/deploy/production-secrets.json` to create the owner. Then finish first-run setup at `/setup`. After that, sign in with an email link. The console is at `/app`.

## Check it

```sh
pnpm run health
```

This is read-only and checks your deployment through Cloudflare. A passing result tells you the database is ready and the deployment is the one you expect. It does not tell you the runner is working, that your targets are healthy, or that an email reached a person.

## Start the runner

Deploying does not run the private runner. Checks do not happen until you start it on a machine that can reach your targets. Follow [The private runner](/docs/runner).

## About verification

Local checks cover the deploy command and the installer, but nobody has yet verified a fresh-account hosted installation end to end. If something does not behave as written here, open an issue at https://github.com/just-every/uptime-monitor.
