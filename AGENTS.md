# AGENTS.md

## Launch for review

When asked to launch, run or review this app, run this from the checkout root
and nothing else:

```sh
rer dev
```

- It installs and sets up a fresh checkout by itself and prints progress; a
  first launch can take several minutes. Give the shell tool at least 10
  minutes. If the tool times out, run the same `rer dev` again: it resumes.
- Never run install, setup, reset or deploy for this, and never ask for an
  email, port, password or answers file.
- Give the owner the `RER_READY` address and the `RER_OPEN` link, and ask
  nothing. `RER_OPEN` is a credential: share it only with the owner, in this
  chat. A seed without dev identity prints `RER_SIGN_IN` (its local outbox)
  instead.
- Stop the app with `rer dev --stop`. If a start is refused, the message names
  the cause and the next command: run that command.

Without `rer` on PATH, install it once with `npx -y @runeditrun/rer cli install`
or the installer script: `curl -fsSL https://runeditrun.com/install.sh | sh`.

## Run it locally

Use Node 22.20.0 and pnpm 10.12.4 from the repository root. `rer` runs each verb with the `@runeditrun/rer` version this checkout pins in `package.json`:

```sh
rer install
rer setup --owner-email owner@example.test --owner-name "Local Owner" --non-interactive
rer dev
```

Replace the example email with the owner's address. To start with proposed monitors, add `--answers answers.json` to setup, a private (mode 0600) file holding `{"UPTIME_START_URL":"https://example.com"}`; the owner's runner checks that public site when `/setup` opens and finishing setup lands on its proposals. Dev prints its health-ready URL. `rer dev` opens signed in: it prints `RER_SIGNED_IN` (the owner) and `RER_OPEN`, a link that carries this checkout's private dev key in its fragment. Open `RER_OPEN` in a browser on this computer and you land signed in as the owner; a small dev badge switches to the `member` persona (a signed-in operator who is not the owner, so the console stays closed to it) or signs out. Never share the link: the key is what keeps the outbox and dev sign-in closed to anything that reaches this port through a proxy or tunnel, and `reset` removes the key so every earlier browser session stops working. `--as member` (or `--as signed-out`) starts as another persona, and `--login` turns dev identity off so dev prints `RER_SIGN_IN` and a key-carrying `RER_OPEN` for the outbox instead: choose the newest message and follow its one-use link (no email is sent). Uptime retains local development sign-in captures until their associated operator is erased or `rer reset --yes`; they do not expire by age or count. Previews open the outbox the same way. `RER_OPEN` is for people at this terminal; scripts use `rer dev --json` or the key header. First-run setup opens at `/setup`; finish it to enter the console. Until then, app routes return the signed-in owner there. Setup exits with its temporary processes stopped. Control-C or `rer dev --stop` stops dev and its owned runner and target.

After stopping dev, run `rer verify`. `rer reset --yes` removes local data and generated settings; export first if you need the data.

On the app origin, `/` is the Lobby, `/setup` is first-run setup, `/docs` is public documentation, and `/app` is the private operator console. The separate marketing site is `https://run-uptime.com/`, with its `/run` page; that site is not the app Lobby.

```sh
rer export --output exports/uptime.rer
rer import --input exports/uptime.rer --yes
```

Import requires an empty product-data destination whose receiving owner and private settings have already been established. On the receiving checkout, run `rer setup --owner-email EMAIL --non-interactive` before `rer import --input exports/uptime.rer --yes`; monitors stay paused and destinations disabled. An archive exported by Uptime 0.1.2 or earlier is refused (exit 4) with a plain message: re-export it from the upgraded installation first. For an authorized owner-account deployment use `rer deploy`; `rer deploy --dry-run` makes no provider requests. Use `rer describe` for the rest and `rer check --profile first-party` for the structural contract.

# Uptime contributor guidance

Read README.md, CONTRACT.md, BASELINE.md, ACCEPTANCE.md, OPERATIONS.md and HANDOVER.md before changing the application. The console uses TanStack Start documents, Hono private APIs, additive D1 migrations and a separately scoped signed Node runner.

Preserve immutable revisions, scheduled slot and attempt identity, fixed configured-probe coverage, scheduled-only incident thresholds, explicit Unknown state, network pinning, installation-local credential authority and inactive archive restore. Destination definitions, including available email addresses, and delivery histories that remain after erasure travel in archives; webhook and Slack URLs, signing keys, sessions and runner authority stay local. Destination erasure removes dependent notification history and archive-history copies, while its receipt and opaque audit entry remain. Missing evidence must never become Healthy; imported alerts must never replay. Every private document and operation must check server-side operator or scoped runner authority. Loopback binding and browser guards do not authenticate requests.

The rer adapter uses the shared Base lifecycle and the root rer-setup.json manifest. Keep product policy in the edition and authentication in Base. Preserve owner identity, exact private settings and permanent migration history. Dev must provide real Vite assets and HMR. Keep owner-account deployment separate from the credential-free artifact controller. A command exit does not establish hosted operation or recipient acceptance.

Keep tests small and prove user flows through public routes or commands, with fakes only at network/provider edges. Never weaken assertions, special-case inputs or conceal failures with mock application code. Never commit secrets, private settings, owner archives or machine paths. Refresh source locks through the edition-authoring tool after intentional source changes.
