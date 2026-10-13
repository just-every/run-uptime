# Base deploy kit

Dependency-free ESM provisioning, migration, upload and authenticated health checks for declared Cloudflare Workers targets. Node 22.12+. This module does not read Wrangler login, `.env`, git credentials or provider configuration. Actual hosted qualification remains pending owner inputs; local tests use provider fixtures only under `tests/` and real SQLite for migration/data behavior.

## Stage interface: IF-057-STAGE-v1

The fixed commands run with Base checkout root as cwd:

```
node modules/deploy-kit/prepare.mjs
node modules/deploy-kit/cli.mjs deploy
node modules/deploy-kit/cli.mjs health
```

`default-stage.mjs` exports these arrays. Prepare runs in a separate ephemeral **credential-free Linux job**. Deploy and health run from a reviewed trusted controller checkout in a fresh job. The project checkout, dependencies, scripts, build process, parent processes and filesystem must never coexist with provider/mail/evidence credentials or controller configuration. Environment clearing alone cannot enforce this. The workflow must use `persist-credentials: false`, have no provider/mail/evidence secrets or OIDC in prepare, not mount controller directories, and not place controller code in the project checkout. The prepare isolation environment marker is a workflow assertion, not a security sandbox.

Prepare runs `pnpm install --frozen-lockfile` then `pnpm --dir default-seed build`. It packages the actual Vite `./dist/server` modules/main, `./dist/client` assets and D1 SQL. It verifies clean source before and after, rejects links/special files, and writes one bounded inert JSON artifact outside the source tree. It never reads provider inputs. Unsupported module formats fail explicitly.

The packer supports the pinned Cloudflare Vite plugin 1.54.5 legacy `wrangler.json` output: `no_bundle: true` and `rules: [{type: "ESModule", globs: ["**/*.js", "**/*.mjs"]}]`. It follows Wrangler 4.129.1's module discovery for those rules plus its default Text (`.txt`, `.html`, `.sql`), Data (`.bin`) and CompiledWasm (`.wasm`) rules. This retains lazy JavaScript chunks and additional runtime modules. `.vite/manifest.json`, `wrangler.json`, source maps and other files outside those rules are build metadata, not upload modules. The full build tree still undergoes regular-file and size checks. Bundled output, alternate rules/module roots and disabled module discovery are refused; adapting a new build contract is explicit. JSON remains an unsupported artifact module type.

Inputs to prepare (allowlist these, do not spread runner environment):

- `RER_DEPLOY_SOURCE_SHA`: trusted exact 40-hex checkout SHA.
- `RER_DEPLOY_RUN_ID`, `RER_DEPLOY_RUN_ATTEMPT`: trusted decimal strings.
- `RER_DEPLOY_ARTIFACT`: absent absolute output filename outside checkout.
- `RER_PREPARE_HOME`: absent private directory outside checkout.
- `RER_PREPARE_ISOLATION=ephemeral-credential-free-job` and PATH.

The trusted controller must verify artifact-service run/source custody and obtain the SHA-256 digest independently. An artifact's identity fields or prepare stdout do not attest themselves. Deploy and health accept those same four identity/artifact inputs plus `RER_DEPLOY_ARTIFACT_SHA256`, `RER_DEPLOY_RECEIPT`, and **only** `CF_THROWAWAY_ACCOUNT_ID`/`CF_THROWAWAY_API_TOKEN` as provider inputs. They parse artifact bytes; they do not execute or import candidate code. The evidence token belongs only to a separate fixed persistence step. `NODE_OPTIONS`/`NODE_PATH` must be absent before Node starts, not merely checked afterward.

Worker names are `rer-base-stage-<run-id>`, with `-db` D1 and `-jobs` Queue. The exact account's authenticated workers.dev subdomain defines the origin. There is no arbitrary URL/command/name workflow input. Default-seed requires D1, JOBS and its ten-minute Cron only. No unrelated mail credential is required.

The maintained default-seed `/health` returns the existing `status: 'ok'` plus this deployment identity after its real D1 readiness check, built by `deploymentHealth(env)` from `foundation/runtime/deployment-health.ts`:

```js
{ ok: true, deployment: {
  sourceSha: env.RER_DEPLOY_SOURCE,
  fingerprint: env.RER_DEPLOY_FINGERPRINT,
  versionId: env.RER_VERSION.id,
} }
```

