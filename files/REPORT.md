# Uptime mail-off declaration fix

Author: Run Edit Run fleet, 2026-11-15.

The gate's failure was reproduced on d600eba12c99ca0865b91f77b12556f9aad314c6: `pnpm run test:base` exited 1 with `deploy.vars-secrets: MAIL_PROVIDER: wrangler.jsonc:23 (vars) and deploy.json:46 (secrets)`. The final change removes the redundant static MAIL_PROVIDER secret from deploy.json. Uptime keeps its existing public SendGrid default, its generated managed deployment spec and the native deployment adapter's selection of the effective provider binding.

## Declaration choice

One read-only GraphQL request retrieved Oncall and Lamp main. Both declare MAIL_PROVIDER as an optional deploy secret; Oncall omits the Wrangler key, while Lamp keeps an empty Wrangler placeholder. The relevant common requirement is a single effective declaration with the selected deployment value supplied through ordinary input handling.

Uptime's retained managed-delivery producer requires a public MAIL_PROVIDER field in its emitted spec. Removing the Wrangler key passed first-party check but failed `pnpm run spec:check` with `Managed mail requires public MAIL_PROVIDER`. Keeping an empty placeholder satisfied the spec producer but still failed rer 0.2.118's vars/secrets clash check. Those attempted layouts cannot satisfy both required readers here without changing Base. Uptime therefore retains its required public declaration and removes the newly added, redundant static secret. This preserves existing managed artifacts and avoids Base changes.

The static secret is unnecessary: Base production-auth reads the packaging publicVariableNames and the explicit MAIL_PROVIDER input, including none. The existing native selectMailDeclaration helper independently builds the effective Worker secret declaration for selected providers. An omitted provider keeps SendGrid in deploy planning, native startup validation and runtime. Explicit sendgrid, resend, cloudflare, rer and none retain the previous behavior; none plus any sending credential still refuses.

The first published save (584da6da0e4235088f267d8644071e678ad8dbfe) used the initial removal layout. Its additional spec check exposed the managed requirement before any READY claim. A subsequent real commit corrects that save without rewriting published history. Its watcher was stopped before its first GitHub request. The terminal product SHA and separate exact-SHA CI verdict are in product-receipt.json and ci-watch-receipt.json.

## Scope and tests

The prior mail-off head was replayed onto main 433f7138430fa08d14570a58eb46bc5a14d7fadc, retaining main's health-version change, newer mail-startup snapshot assertions, contract judgments and release metadata. No Status, Gap or Evidence cell changed; no generated acceptance/claims view is committed. No version bump, release change, Base source change or write to another repository is included in this fix.

Existing journeys were extended, without adding a test registration or script:

- tests/mail-off-support.mjs#proveMailOff: positive native validation, deployment plans and Base preflight for omitted provider and each existing enabled provider, followed by the existing complete mail-off runtime flow. Cloudflare uses its documented shared key input for Base preflight and native key for its deployed binding.
- tests/owner-deploy-lifecycle.mjs: an actual rer deploy with no MAIL_PROVIDER, native SendGrid credential upload, repeat custody, and explicit SendGrid shared-key mapping on the resumed deployment; the existing mail-off deployment and guarded rer signin checks remain.
- tests/hosted-alerts.mjs: actual emitted Worker SendGrid delivery with MAIL_PROVIDER absent, retaining every existing alert and provider-edge assertion.
- tests/public-paths.mjs remains unchanged and runs main's newer startup refusal/recovery checks as well as public path admission, rate limits and fail-closed behavior.

The required local commands are recorded in product-receipt.json and their actual logs: pnpm run test:base (before and after), pnpm run typecheck, npx -y @runeditrun/rer build, the four required journeys, source lock check and spec freshness. Contract write and check passed together; after restoring main's generated views, contract check reports only expected ACCEPTANCE.md drift. No full local rer verify was run.

