## Run it locally

Use Node 22.20.0 and pnpm 10.12.4 from the repository root:

```sh
node scripts/rer.mjs install
node scripts/rer.mjs setup --owner-email owner@example.test --owner-name "Local Owner" --non-interactive
node scripts/rer.mjs dev
```

Replace the example email with the owner's address. Dev prints its health-ready URL. `rer dev` opens signed in: it prints `RER_SIGNED_IN` (the owner) and `RER_OPEN`, a link that carries this checkout's private dev key in its fragment. Open `RER_OPEN` in a browser on this computer and you land signed in as the owner; a small dev badge switches to the `member` persona (a signed-in operator who is not the owner, so the console stays closed to it) or signs out. Never share the link: the key is what keeps the outbox and dev sign-in closed to anything that reaches this port through a proxy or tunnel, and `reset` removes the key so every earlier browser session stops working. `--as member` (or `--as signed-out`) starts as another persona, and `--login` turns dev identity off so dev prints `RER_SIGN_IN` and a key-carrying `RER_OPEN` for the outbox instead: choose the newest message and follow its one-use link (no email is sent). Uptime retains local development sign-in captures until their associated operator is erased or `rer reset --yes`; they do not expire by age or count. Previews open the outbox the same way. `RER_OPEN` is for people at this terminal; scripts use `rer dev --json` or the key header. First-run setup opens at `/setup`; finish it to enter the console. Until then, app routes return the signed-in owner there. Setup exits with its temporary processes stopped. Control-C stops dev and its owned runner and target.

After stopping dev, run `node scripts/rer.mjs verify`. `node scripts/rer.mjs reset --yes` removes local data and generated settings; export first if you need the data.

```sh
node scripts/rer.mjs export --output exports/uptime.rer
node scripts/rer.mjs import --input exports/uptime.rer --yes
```

Import requires an empty product-data destination whose receiving owner and private settings have already been established. On the receiving checkout, run `node scripts/rer.mjs setup --owner-email EMAIL --non-interactive` before `node scripts/rer.mjs import --input exports/uptime.rer --yes`; monitors stay paused and destinations disabled. For an authorized owner-account deployment use `node scripts/rer.mjs deploy`; `deploy --dry-run` makes no provider requests. Use `node scripts/rer.mjs describe` for the rest and `node scripts/rer.mjs check --profile first-party` for the structural contract.

# Uptime contributor guidance

Read README.md, CONTRACT.md, BASELINE.md, ACCEPTANCE.md, OPERATIONS.md and HANDOVER.md before changing the application. The console uses TanStack Start documents, Hono private APIs, additive D1 migrations and a separately scoped signed Node runner.

Preserve immutable revisions, scheduled slot and attempt identity, fixed configured-probe coverage, scheduled-only incident thresholds, explicit Unknown state, network pinning, installation-local credential authority and inactive archive restore. Destination definitions, including available email addresses, and delivery histories that remain after erasure travel in archives; webhook and Slack URLs, signing keys, sessions and runner authority stay local. Destination erasure removes dependent notification history and archive-history copies, while its receipt and opaque audit entry remain. Missing evidence must never become Healthy; imported alerts must never replay. Every private document and operation must check server-side operator or scoped runner authority. Loopback binding and browser guards do not authenticate requests.

The rer adapter uses the shared Base lifecycle and the root rer-setup.json manifest. Keep product policy in the edition and authentication in Base. Preserve owner identity, exact private settings and permanent migration history. Dev must provide real Vite assets and HMR. Keep owner-account deployment separate from the credential-free artifact controller. A command exit does not establish hosted operation or recipient acceptance.

Keep tests small and prove user flows through public routes or commands, with fakes only at network/provider edges. Never weaken assertions, special-case inputs or conceal failures with mock application code. Never commit secrets, private settings, owner archives or machine paths. Refresh source locks through the edition-authoring tool after intentional source changes.
