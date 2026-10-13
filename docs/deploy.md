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

If a deployment stops part way, the command ends with `owner_deploy_failed`, the stage it stopped in (provisioning, migrations and upload, or the health check) and a short code from the deployment kit. What it already created is recorded in `.rer/deploy/<environment>.json`. Run the same command again to resume; it reuses what exists and does not create a second copy.

### A separate environment

`rer deploy --environment staging` deploys a second installation named `uptime-monitor-staging` with the database `uptime-monitor-staging-db`. An environment name starts with a lowercase letter and has at most 40 lowercase letters, digits and hyphens. Each environment keeps its own ownership record in `.rer/deploy/<environment>.json`, but the three generated secrets are shared: every environment deployed from this checkout uses `.rer/deploy/production-secrets.json`.

## Claim the installation

Open `/claim` on the hosted address once and enter the `SETUP_TOKEN` from `.rer/deploy/production-secrets.json` to create the owner. Then finish first-run setup at `/setup`. After that, sign in with an email link: opening the link shows a confirmation page, and choosing **Confirm** finishes signing in. Opening the link alone does not sign you in. The console is at `/app`.

## Check it

```sh
pnpm run health
```

For another environment, pass its name: `pnpm run health -- --environment staging`. This is read-only and checks your deployment through Cloudflare. A passing result tells you the database is ready and the deployment is the one you expect. It does not tell you the runner is working, that your targets are healthy, or that an email reached a person.

## Start the runner

Deploying does not run the private runner. Checks do not happen until you start it on a machine that can reach your targets. Follow [The private runner](/docs/runner).

## Remove a deployment

Uptime never deletes anything in your Cloudflare account. A deployment owns exactly two things: the Worker `uptime-monitor-<environment>` (its Cron trigger is part of the Worker) and the D1 database `uptime-monitor-<environment>-db`. It creates no R2 buckets, queues, KV namespaces or Workflows. Deleting the database deletes its monitors and history for good, so export an archive first.

1. List what is in the account and find the two names. The D1 list is paginated; keep asking for the next page until a page comes back with fewer than 100 results.

   ```sh
   curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts"
   curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database?per_page=100&page=1"
   ```

2. Check that the database ID matches the one recorded in `.rer/deploy/<environment>.json`. A Worker or database with the expected name but a different ID belongs to someone else; the deploy command refuses to adopt such a name, and you should not delete it.
3. Delete the Worker, then the database by its exact ID:

   ```sh
   curl -s -X DELETE -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/uptime-monitor-<environment>"
   curl -s -X DELETE -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/<database-id>"
   ```

4. List again and confirm both names are gone. Then remove `.rer/deploy/<environment>.json`, and the secrets file if no other environment uses it.

## About verification

Local checks cover the deploy command and the installer. One fresh-account hosted installation of version 0.1.1 has been exercised end to end: claim, email sign-in, a signed runner, and down and recovery emails. Its first deploy attempt stopped part way and completed on the documented resume. If something does not behave as written here, open an issue at https://github.com/just-every/run-uptime.
