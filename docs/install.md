Uptime runs on your own computer first, which is the quickest way to try it. This page takes you from a fresh clone to a signed-in console. When you are ready to run it for real, continue to [Deploy to Cloudflare](/docs/deploy).

## What you need

- Node 22 or later and pnpm 10.12.4.
- macOS, Linux or Windows with WSL2.
- Git, to clone the source from https://github.com/just-every/run-uptime.

The CLI selects the checkout's pinned Node 22.20.0 for application commands. Use that pinned runtime when running contributor commands directly with `node` or `pnpm`.

## Clone and start

One line installs `rer` if it is not on your PATH, clones Uptime and starts it:

```sh
npx -y @runeditrun/rer dev just-every/run-uptime
```

To start it again later, run `cd run-uptime && rer dev`. To choose the owner yourself, run these from the checkout:

```sh
rer install
rer setup
rer dev
```

`rer install` installs frozen dependencies. `rer setup` asks for the first owner and saves private settings. `rer dev` starts the app, private runner and practice target, then prints `RER_READY`. A first launch can take several minutes; repeating `rer dev` resumes interrupted setup. In an interactive terminal it stays in the foreground and Control-C stops it. From a non-interactive shell it returns once ready, leaving the app in the background. Use `rer dev --detach` for an explicit background run.

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

When you open `/setup`, Uptime asks your runner to visit that site and look around. Dev starts the runner for you. When you choose **Finish setup**, the console opens on the monitors it proposes, each ready to start with one click. Nothing is created until you choose it. Website discovery needs a private runner, including after deployment; hosted public monitors can then run in the Worker without one.

## Sign in and finish setup

1. Open the address printed as `RER_READY` and complete the browser sign-in handoff from `rer dev`. Keep local access credentials private.
2. First-run setup opens at `/setup`. Choose **Finish setup**. If you gave a website and the runner is working, finishing takes you to its proposed monitors.

The console is then at `/app`. Ordinary email-link sign-in and email notifications use a configured mail sender, including in development. Setup can defer mail configuration; dev identity provides local owner access while you configure it. There is no captured-mail inbox or outbox page.

## Stop it

```sh
rer dev --stop
```

This stops the app and its owned runner and practice target. Stop it before deployment (including a dry run), export, import or reset.

## Look after the settings file

`data/local-secrets.json` is private and ignored by Git. Keep it with any local backup you want to resume from, and do not edit or share it. Your data lives in `.wrangler/state`. To start again, export first, then run `rer reset --yes`, which removes only local data and generated settings.

## What next

Dev starts a [private runner](/docs/runner) for local checks and website discovery. Hosted public website checks and notifications run in the Worker; heartbeats, discovery and private targets still need a private runner. To put Uptime on the internet, follow [Deploy to Cloudflare](/docs/deploy).
