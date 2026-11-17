# Same-account public check fix

Author: Run Edit Run fleet. UTC date: 2026-11-16.
Tag: sd-uptime-same-account-1.
Repository: just-every/run-uptime.
Branch: cloud/sd-uptime-same-account-1.
Candidate: fc4ab424c812ad5d4309bdb68ddadc4093480a8e.
Base: f5ae7e2e254bc90c64d2ec617e617a2fe3dd1ed9.
PR: none created; the seed has a branch-push Verify entry point and the fleet owns landing.

## Result and diagnosis

All three Worker configuration sources now explicitly opt into `global_fetch_strictly_public`, preserving `nodejs_compat` and compatibility date `2026-09-08`. They are root wrangler.jsonc, deploy.json for the owner deployment lifecycle, and scripts/deployment/plan.mjs for the older artifact-controller path. The generated management/integration/deployment-spec.json carries the flag too. The built dist/server/wrangler.json was inspected and exercised by the hosted tests with both flags.

The confirmed defect was the missing public-routing opt-in. Cloudflare's compatibility-flags section “Global fetch() strictly public,” read 2026-11-16, rendered lines 1684–1692, says enabled requests use the public front door; without it, own-zone fetches go to the origin, ignoring mapped Workers and bypassing Cloudflare security settings. Its Fetch documentation lines 614–615 identifies the flag or service bindings as the Worker-to-Worker fetch choices. Its Errors and exceptions line 624 identifies 1042 for unsupported same-zone Worker fetch, but also for a workers.dev URL without a serving Worker. The reported Lamp 404 therefore remains consistent with, but does not conclusively identify, 1042: its original response body was unavailable.

Sources:
- https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public
- https://developers.cloudflare.com/workers/runtime-apis/fetch/
- https://developers.cloudflare.com/workers/observability/errors/

The existing date supports the flag; no compatibility-date bump, release, rer pin adoption, refresh-base, Base clone or provider deployment was performed.

Failed status reasons now include the actual HTTP status and a returned numeric Error 1xxx label, extracted only from the sanitized failure-snapshot prefix. The existing encrypted snapshot details carry the first 16 KiB of body under normal masks, credential/email redaction, retention and erasure. Arbitrary body text is not duplicated in indefinitely retained history reasons. Expected-status semantics remain unchanged. DNS checks, private-address and localhost DNS refusals, manually validated redirects, timeouts, TLS policy, request budgets, self-origin refusal and the separately signed Node runner retain their existing implementation.

The docs specify account token permission groups Workers Scripts: Edit and D1: Edit, and state there is no name or prefix input: uptime-monitor-<environment>, D1 <worker>-db, copies named with --environment only. OPERATIONS.md and docs/same-account-checks.md name the later live comparison against a separate workers.dev Worker and a hostname on the same account's zone, each with an identical external request and successful/failing response receipts.

## Plan and validation

PLAN.md contains the complete execution plan. The local commands and actual result metadata are in CHECKS.json. TYPECHECK.txt and HOSTED-ALERTS.txt contain their command output with checkout paths normalized; PRODUCT-PUSH.txt is the successful guarded transport receipt with credential metadata omitted. COMMIT-AUDIT.txt records the entire product candidate's identity and message.

Passed: setup, rer build, spec generation and consistency check, both TypeScript projects, the entire touched hosted-alerts journey, regenerated source lock and its check, and diff whitespace validation. The cloud toolchain selected Node v24.19.0 / pnpm 10.12.4 for direct commands; rer used its repository lifecycle. CI uses the repository's Node 22.20.0.

The existing hosted probe journey now reaches a workers.dev-shaped target and an own-zone-shaped sibling through fake DNS and HTTP edges. It proves same-origin and cross-origin validated redirects, failed 404/Error 1042 details, bounded redacted snapshots including an operator mask, retries, restart, stable request identification, recovery and immutable prior history. It also verifies literal loopback/metadata admission refusal, loopback redirect refusal, and no outbound target requests when localhost or mixed public/private DNS answers resolve privately. No Cloudflare routing internals were added to application code or mocked as product logic.

