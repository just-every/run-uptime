# Uptime f164 redirect failure snapshot repair

Recorded 2026-11-12T16:39:07Z

Repository: just-every/run-uptime
Branch: cloud/sd-uptime-f164-snapshot-fix-1
Final product head: 4e5d09c76ece555a9924833e10a371de036c6a0c
Current-main integration: 04998fe899d4bad1cf4186c7eae5a96fb9a6a42d
Original saved journey: a6a189444625c60b680a1805d354a61d13cf1675
PR: none required; push Verify is the repository's pre-main entry point.

The statusless redirect-error snapshot is repaired. The original enrolled production-runner journey now reaches native intake, bounded redirect failure, cessation, restart and ordinary scheduled recovery. NETWORK-001 remains PARTIAL. No complete acceptance point is newly claimed: only acceptance 1's redirect-hop-exhaustion cell is qualified.

## Plan and execution

1. Configured fleet identity and the supplied decrypted-bundle Git helper, push guard and commit-message cleanup, preserving repository hooks. Refreshed the task launcher, used the declared shallow filtered product checkout, and read the contributor instructions and inline bounded brief. The full initial plan is in PLAN.md.
2. Checked out the exact saved SHA and ran the registered `node tests/tls-auth.mjs` command under Node 22.20.0 before editing. It failed with exit 1 and the exact native intake refusal below. Retained actual command output, signed attempt bodies and independent TLS receiver observations.
3. Repaired only `runners/src/probes.mjs`: a redirect error has no HTTP result, so the snapshot must not inherit the last redirect response's status. The catch now sets captured status to null for the redirect category before snapshot construction. Intake validation, signed payloads, TLS, capture policy, limits and timeouts remain unchanged. `runners/src/public-http.mjs` needed no edit.
4. Preserved the original journey, routing helper and single existing `tests/tls-auth.mjs` mount. After the production fix exposed a later assertion, diagnosed its cross-clock comparison: receiver time 1794500269001 was compared with signed aligned start 1794500269007. The production runner deliberately shifts signed times to the Worker clock. The proof now checks every receiver request inside an independently timed execution interval in the receiver's own clock, and adds a stricter assertion that the whole real child invocation, enrollment, canary and signed intake complete inside the unchanged saved request timeout. Signed probe-duration checks remain. The test additionally retains its actual receipt on any failure. No timing tolerance, new test registration, skipped assertion or limit increase was introduced. All redirect category, TLS, wire count and order, cessation and restart, scheduled recovery and immutable-history checks remain.
5. Ran the registered touched journey and typecheck. Both passed. Generated contract views with write then check, restored main's views whole, regenerated the source lock last and checked it. No contract, generated-view, workflow, source-pin, migration, protected-attempts or deployment-spec change was committed. Existing STATE-001 and STARTUP proofs remain intact.
6. Preserved the original ancestry and main by an additive merge. The required pre-first-push rebase flattened the initial merge and dropped its merge-only repair, producing the intermediate skip-CI save b0f6944e7c16a6ad8de1ea2e11e6ae9f84dcf940. The final additive merge restores the complete tested repair tree from 64ac74852c1e16a29c510a3330049186e3a4e0d4 while retaining that published save. The final tree exactly matches the restored repair tree; the original saved SHA and current main are both ancestors. No published history was rewritten and no force push was used. All six candidate commits, including side parents, have fleet authors and committers and no trailers. The supplied push guard published the final branch successfully on its first attempt.
7. A single REST watcher discovers and polls Verify on the final exact SHA, with at least 300 seconds between observations and a ten-call budget. Final CI observations and API accounting are in ci-receipt.json and api-budget.json. Evidence is published separately on the task's evidence ref. Product READY is distinct from evidence publication and landing.

## Before and after the same native case

Original command: `UPTIME_REDIRECT_RECEIPT=<packet>/before-receipt.json timeout 1200 node tests/tls-auth.mjs`
Original head: a6a189444625c60b680a1805d354a61d13cf1675
Exit: 1

Exact failure:

```text
AssertionError [ERR_ASSERTION]: signed runner failed (3196 private diagnostic bytes); last completion status 400, error Invalid failure snapshot evidence
```

VERIFY_REPRODUCED {"head":"a6a189444625c60b680a1805d354a61d13cf1675","command":"UPTIME_REDIRECT_RECEIPT=<packet>/before-receipt.json timeout 1200 node tests/tls-auth.mjs","exit":1,"failure":"AssertionError [ERR_ASSERTION]: signed runner failed (3196 private diagnostic bytes); last completion status 400, error Invalid failure snapshot evidence","test":"tests/tls-auth.mjs#proveNetworkRedirectCycle","job":"local original saved SHA reproduction"}

The signed attempt was target_failure with redirect category and no observation status. Its snapshot incorrectly retained 302. Native intake returned HTTP 400 with `{"error":"Invalid failure snapshot evidence"}`. The baseline receiver counted two successful-chain requests followed by six cycle requests. before-tls-auth.log, before-receipt.json and reproduction.json retain the actual failure.

After repair, the same owner-created definition and revision complete native intake with the actual production runner signing the submitted bytes. The cycle observation has no status and its snapshot has status null. The bridge forwards its bytes unchanged. after-receipt.json retains the complete actual wire rows, signed observations, current definition, three historical slots and the incident's matching trigger and recovery.