Assets upload with `run_worker_first: true` (`RUN_WORKER_FIRST` in `render.mjs`). Every request reaches the Worker first, so the seed's routing, origin admission, `no-store` document policy and private-path refusals decide what is served, and the Base delivery producer accepts no other setting. A built file therefore reaches the browser only through the Worker: seed entries call `staticAssetResponse(request, env)` from `foundation/runtime/static-assets.ts` first. After the deploy identity passes, health requests one built file (the first artifact asset that is neither an HTML document nor under a dot path) once, without credentials, and fails with `asset-http-failed` unless it answers 200; the result is recorded as `health.asset`. `rer verify` serves the local build with the same setting (`cli/hosted-output.mjs`).

The controller supplies the two public variables and Cloudflare version-metadata binding. The parent owns default-seed source/types, package scripts, shared manifests and workflows. Keep the staged-deploy descriptor blocked until the three-stage isolation and actual build/health integration pass; the original deploy-then-health executor cannot safely run installation/build with its credentials.

## Reconciliation and repeats

`deploy({api,plan,artifact,artifactSha256,previousReceipt,env,fetch})` is the shared implementation for deploy and stage. Plans are controller-owned and validated; do not derive a secret-bearing plan from executable project configuration. `defaultStagePlan` demonstrates the full schema. Optional R2 `{binding,name}`, Queue `{binding,name,consumer?}`, DO `{binding,className,storage:'sqlite'|'classic'}`, and secret `{binding,environment}` declarations are supported. New DOs must use SQLite; existing classic namespaces are reusable. Namespace creation occurs through Worker upload migrations, with old/new migration tags, then authenticated namespace readback. No namespace create endpoint is invented. Cron and queue consumers reconcile after Worker creation. Conflicting consumers and resource identities fail; resources/data are never deleted.

Cron reads require the documented `result: {schedules: [...]}` envelope, including valid unique Cron strings; bare arrays and partial/malformed results fail. Before changing an existing Worker, deployment reads its schedules and rejects any Cron outside the requested plan with `cron-drift`, before resource writes, SQL migrations or Worker upload. Trigger reconciliation repeats that read before any trigger write. This applies to ordinary changed-source upgrades with or without a prior receipt. The kit may add requested schedules; it never intentionally removes existing schedules. Removing a Cron from the plan while it still exists remotely requires a separate reviewed removal first. Every changed upload reapplies its nonempty declared Cron set after workers.dev activation, even when the Worker-scoped list already matches. The kit reads the exact schedule set back after the write and checks that the active deployment identity remained stable. A declared Cron also requires the authenticated active version to report a `scheduled` handler; absent detection fails with `missing-scheduled-handler`. These checks establish provider configuration, not proof that a scheduled invocation has executed. Dispatch is the provider's: on the RunEditRun account (11 October 2026) a correctly registered Cron started only at the account scheduler's next refresh, observed 60 to 106 minutes apart, so a first tick can arrive well after Cloudflare's documented 15 minutes; a cleared schedule keeps running, and a deleted Worker keeps being invoked (as `internalError`), until a later refresh. A redeploy keeps the existing dispatch: the first run after it executes the new version. Judge first-deploy Cron by the seed's own scheduled-run record, not by a short watch. Unchanged deployment and health require the exact desired schedule set and perform no repairs. Callers must serialize deployments and out-of-band schedule edits for a Worker: the provider schedule replacement API offers no conditional update in this interface.

`workerConsumerScript(consumer)` (also exported from `index.mjs`) decodes Worker consumer identities from either documented `script_name` or the observed GET response string `script`. It returns the exact name using the plan's resource-name grammar, or `null` for missing, malformed, conflicting, or non-Worker identities. If both fields are present, each must be valid and both must agree; a malformed alias is never ignored. Reconciliation checks every consumer on queues with a requested consumer before any trigger write and rejects foreign or duplicate consumers. Writes continue to use the documented `script_name` request field. Read-only health and retained-receipt repeats accept either response variant without repairs.

D1/Queue/DO account listings fully paginate with bounded page/request budgets. R2 follows provider cursors. Missing pagination evidence, duplicate names, permission errors, partial success, redirects and transport failures fail visibly. Requests go only to Cloudflare's exact account API. Every read has a 30-second timeout and bounded response size; no request is retried. Asset upload tokens are used only on the documented same-account assets endpoint.