The existing mail-off journey proves fresh owner setup, first-run completion, Settings save, an incident opening and recovering, equal 503 mail_unavailable responses for known and unknown addresses, unavailable alerts with no accepted delivery, protected private doors and no outbound mail request. Its existing browser proof captures sign-in once at 1440 and 390; assertions use 1440. The actual rer signin journey proves deploying-account/receipt custody, one-time owner grant consumption, replay refusal and missing/wrong custody refusal. Provider network edges are the existing fixtures; no real deployment, provider account or live mail was used.

Initial positive-fixture iterations corrected Cloudflare's shared preflight key input and the canonical trailing slash on the synthetic relay URL. The first owner-deploy run also stopped before product work because default Node 24 could not acquire the pin inside its isolated, network-restricted HOME; rer's already installed Node 22.20.0 was placed on PATH. Initial failed logs are retained honestly. These corrections changed neither product behavior nor an existing assertion to obtain a pass.

## Claims and counts

Counts before/after are unchanged: 115 clauses = 37 done, 58 partial, 20 missing; 47 declared push journey tasks. The four required top-level journeys remain four. No new registration or test script was added by the fix.

CLAIM STARTUP-001 PARTIAL points=none tests=tests/mail-off-support.mjs#proveMailOff; tests/owner-deploy-lifecycle.mjs#real rer deploy covers fresh custody, automatic legacy upgrade, conflicts, named keys, exact repeat, resume and foreign ownership refusal
DEFAULT STARTUP-001: Absent MAIL_PROVIDER continues to select SendGrid; only explicit none disables mail. Keep Uptime's managed public declaration, remove its redundant static deploy-secret declaration and preserve native dynamic provider bindings.
GAP STARTUP-001: Existing broader configuration/readiness, hosted and provider-account qualification gaps remain. No DONE claim. C1, C2 and C3 remain outside this fix, as requested.

Product custody and evidence publication are separate. Full publication scan, independent required re-gate, landing, generated acceptance views and final main CI belong to the fleet. No landing or live operational readiness is claimed here.

The final review also retained the original shared-input isolation assertion on the resumed deployment that actually supplies MAIL_API_KEY, alongside the positive native-key mapping assertion. That additional test-only commit adds no registration and changes no product behavior. Its owner deployment journey and fresh source/base checks are retained in the terminal receipts.

## Terminal product custody

Branch: `cloud/main-uptime-mail-off-1-fix1`. Head: `732ba43d9eade6d00bbec6180b2dc42c83edbcd4`. The remote ref matches this SHA; the worktree is clean. All four candidate commits have fleet author and committer identities and no trailers. Each of the three product pushes succeeded on its first attempt, preserving published history. No PR was created; the lane receives the branch for re-gate and guarded landing. No default branch was pushed. Every required local command and all four named journeys were then rerun successfully on the exact committed head `732ba43d9eade6d00bbec6180b2dc42c83edbcd4` with a clean checkout before and after. This includes typecheck, emitted build, first-party check, source lock and managed-spec freshness. The exact-head receipts and fresh screenshots are in the packet. Exact-SHA Verify is diagnosed below.

## Exact-SHA Verify

Verify run [43774540585](https://github.com/just-every/run-uptime/actions/runs/43774540585) completed on `732ba43d9eade6d00bbec6180b2dc42c83edbcd4` with conclusion failure. Its only independent failure is build job 132997750875, `node src/base/contract-docs.mjs check`: 0 prose errors, 0 warnings, and expected ACCEPTANCE.md generated-content drift. Plan and credential-free artifact prepare succeeded. The shards were skipped because build failed, and aggregate verify job 132997925445 consequently failed its required-coverage check. Both failed job log archives were read exactly once and retained, omitting only GitHub's generated environment display blocks from public evidence.

This is the brief's explicit generated-view exception, so the candidate is READY under that contract. No generated view was committed to obtain it. There are no other independent CI failures. The task used five budgeted GitHub calls: one combined declaration read, one exact-SHA discovery, one completed-run jobs read and one archive read per failed job. Independent re-gate, full publication scan, view regeneration and landing remain with the fleet.
