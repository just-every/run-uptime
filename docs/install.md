Uptime runs on your own computer first, which is the quickest way to try it. This page takes you from a fresh clone to a signed-in console. When you are ready to run it for real, continue to [Deploy to Cloudflare](/docs/deploy).

## What you need

- Node exactly 22.20.0.
- pnpm 10.12.4.
- Git, to clone the source from https://github.com/just-every/uptime-monitor.

## Install and set up

Every step goes through one command, `rer`, run from the checkout. Clone Uptime, install its frozen dependencies and set it up:

```sh
git clone https://github.com/just-every/uptime-monitor.git uptime
cd uptime
node scripts/rer.mjs install
node scripts/rer.mjs setup --owner-email owner@example.test --owner-name "Local Owner" --non-interactive
```

Replace the example address with your own. Setup builds Uptime, applies the local database migrations, saves your private settings in `data/local-secrets.json` and creates the first owner, then prints `RER_SETUP_READY` and stops. Running it again keeps your owner, data and settings, and refuses a different owner or address instead of replacing them.

## Start it

```sh
node scripts/rer.mjs dev
```

Dev starts Uptime with its private runner and a practice target, and prints a link that opens the console signed in. Control-C stops all of them.

### Sign in and finish setup

1. Open the `RER_OPEN` link that dev printed in a browser on this computer. It carries this checkout's private key in its fragment, so keep it to yourself; you land signed in as the owner.
2. First-run setup opens at `/setup`. Choose **Finish setup**.

The console is then at `/app`. A small dev badge switches to the `member` dev operator (who has no console access) or signs out. To try the ordinary email sign-in instead, run dev with `--login`: it prints a key-carrying link to the development outbox, where you choose the newest sign-in message and follow its link (no email is sent). From another terminal, `node scripts/rer.mjs outbox` prints that link again.

## Look after the settings file

`data/local-secrets.json` is private and ignored by Git. Keep it with any local backup you want to resume from, and do not edit or share it. Your data lives in `.wrangler/state`. To start again, export first, then run `node scripts/rer.mjs reset --yes`, which removes only local data and generated settings.

## What next

Checks run only while the [private runner](/docs/runner) is running. Dev starts one for you. To put Uptime on the internet, follow [Deploy to Cloudflare](/docs/deploy).