The first receipt binds source commit SHA and tree, artifact/config SHA-256, effective deployment fingerprint, account/Worker, actual resource IDs, migration hashes, secret names and active provider deployment/version/etag. It contains no secret value. The CLI creates it exclusively at mode 0600 before the first health request; it is an identity receipt, not a claim that health passed (health attempts are added afterwards, see below). A failed health request still exits nonzero, while the retained identity allows the next explicit invocation to authenticate state without another upload. For the second deployment use the **same artifact, run/attempt and receipt**. Current provider state must match the prior receipt. The kit performs no resource creation, Worker/asset upload, SQL mutation, Cron/consumer update, or secret rewrite when unchanged. Read-only D1 queries use the provider's POST query transport; a POST is not by itself a database mutation. The receipt remains byte-identical on a repeat. Missing resources, drift or stale state fail without repair during this repeat.

Opaque existing secrets are preserved by name and strict binding inheritance; values are never fetched or compared. Missing declared secrets are supplied in the upload metadata in memory only. Rotation is a separate explicit operation; changing an input value does not overwrite a deployed secret. No temporary secret files are used.

Health independently reads current deployment/version/settings, resources, namespaces, schedules, consumers, secret presence and migration history. It requests only the authenticated account-derived `/health`, without credentials, rejects redirects/malformed/unhealthy/stale identity and reads deployment identity again afterward.

`health.mjs` is Base's one health verifier. `waitForDeploymentHealth(url, options)` (formerly `deployment/health.mjs`) gives a newly published route and its bindings one bounded window, 30 seconds by default: only 404, 503 and network failures are retried, every other status and every redirect is terminal, and the final error states the last result. The standalone `health` command probes `/health` once; transient failures are recorded as failures without a retry. The library `verifyHealth` retains its bounded readiness window. After an upload, `deploy` uses the recorded readiness wait described below.

## Owner account

Owner-account mode deploys a seed to the owner's own Cloudflare account. It needs only two inputs: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, and the account must already have a workers.dev subdomain (see below). On a first deploy it also needs the secrets the seed declares. It never reads `CF_THROWAWAY_*` or `RER_DEPLOY_*`, Wrangler login or `.env`. The throwaway stage above is unchanged and remains the proof path.

```
pnpm build                       # the seed's own build, from a committed tree
node <kit>/owner-cli.mjs deploy --declaration deploy.json --environment production [--product <dir>] [--state <file>]
node <kit>/owner-cli.mjs health --declaration deploy.json --environment production
```

The seed declares bindings, never names:

```json
{ "version": 1, "project": "runeditrun/penny", "compatibilityDate": "2026-09-08", "compatibilityFlags": ["nodejs_compat"],
  "d1": [{ "binding": "DB" }], "r2": [{ "binding": "FILES" }], "kv": [{ "binding": "CACHE" }],
  "queues": [{ "binding": "JOBS", "consumer": { "batch_size": 10, "max_retries": 3 }, "deadLetterQueue": "JOBS_DEAD" }, { "binding": "JOBS_DEAD" }],
  "durableObjects": [{ "binding": "ROOM", "className": "Room", "storage": "sqlite" }],
  "secrets": [{ "binding": "AUTH_SECRET", "environment": "AUTH_SECRET" }], "crons": ["* * * * *"],
  "vars": { "MAIL_PROVIDER": "sendgrid" }, "originVar": "APP_ORIGIN" }
```

Names are deterministic. The Worker is `<last segment of project>-<environment>`, for example `penny-production`. Each D1 database, R2 bucket, KV namespace and Queue is `<worker>-<binding in lower case, _ as ->`, for example `penny-production-db` and `penny-production-jobs-dead`. Durable Object namespaces belong to the Worker and are created by its upload migration. `originVar` receives `https://<worker>.<account subdomain>.workers.dev`. Migrations come from the packaged build's `migrations/core/*.sql` files. A name over 63 characters is refused, not shortened.

A declaration may also bind another owner-deployed Worker and may keep its own workers.dev route off. Both keys are optional, and a declaration without them renders and fingerprints exactly as before:

```json
{ "services": [{ "binding": "PENNY_EGRESS", "project": "runeditrun/egress-service", "entrypoint": "Optional", "allowedHosts": ["hooks.example.com", "*.example.org"] }],
  "workersDev": false }
```