One initial new assertion incorrectly expected localhost URLs to be rejected at monitor creation. Existing policy accepts the definition and refuses private DNS at execution. The final test exercises that boundary and passes, with no weakening or removal of existing assertions.

Counts: push journey command registrations 47 before / 47 after; this round adds zero registrations and extends the existing hosted journey. Contract summary counts stay 37 done / 58 partial / 20 missing, total 115, before and after. CONTRACT.md and generated ACCEPTANCE.md/docs/CLAIMS.md are unchanged. Changed product files: 10, including regenerated sources.lock.json last.

## Custody and remaining proof

The product branch was pushed successfully at its first real commit, fc4ab424c812ad5d4309bdb68ddadc4093480a8e, through the fleet guard on the first attempt. No main/default-branch push, force push, PR mutation or landing was performed. All candidate author and committer identities are Run Edit Run fleet <fleet@runeditrun.com>; there are no trailers. The refreshed main was unchanged before the unpublished rebase.

Exact-SHA Verify run: 43980786946, https://github.com/just-every/run-uptime/actions/runs/43980786946. CI-DISCOVERY.jsonl and later CI receipts record actual API observations; the final status and blocker are recorded below. Only one watcher is used, with at least 300 seconds between calls for this run, within the ten-call GitHub budget.

The fleet's complete publication scan remains with its Mac gate, as explicitly required by the cloud adaptation. PRODUCT-REF.txt independently confirms the remote product branch SHA. The task-side diff was reviewed for credentials; evidence includes only explicitly selected non-secret regular report/receipt files. Evidence publication is a separate report-only ref and is not product READY, acceptance or landing.

Not run: either live same-account Cloudflare case. They are deliberately assigned to the later authorized account round. Local fake-edge behavior does not establish Cloudflare account routing, hosted operation, geographic vantage or provider acceptance. The original deployment's exact 404 cause remains unverified without its body.

No contract clause claimed; this is the same-account check fix.

## Final CI result and blocker

Exact-SHA Verify run 43980786946 completed **failure** on fc4ab424c812ad5d4309bdb68ddadc4093480a8e. Plan, contract-docs, build, prepare and seven of eight shards passed. Shard push-3 passed both the touched hosted-alerts journey and owner-deploy-lifecycle. The contract-generator exception does not apply: contract-docs passed, and a real test assertion failed elsewhere.

Failed job 133696920242, shards (push-4), stopped in tests/command-journey.mjs. At tests/local-signin-truth-support.mjs:83–84, the invited responder's printed CLI handoff was opened and completeBrowserSecondFactor called. tests/mfa-auth-support.mjs:15 expected the live Base session's factor-status request to return 200; it returned 401. The aggregate verify job 133704028764 then rejected the failed shard. CI-JOBS.jsonl and the two sanitized failed-job log receipts record those actual failures. Both logs were fetched successfully once through the prescribed archive command; no blocked blob redirect was retried. Environment blocks are excluded from public receipts; raw CI logs stay outside the selected packet.

The auth implementation and all three failing test files are identical to origin/main. The invited handoff path calls the factor helper immediately after page.goto, while the earlier owner handoff in the same file explicitly waits for navigation; this suggests a readiness race but is not a proven root cause. No auth bypass, retry, assertion change, CLI pin adoption or unrelated test edit was made. That investigation/fix is outside the check-fetch/configuration lease and must be a separately scoped round. No workflow was rerun or dispatched.

GitHub budget used: eight task calls (one discovery, four status polls, one jobs listing, two once-per-failed-job log archive commands). There is no READY claim. The product remains pushed at the recorded SHA, with no unpushed changes. The exact blocker is **Successful exact-SHA Verify**, specifically the local invited-role sign-in assertion returning 401. The later live Cloudflare proofs remain separate and deliberately unrun, rather than the blocker for this candidate.

No contract clause claimed; this is the same-account check fix.

Final packet assembled UTC: 2026-11-17T00:00:44Z. Author: Run Edit Run fleet.
