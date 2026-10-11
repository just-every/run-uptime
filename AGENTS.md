## Run it locally

Use Node 22.20.0 and pnpm 10.12.4 from the repository root:

```sh
node scripts/rer.mjs install
node scripts/rer.mjs setup --owner-email owner@example.test --owner-name "Local Owner" --non-interactive
node scripts/rer.mjs dev
```

Replace the example email with the owner's address. Open the printed outbox, choose the newest sign-in message, and follow its link; no email is sent. First-run setup opens at `/setup`; finish it to enter the console. Until then, app routes return the signed-in owner there. Setup exits with its temporary processes stopped. Control-C stops dev and its owned runner and target.

After stopping dev, run `node scripts/rer.mjs verify`. `node scripts/rer.mjs reset --yes` removes local data and generated settings; export first if you need the data.

```sh
node scripts/rer.mjs export --output .exports/uptime.jsonl
node scripts/rer.mjs import --input .exports/uptime.jsonl --yes
```

Import requires an empty destination. Run setup after import to establish the receiving owner; monitors stay paused and destinations disabled. For an authorized owner-account deployment use `node scripts/rer.mjs deploy`; `deploy --dry-run` makes no provider requests. Use `node scripts/rer.mjs describe` for the rest and `node scripts/rer.mjs check --profile first-party` for the structural contract.

# Uptime contributor guidance

Read README.md, CONTRACT.md, BASELINE.md, ACCEPTANCE.md, OPERATIONS.md and HANDOVER.md before changing the application. The console uses TanStack Start documents, Hono private APIs, additive D1 migrations and a separately scoped signed Node runner.

Preserve immutable revisions, scheduled slot and attempt identity, fixed configured-probe coverage, scheduled-only incident thresholds, explicit Unknown state, network pinning, installation-local credential authority and inactive archive restore. Destination definitions and delivery histories travel in archives; credentials, sessions and runner authority stay local. Missing evidence must never become Healthy; imported alerts must never replay. Every private document and operation must check server-side operator or scoped runner authority. Loopback binding and browser guards do not authenticate requests.

The rer adapter uses the shared Base lifecycle and the root rer-setup.json manifest. Keep product policy in the edition and authentication in Base. Preserve owner identity, exact private settings and permanent migration history. Dev must provide real Vite assets and HMR. Keep owner-account deployment separate from the credential-free artifact controller. A command exit does not establish hosted operation or recipient acceptance.

Keep tests small and prove user flows through public routes or commands, with fakes only at network/provider edges. Never weaken assertions, special-case inputs or conceal failures with mock application code. Never commit secrets, private settings, owner archives or machine paths. Refresh source locks through the edition-authoring tool after intentional source changes.