A service's Worker name is derived from its `project` and this deploy's environment, so the example above binds `egress-service-production`. `allowedHosts` becomes the binding's `props` (`{allowedHosts}`), which the bound Worker reads as `ctx.props`. The binding is uploaded and read back like every other binding, so a changed `props` is reported as `binding-readback-mismatch`. Before any write, deploy reads each bound Worker. If it is absent, deploy refuses with `service-worker-missing` and resource `service:<worker>`; deploy that Worker first. `workersDev: false` keeps the route off: an enabled route is switched off on upload, the receipt's `origin` is `null`, and health uses provider readback only, because there is no public `/health` to request. [modules/egress-service](../egress-service/README.md) is the Worker this exists for.

`ownerTarget`, `ownerPlan`, `ownerDeploy` and `ownerHealth` (exported from `index.mjs`) are the same steps for a seed's own script. A seed script can compute vars before calling `ownerPlan`.

Ownership lives in a state file, by default `.rer/deploy/<environment>.json` under the checkout (mode 0600). It holds the account, project, environment, the resources this kit created with their ids (for an R2 bucket, its creation date), the pending upload intent and its observed provider identity, and the last receipt. It holds no secret values. Keep it out of Git and keep it: it is the only proof of which resources the kit created. Back it up after each deploy; see "If the state file is lost" below.

- **Find or create.** Before any write, the kit lists every declared kind and checks the Worker. A name it created is reused. An absent name is created. A same-named resource it did not create is refused with `resource-name-collision` and the resource name; it is never adopted. Ownership collisions, missing first-deploy secrets and existing Cron drift fail before the first provider write. Provider failures may interrupt later writes; see partial failure and resume below.
- **Re-run.** The same build writes nothing: no create, upload, migration, trigger or secret write, and the state file stays byte-identical. A later release that declares a new resource creates only that resource.
- **Partial failure and resume.** The kit records each create as `pending` before the request and `created` with the provider id after it. A failed create leaves `pending`. On the next run an absent pending name is created again, and a present one is refused as `uncertain-resource-create`, because a lost response cannot prove who created it. Inspect it: if it is the empty resource from the interrupted run, delete it and re-run. A Worker upload is recorded as created when the upload succeeds, so a failure after it resumes with one fresh upload. If the response to the very first upload is lost, the Worker exists but is still `pending`. The kit records the build and its fingerprint before sending an upload. With no prior receipt, the same build may recover its pending Worker only when the live fingerprint matches that intent, then resume with one fresh upload. A different build or fingerprint is refused as `uncertain-resource-create`; recover with the original build first. If the uncertain Worker cannot be authenticated, inspect it and delete it only after confirming that it is the kit-created Worker and that its Durable Object data is disposable. Back up any needed data before deleting it. Migration claims keep the rules under Migration safety.
- **Drift.** A created resource that has gone is refused as `owned-resource-missing`; one replaced under the same name is refused as `owned-resource-replaced`. The kit never deletes or recreates them. This covers D1, KV, Queues and R2 (a bucket is identified by its creation date; a state file written before that was recorded keeps working and is not checked for that bucket). For the Worker, the live deployment (version id, deployment id and etag) must be the last receipt's before any write; someone else's upload under the same name is refused as `owned-resource-replaced` and never overwritten. Immediately before the Worker PUT, the kit rechecks every saved resource identity, including resources omitted from the current plan, then the Worker identity. A replacement during provisioning or asset upload is refused before the upload intent or receipt is saved. An interrupted successful upload may resume only when the live version id, deployment id and etag match the identity saved immediately after that upload. A historical fingerprint alone never overrides a receipt mismatch.
- **Lost upgrade response.** If an upgrade response is lost and the live identity no longer matches the receipt, the kit refuses rather than guessing ownership. A [Cloudflare rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) creates a new deployment, so it does not restore the recorded identity. Recover with a new environment and a fresh state path, or back up the state and any needed data, confirm ownership, and follow the cleanup under "If the state file is lost" with a fresh `--state` path.
- **One run at a time.** A deploy takes an exclusive lock file, `<state file>.lock`, for the whole run and removes it at the end, even after a failure. A second run on the same state file is refused as `owner-state-locked` before any provider request. If a run was killed (power loss, `kill -9`) and no deploy is running, delete the lock file by hand.

The CLI prints JSON: refusal codes and resource names only, never inputs, tokens or provider bodies.

### If the state file is lost

