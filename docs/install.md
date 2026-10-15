Uptime runs on your own computer first, which is the quickest way to try it. This page takes you from a fresh clone to a signed-in console. When you are ready to run it for real, continue to [Deploy to Cloudflare](/docs/deploy).

## What you need

- Node 22 or later and pnpm 10.12.4.
- macOS, Linux or Windows with WSL2.
- Git, to clone the source from https://github.com/just-every/run-uptime.

The CLI selects the checkout's pinned Node 22.20.0 for application commands. Use that pinned runtime when running contributor commands directly with `node` or `pnpm`.

## Clone and start

Install `rer` once if it is not on your PATH:

```sh
npx -y @runeditrun/rer cli install
```

Then clone Uptime and start it:

```sh
git clone https://github.com/just-every/run-uptime.git uptime
cd uptime
rer dev
```

`rer dev` installs frozen dependencies and sets up a fresh checkout automatically. A first launch can take several minutes. If it is interrupted, run `rer dev` again to resume. It starts the app, private runner and practice target, then prints `RER_READY` and a signed-in `RER_OPEN` link. In an interactive terminal it stays in the foreground and Control-C stops it. From an agent or other non-interactive shell it returns once ready, leaving the app in the background. Use `rer dev --detach` to request a background run explicitly.

## Explicit owner setup

To choose an owner or supply setup answers yourself, run these before `rer dev`:

```sh
rer install
rer setup --owner-email EMAIL --owner-name "NAME" --non-interactive
```

Replace EMAIL and NAME with your own address and name. Setup builds Uptime, applies the local database migrations, saves your private settings in `data/local-secrets.json` and creates the first owner, then prints `RER_SETUP_READY` and stops its temporary processes. Running it again keeps your owner, data and settings, and refuses a different owner or address instead of replacing them.

### Start with a website

If you already know which site you want to watch, tell setup and Uptime will have monitors waiting for you. Save the address in a private file next to the checkout (`chmod 600 answers.json`):

```json
{"UPTIME_START_URL": "https://example.com"}
```

Then add `--answers answers.json` to the setup command above. Use a public `http` or `https` address; setup refuses one that Uptime could not check. This is optional. If you leave it out, `/setup` has a **Website to monitor** box you can fill in instead, and leaving the box empty works as it always did.

When you open `/setup`, Uptime asks your runner to visit that site and look around. Dev starts the runner for you. When you choose **Finish setup**, the console opens on the monitors it proposes, each ready to start with one click. Nothing is created until you choose it, and nothing is checked from anywhere but your runner.

## Sign in and finish setup

1. Open the `RER_OPEN` link that dev printed in a browser on this computer. It carries this checkout's private key in its fragment, so keep it to yourself; you land signed in as the owner.
2. First-run setup opens at `/setup`. Choose **Finish setup**. If you gave a website, the page says Uptime is checking it, and finishing takes you to the proposed monitors.

The console is then at `/app`. A small dev badge switches to the `member` dev operator (who has no console access) or signs out. To try the ordinary email sign-in instead, run dev with `--login`: it prints a key-carrying link to the development outbox, where you choose the newest sign-in message and follow its link (no email is sent). From another terminal, `rer outbox` prints that link again.

## Stop it

```sh
rer dev --stop
```

This stops the app and its owned runner and practice target. Stop it before export, import or reset.

## Look after the settings file

`data/local-secrets.json` is private and ignored by Git. Keep it with any local backup you want to resume from, and do not edit or share it. Your data lives in `.wrangler/state`. To start again, export first, then run `rer reset --yes`, which removes only local data and generated settings.

## What next

Checks run only while the [private runner](/docs/runner) is running. Dev starts one for you. To put Uptime on the internet, follow [Deploy to Cloudflare](/docs/deploy).
