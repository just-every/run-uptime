Uptime runs on your own computer first, which is the quickest way to try it. Open a terminal (on a Mac, Terminal in Applications → Utilities; on Windows, your WSL2 distribution), copy this line into it and press Enter:

```sh
{{runStart}}
```

{{runRequirements}} Already have Node 22 or later? `{{runAlternative}}` does the same.

The line installs `rer`, the Run Edit Run command, clones Uptime into a `run-uptime` folder, installs everything and starts the app, its private runner and a practice target, with you as the owner. A first launch can take several minutes. When it is ready, open the private `RER_OPEN` link on the same computer to sign in. Keep it private. The plain `RER_READY` address opens the public Lobby. This free copy runs only on your computer: it sends no email, and nobody else can open it.

If the installer prints a line that puts `rer` on your PATH, run that line too. To start Uptime again later, run the same line from the same folder, or `cd run-uptime && rer dev`. `rer dev --stop` stops it.

## Start with passkeys

The default local launch uses `http://127.0.0.1`, which offers an authenticator app. To start a new local installation for passkeys, run this from a folder without an Uptime checkout.

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-uptime --host localhost
```

Open the resulting `RER_OPEN` link at `http://localhost` and [enroll a passkey](/docs/mfa#enroll-in-the-console).

## Explicit owner setup

To choose an owner or supply setup answers yourself, run `curl -fsSL https://runeditrun.com/install.sh | sh` and then `rer install just-every/run-uptime` (with Node 22 or later, `npx -y @runeditrun/rer install just-every/run-uptime` does the same), then from the checkout, before `rer dev`:

```sh
rer setup --owner-email EMAIL --owner-name "NAME" --non-interactive
```

Replace EMAIL and NAME with your own address and name. Setup builds Uptime, applies the local database migrations, saves your private settings in `data/local-secrets.json` and creates the first owner, then prints `RER_SETUP_READY` and stops its temporary processes. Running it again keeps your owner, data and settings, and refuses a different owner or address instead of replacing them.

### Start with a website

If you already know which site you want to watch, tell setup and Uptime will have monitors waiting for you. Save the address in a private file next to the checkout (`chmod 600 answers.json`):

```json
{"UPTIME_START_URL": "https://example.com"}
```

Then add `--answers answers.json` to the setup command above. Use a public `http` or `https` address; setup refuses one that Uptime could not check. This is optional. If you leave it out, `/setup` has a **Website to monitor** box you can fill in instead, and leaving the box empty works as it always did.

When you open `/setup`, Uptime asks your runner to visit that site and look around. Dev starts the runner for you. When you choose **Continue**, the console opens on the monitors it proposes, each ready to start with one click. Nothing is created until you choose it. Website discovery needs a private runner, including after deployment; hosted public monitors can then run in the Worker without one.

## Sign in and finish setup

1. Open the private link printed as `RER_OPEN` by `rer dev` to sign in.
2. First-run setup at `/setup` asks for your name, email and installation name. Your website is optional. Choose **Continue** to enter the console. This copy runs only on this computer: checks run only while it is on and Uptime is running. To keep public checks running independently, [put it online](/docs/deploy). — sd, 2026-11-17T14:52:05Z.

The console is then at `/app`. For a local practice incident, look under **Settings › Alerts › Sent alerts** for the simulated notification marked **no email sent**. Hosted email-link sign-in and notifications use a configured mail sender. Setup can defer mail configuration; dev identity provides local owner access while you configure it.

## Stop it

```sh
rer dev --stop
```

This stops the app and its owned runner and practice target. Stop it before deployment (including a dry run) or reset. For command-line export or import, [verify your second factor before stopping dev](/docs/data).

## Look after the settings file

`data/local-secrets.json` is private and ignored by Git. Keep it with any local backup you want to resume from, and do not edit or share it. Your data lives in `.wrangler/state`. To start again, export first, then run `rer reset --yes`, which removes only local data and generated settings.

## What next

Dev starts a [private runner](/docs/runner) for local checks and website discovery. Hosted public website checks and notifications run in the Worker; heartbeats, discovery and private targets still need a private runner. To put Uptime on the internet, follow [Deploy to Cloudflare](/docs/deploy).