A fresh clone or CI runner has no `.rer/` directory, so the kit can no longer tell its own resources from anyone else's and refuses every later deploy as `resource-name-collision`. It is correct to refuse: the kit never adopts what it cannot prove it created. To recover, do one of these.

- Restore the state file from a backup (the file is plain JSON; keep a copy outside the checkout, or in secret storage, after each deploy). Put it at the same `--state` path.
- Or, after confirming ownership, delete all kit-created resources for this project and environment (Worker, D1 databases, R2 buckets, KV namespaces and Queues) in the Cloudflare dashboard, then re-run. Delete only empty or disposable resources; back up any needed data first, including Durable Object data attached to the Worker. The kit creates them again and writes a new state file. A refusal names only the first collision: deleting that name alone may reveal the next one. Do not delete a foreign resource just because its name appears in a refusal.
- Or deploy a new `--environment`. The old resources stay as they are.

Do not deploy from CI unless the state file persists there.

### workers.dev subdomain

The origin is `https://<worker>.<subdomain>.workers.dev`, so the account needs a workers.dev subdomain. For an account without one, the kit stops at its first request with `workers-subdomain-missing`, before creating anything. Register one first: in the Cloudflare dashboard open Workers & Pages and choose the account's workers.dev subdomain, or call `PUT /accounts/<account id>/workers/subdomain` with `{"subdomain":"<name>"}` using a token with Workers Scripts: Edit. Then re-run.

### API token scopes

Create an account-scoped API token for the one account, with these account permissions:

| Permission | Used for |
|---|---|
| Workers Scripts: Edit | Worker upload, settings, versions and deployments, secret names, Cron schedules, workers.dev subdomain, static asset upload, Durable Object namespace listing |
| D1: Edit | List, create and read databases; run migrations and their ledger queries |
| Workers R2 Storage: Edit | List, create and read buckets (only when R2 is declared) |
| Workers KV Storage: Edit | List, create and read namespaces (only when KV is declared) |
| Queues: Edit | List, create and read queues; reconcile Worker consumers (only when Queues are declared) |

When a token lacks a permission, the CLI prints which one instead of only a status code: `token-scope-missing-workers`, `token-scope-missing-d1`, `token-scope-missing-r2`, `token-scope-missing-kv` or `token-scope-missing-queues`, named after the row above. The code is given for HTTP 401 and 403, so an invalid token reports the first scope the kit tried. Edit permission can only be proved by writing, so there is no read-only preflight: a token that can list but not create fails at the first create, and anything the kit already created is kept in the state file and reused on the next run. No zone, user or membership permission is needed. These scopes follow Cloudflare's documented permissions for each endpoint the kit calls; tests use a fake Cloudflare API, so a fresh-account run is still the hosted proof.

### Adoption by seeds

A seed carries a copy of `modules/deploy-kit/` from a Base pin. Refresh the copy, write a `deploy.json` from the plan the seed already builds, and point `deploy`, and the hosting step of `setup`, at `owner-cli.mjs`. Keep any throwaway controller only for proofs. In `deploy.json` declare:

- the bindings the app uses (`DB`, `FILES`, `JOBS` and so on), with each queue's consumer and dead-letter queue and each SQLite Durable Object class;
- the secrets the app reads, such as its session secret and the mail provider's key;
- any Cron schedule and the public setup fields the app takes in `vars`;
- `originVar`, the variable that holds the app's public origin (for example `APP_ORIGIN`).

A seed whose setup provisions nothing declares the same bindings and deploys through its own `deploy` verb. Resource names change from `rer-seedproof-*` or a chosen prefix to `<project>-<environment>-*`. The kit refuses rather than adopts an earlier installation's resources.

## Migration safety

SQL files have ordered unique names and SHA-256 identities. `_rer_deploy_migrations` is permanent controller-owned history. Applied entries must be an unchanged prefix of the desired set. A new migration gets an `applying` claim before its SQL and completion marker are submitted together to the D1 batch query API. Any interrupted, failed or uncertain outcome remains blocked and must be inspected explicitly; the kit never automatically retries, rolls back user data, or marks an unknown outcome successful. Readback checks every final identity.

Completion preserves the original SQL bytes and always starts on a new line.
Comment-only migrations are rejected before any provider request or ledger claim.
The controller adds a separator only when the final non-comment token is not a
semicolon symbol. This avoids an empty D1 statement after trailing comments
without treating quoted semicolons as terminators or changing migration hashes.