| Phase | Outcome and visible state | TLS connections | Requests | Signed duration |
| --- | --- | ---: | ---: | ---: |
| Short redirect | pass, Healthy | 2 | 2 | 24 ms |
| Same-origin cycle | target_failure, redirect, Failing | 6 | 6 | 40 ms |
| Restored short redirect | pass, Healthy | 2 | 2 | 23 ms |

The saved timeout remains 3000 ms. The test observes exhaustion without asserting the production hop limit's numeric value. It independently counts actual TCP connections, verified TLS handshakes and ordered receiver requests. The cycle's signed category is redirect rather than timeout or runner_error; its canary passes. Two complete saved-timeout quiet windows, one before and one after persistent Worker restart, produce zero extra traffic and no surviving target socket. No new revision is created. Ordinary due signed recovery closes the same incident and leaves all earlier slot and observation evidence unchanged.

## Touched checks and mechanics

- `timeout 1200 node tests/tls-auth.mjs`: exit 0. Includes retained TLS trust, authentication, credential stripping, keyword and hostname-negative assertions as well as proveNetworkRedirectCycle.
- `pnpm run typecheck`: exit 0, application and runner TypeScript projects under Node 22.20.0.
- Required setup and emitted production build: exit 0 through cloud_run; no full local Verify or unrelated test suite was run.
- `node src/base/contract-docs.mjs write`: exit 0, wrote 0 documents. `check`: exit 0, 0 prose errors and 0 warnings. Restored ACCEPTANCE.md and docs/CLAIMS.md whole from main.
- `node scripts/edition-authoring/cli.mjs lock` and `check`: both exit 0, lock fresh. No migration-ledger check applies because no migration changed.
- `git diff --check`: pass. Final tracked checkout clean. Protected files, contract source, generated views, workflow and package pins have no diff against integrated main.
- Local execution preceded the final commits; all relevant runtime and journey source bytes are unchanged on the candidate. Exact-SHA Verify supplies the candidate-wide CI proof. Source hashes and actual receipts are in results.json and mechanical.json.
- The ordinary-module timing diagnostic reached the new failure and retained native HTTP 200 plus null snapshot status. An earlier eval-mode diagnostic hung during emitted Worker startup and supplied no proof; its own Node and Worker processes were stopped after its timeout. diagnostic-summary.json and its selected logs disclose that unsuccessful diagnostic honestly.

## CI and custody

Verify run 43258163840, push event, completed, conclusion success, exact head 4e5d09c76ece555a9924833e10a371de036c6a0c, https://github.com/just-every/run-uptime/actions/runs/43258163840

The final head has no skip marker. The intermediate save has no Verify claim. Only the final named cloud product branch was pushed. No PR, main push, tag, release, deployment, remote publication scan or Run site execution was performed. Full-history publication scanning, generated-view commits, landing and candidate Run site are guarded Mac lander duties. The source and report packet contain no provider secrets, private held-out material or environment dump.

## Claims, counts and remaining scope

Before and after: 37 DONE, 58 PARTIAL, 20 MISSING, 115 clauses. NETWORK-001 PARTIAL → PARTIAL. Clause status changes: none. The repository still selects 47 unique journey commands; this round completes the originally supplied native journey inside its existing mount, with no further registration. No full NETWORK-001 DONE claim or hosted or provider readiness is made.

CLAIM NETWORK-001 PARTIAL points=none tests=tests/tls-auth.mjs#proveNetworkRedirectCycle

PROBE NETWORK-001 acceptance-1 redirect-exhaustion cell: owner-created ordinary public HTTPS monitor, actual enrolled signed runner, trusted receiver and passing canary → short pass, bounded redirect target_failure accepted by native intake with null snapshot status, zero resumed traffic through restart, ordinary due recovery and immutable old history. The whole compound acceptance point remains open.

GAP NETWORK-001: Broader transport qualification remains owed, including rebinding before connection, complete redirect-chain re-resolution and forbidden-address families, exact-origin credential binding, timeout, body and encoding bounds, broader hostname and credential combinations, and zero-connection qualification for rejected destinations. Existing mixed-DNS and HTTPS-downgrade scope, f143 status correction, f150 relative redirects, f153 gzip, f157 body bounds and f160 hostname-mismatch campaigns remain intact and are not re-claimed as new closure. Console work owned by uip, hosted and managed-location work, heartbeat and TLS protections, shared runner and runtime helper holds, protected attempts and deployment-spec leases, account, device, sibling and Platform obligations, all queue entries and continuation holds remain unchanged. Allowed cycle endpoints necessarily receive connections. Signed intake and inactive archive validation continue to require truthful statusless snapshots; no archive-validator relaxation or new archive qualification is claimed.

No new policy default was needed. No plan queue or clause status row was edited; the planned redirect-exhaustion cell alone is completed and NETWORK-001 stays held PARTIAL. No screens changed, so UI browser proof does not apply. The DONE-riders full-clause bar is deliberately not claimed; the remaining compound point and guarded landing remain explicit.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none, no migrations changed.

Blockers: none