A lexical guard rejects standalone transaction/resource control statements (`BEGIN`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`, `ATTACH`, `DETACH`, `VACUUM`) at statement boundaries, including after a trigger. Bare `ROLLBACK` is also refused in conflict clauses and `RAISE`, which can roll back a batch without a standalone control statement. SQLite `CREATE [TEMP|TEMPORARY] TRIGGER` bodies and nested `CASE ... END` expressions are supported; quoted text and comments cannot create statement boundaries. Both ledger names are reserved in bare, double-quoted, backtick and bracket identifiers, including schema-qualified references. [SQLite also accepts single-quoted identifiers](https://www.sqlite.org/lang_keywords.html), so exact controller ledger names are reserved in every token, including data strings, relation names, virtual-table options and introspection arguments. Comments and longer descriptive strings remain allowed. This intentionally conservative policy does not attempt to authorize arbitrary SQLite name grammars. Incomplete quotes, block comments, parentheses, CASE expressions or trigger bodies and NUL bytes fail closed; trigger header expressions must close before BEGIN and body expressions before their statement semicolon. This guard protects controller custody; SQLite still validates application SQL syntax.

Existing Wrangler `d1_migrations` records lack content hashes. Automatic adoption would fabricate historical certainty, so those installations require separately reviewed history/hash adoption before this kit proceeds. The kit can extend its own previous migrations while retaining existing application rows. Local SQLite tests prove failure rollback in the test transport; the provider's actual failure atomicity, retained data, and two-deploy no-mutation behavior remain live proof obligations. The conservative `applying` claim prevents automatic replay even if a remote batch partially commits.

## Local operations and source templates

`operations/operations.mjs` retains v1 compatibility and supports declarative v2 `loops`. A required disabled loop fails. Enabled mail loops explicitly select `resend`, `sendgrid` or `cloudflare`; the corresponding nonblank key is required (`RESEND_API_KEY`, `SENDGRID_API_KEY`, or `CLOUDFLARE_EMAIL_API_TOKEN` plus `CLOUDFLARE_EMAIL_ACCOUNT_ID`). A conflicting `MAIL_PROVIDER` fails. Optional disabled features pass. No DNS, mail, build, deployment or provider request occurs in these checks. Existing v1 executable adapters remain the existing reviewed local contract; deploy-kit `check()` refuses executable configuration and accepts declarative v2 only. `mailPlan()` consumes the mail module's `mailDoctor(...,live:false)` once that module is integrated; absence is an explicit import error.

`createTemplates({destination,project,sourcePaths,commands,loops})` creates a new directory only, containing `edition.json`, `OPERATIONS.json` v2, **both** operations modules and the real edition-authoring tool modules. Commands/effects and selected paths must describe actual adopter files. Add actual sources, initialize Git and stage them, then call `lockTemplates(root)`: it invokes actual edition-authoring `lock` and `check`, generating real `sources.lock.json` hashes and retaining any recipe-selected origins. Existing destinations and locks are refused. It never invents source hashes or overwrites an owner edition.

## Validation and provenance

```
node --test modules/deploy-kit/tests/*.test.mjs operations/*.test.mjs
```

The tests cover real SQLite prior data, migration order/hash/failure/replay safety, fixture provider uploads and repeated no mutations across D1/R2/Queue/DO/Cron/secrets, wrong/missing mail inputs, transport boundaries/pagination, stale health/version, artifact links/custody, actual authoring lock/check and unchanged v1 regression tests. Owner-account tests use a fake Cloudflare API (`tests/owner-provider.mjs`, which adds KV, foreign resources and injected failures to the same fixture): first create, byte-identical re-run, partial failure and resume, a lost create response, a Worker upload failure, a lost first-upload response, collisions with resources the kit did not create, a Worker or bucket replaced under the same name, a missing workers.dev subdomain, token-scope failures, the state-file lock, and the CLI over a committed seed build. `pnpm verify:deployment` runs every deploy-kit test in Base verify. They are not live receipts. CF throwaway token/account ID and evidence persistence token remain missing until the owner supplies them. Prepare/build's Actions isolation and real default-seed remote health require the parent integration; no Mac provider login or live call was used.

Implementation references read: an earlier public seed release's own deployment scripts, Base `deployment/owner-migrations.mjs`, `operations/` and `edition-authoring/`. The ambient-login/catch-and-continue paths in those examples were not adopted. No private source was copied or merged.

Primary protocol references: [Worker upload](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/), [multipart metadata](https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/), [asset upload](https://developers.cloudflare.com/workers/static-assets/direct-upload/), [D1 query](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/), [Queue consumers](https://developers.cloudflare.com/api/resources/queues/subresources/consumers/), [R2 pagination](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/list/), [DO namespaces](https://developers.cloudflare.com/api/resources/durable_objects/subresources/namespaces/), [Worker versions](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/). Checked 6 October 2026; hosted conformance is not inferred from documentation.

Cron/build repair references: [Cron GET](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/schedules/methods/get/), [Cron PUT](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/schedules/methods/update/), [Cron replacement behavior](https://developers.cloudflare.com/workers/configuration/cron-triggers/), the published [Vite plugin 1.54.5 source](https://www.npmjs.com/package/@cloudflare/vite-plugin/v/1.54.5) (`src/plugins/output-config.ts`, `src/plugins/additional-modules.ts`) and [Wrangler 4.129.1 source](https://www.npmjs.com/package/wrangler/v/4.129.1) (`src/deployment-bundle/rules.ts`, `find-additional-modules.ts`, `no-bundle-worker.ts`).

## Additional adopter contracts

`packageBuild({root,source,runIdentity,productDirectory})` shares the inert Vite
packer with editions whose product is at repository root (`productDirectory:''`).
The default remains `default-seed`; caller-owned prepare isolation and build
commands still apply. Queue entries may declare `deadLetterQueue` as the name of
another declared queue with no consumer. Both resources are provisioned before
consumer reconciliation; provider `dead_letter_queue` is top-level, never a
numeric setting. Independent health verifies it and repeat refuses drift.

R2 reconciliation selects the explicit shared read-only list strategy
`api.list('/r2/buckets', {field:'buckets', pagination:'r2-bounded'})`.
This strategy is restricted to that exact endpoint and field and requests
`per_page=1000`, the documented maximum. Absent or null `result_info` is terminal
only when the page has fewer than 1000 buckets (including zero). A full page
without metadata fails closed. Present metadata must supply a valid positive
`per_page` no greater than 1000; terminal pages must be shorter than that bound.
Cursors are encoded, validated and checked for cycles. Any supplied count or
total count must agree with returned rows and completion, and totals cannot
change between pages. Request, page, row and response-size budgets still apply.
No metadata is fabricated and no request is retried. Generic `pagination:'cursor'`
retains its existing contract: omitted metadata fails, and its R2 null-metadata
exception accepts only a short page. D1/Queue/DO page pagination is unchanged.
The bounded strategy is covered with local provider fixtures; this change does
not itself establish authenticated provider conformance or deployed acceptance.
Protocol references checked 7 October 2026: [R2 list](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/list/)
and [queue consumer](https://developers.cloudflare.com/api/resources/queues/subresources/consumers/methods/create/).

## First health readiness and evidence

After an upload that changed the Worker, `deploy` gives `/health` a total
90-second readiness budget (`readiness.totalMs`, never above 90000). Retries wait
1 second, doubling to a 10-second cap, and never less than the 2-second poll of
the standalone window: 2, 2, 4, 8, 10, 10 ... seconds. Only transport failures,
404 and 5xx (including Cloudflare 52x) retry. A redirect, any other status, a
malformed or unhealthy body and a deployment identity mismatch fail at once.
Each request is capped by both the 30-second request limit and the remaining
budget, and no request starts at the deadline. An unchanged repeat uses the
existing library window and does not record first-upload readiness attempts.
The standalone CLI `health` command sends a single request. Library `verifyHealth`
retains the existing window, retrying only 404, 503 and network failures for
30 seconds by default.

The returned receipt carries `health: {ok, versionId, attempts}`. Each attempt is
`{offsetMs, status, cfRay, contentType, body, errorClass}`: `status` is null for
a transport failure, `body` is the first 256 response bytes decoded as UTF-8 and
`errorClass` is null for the passing attempt. A failed wait throws an error whose
message names the class and the last status (for example
`health-http-failed-last-status-503`) and which carries `attempts`, `status` and
the identity `receipt` (with `health.ok` false). Provider diagnostics are never
retained; the endpoint must not return credentials. `readiness: {totalMs, clock,
sleep}` selects a smaller bound and deterministic time; `healthOptions.now` and
`healthOptions.sleep` act as `clock` and `sleep` for the same purpose.

`onHealth(receipt)` runs after every attempt and at the end. A controller adopts
`onHealth: receipt => writeHealthReceipt(receiptPath, receipt)`, which atomically
replaces the mode-0600 receipt and refuses any change to its identity; the default
CLI and owner-account state do this. A no-op repeat never rewrites the original receipt.

## Read-only teardown verification

The kit does not perform deletes. After a seed has validated its receipt and
removed only its authenticated disposable resources, call
`verifyTeardown({api, plan, receipt})`. The default CLI exposes
`node modules/deploy-kit/cli.mjs verify-teardown` with the same controller inputs.
The target must be the exact receipt Worker with a `rer-seedproof-` prefix or
the default numeric `rer-base-stage-<run-id>` disposable stage name.
Verification reads the complete account Worker, D1, R2, Queue and Durable Object
namespace listings, and lists consumers for every surviving Queue. It rejects
any receipt resource ID/name or any resource/consumer with the disposable
prefix, including a foreign one; it does not authorize deleting those foreign
resources. Errors carry `remaining` with names and identities.

Deleting moves the provider's `total_count` while a listing is in progress. During
this post-delete snapshot only, `provider-pagination-changed` and
`provider-partial-list` discard the entire incomplete snapshot and restart all
listings. The default is four attempts with 250 ms exponential backoff capped at
2 seconds; `maxAttempts` is bounded to 1-8. Each attempt records its number,
offset and error class, and a complete attempt its counts. `onAttempt`, `clock`
and `sleep` are injectable. Exhaustion throws with every attempt; a partial listing
never counts as empty. The returned `listing` is the empty owned-scope view of the
complete snapshot that was read (an empty array for every owned type; foreign rows
are not copied into evidence, and each attempt's `counts` give the account totals).
On failure `error.remaining` names the survivors and `error.listing` holds their rows. Ordinary
`api.list` keeps all its strict pagination assertions. Workers and Queue consumers
use the explicit `pagination:'single'` strategy, restricted to those two
unpaginated endpoints; supplied pagination metadata must confirm completion.

A seed teardown adopts it by keeping every pre-delete receipt, consumer and
ownership check and its exact DELETE requests, and replacing its final
post-delete list-and-assert block with the shared verifier:

```js
import { verifyTeardown } from '../../modules/deploy-kit/index.mjs';
const verification = await verifyTeardown({api, plan, receipt});
return {ok: true, deleted: true, verification};
```

Worker deletion removes its schedules and bindings from the API, but not from
the provider's dispatch: a deleted cron Worker keeps being invoked (failing) until
the account's next scheduler refresh (see Cron above). A teardown that deletes a
Worker calls `deleteWorker({api, worker})`, which PUTs an empty schedule set, reads
the schedules back until the provider reports none (bounded, 60 seconds by default;
a set that does not settle fails with `teardown-schedules-not-cleared` and leaves
the Worker in place) and only then deletes. The deploy CLI prints one line after a
Cron deploy that the first scheduled run can take up to about two hours on some
accounts. The namespace listing
independently checks Durable Object removal. Persist the verification (or the
error's `attempts` and `remaining`) in the seed's teardown evidence. This Base change
modifies no seed repository. Protocol references:
[Worker scripts list](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/)
and [Queue consumers list](https://developers.cloudflare.com/api/resources/queues/subresources/consumers/methods/list/).

Named egress service grants may be declared as `services[].grant` alongside
`entrypoint`. The grant carries exact `allowedHosts`, service `sourceSha`,
`fingerprint` and the service receipt's `provider` identity (`versionId`,
`deploymentId`, `etag`). These are controller checks, not upload binding fields.
Before deployment and during health verification, deploy-kit reads the target
Worker's `EGRESS_GRANTS` plain-text binding and verifies the chosen entrypoint,
host grant, source and immutable deployment identity. Missing, duplicate or
widened grants fail closed, as do service/binding/entrypoint/environment drift.
Only the ordinary named service binding is uploaded. This supports service-owned
narrowing where Cloudflare omits service-binding `props` from settings/version
readback. Ordinary `allowedHosts` still maps to `props` and retains strict
readback; missing props are never silently accepted. See the
[egress service guide](../egress-service/README.md).
