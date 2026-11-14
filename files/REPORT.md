# Uptime protocol forms: carry and verification

Repository: just-every/run-uptime. Task: main-uptime-protocol-forms-1-c1.
Product branch: cloud/main-uptime-protocol-forms-1-c1.
Product head: b484d6d34b92c0a85f9b3780a574ddd89cfb1e1f.

## Result and implementation

The original round's two commits, ending at 70a4553b3ccfc5eef6274d59de8a75697b95e2a3, are carried as one commit onto main 8529deda750510402236ece09a9ab91f934a3231. The squash applied without conflicts. Main's newer tests, dependency upgrades, PDF work, contract text and clause judgments remain. The product diff contains only the nine original form/test files and regenerated sources.lock.json. No report, receipt or screenshot is committed to the product branch.

SMTP, POP3 and IMAP use protocol, host, port, TLS and installation-local credential-reference controls. Invalid ports and credentials over plaintext are refused. Dedicated synthetic delivery, receiving mailbox and timing survive editing existing monitors. No password is accepted by the form.

API transactions use setup, request and cleanup lists with add, remove and within-phase reorder controls. Steps expose method, URL, headers, body, assertions and captured values. Scalar variable types, explicit empty bodies and headers, optional assertions and declared live effects retain their saved shape. Both primary raw JSON editors are removed. No protocol, step type, assertion kind or live execution capability is added.

## Plan

PLAN.md contains the complete seven-step plan: configure fleet identity/launcher/helpers/hooks; inspect original source/evidence and squash onto current main; identify and run push-3's native journeys; capture and inspect both UI widths; refresh main and regenerate/check the lock last; push with identity/trailer inspection and require exact-SHA Verify; publish complete actual non-secret reports and receipts only on the evidence ref. No release, deployment, direct-main push, status promotion or new provider scope is authorized.

## Reproduced failure and fix

The workflow resolves push-3 through scripts/verification-plan.mjs. Its six journeys are command-journey, definitions-import, signed-runner, api-transaction-journey, failure-page-journey and business-provisioned. The local entrypoint was node .github/scripts/verify-ci.mjs push-3, run directly in the dedicated VM before pushing.

The first local attempt failed command-journey's existing monitorHydration assertion: Website URL stayed disabled. Its unchanged diagnostics recorded 404 responses for /src/domain/mail-probe/schema.mjs and /src/domain/api-transaction.mjs, followed by a failed Vite client import. The carried forms imported those domain validators into the browser, but Uptime's development asset policy deliberately does not expose domain/server source. This failure was introduced by the carried change.

The fix removes those two imports from the form modules. Native field validation and parsing remain, and the authenticated owner API still validates and normalizes complete mail/API definitions with the authoritative shared schemas. The asset allowlist and domain schemas are unchanged. The unpublished squash was amended before its first push; no published history was rewritten and no assertion was weakened.

The fixed command-journey passes discovery/manual forms, save and reload at 1440 with zero console/page errors and failed client loads, plus the installed PDF, sign-in, teardown, repeat setup, reset, import/export and retained-receipt checks. hydration-debug/failure.json and hydration-fixed/result.json retain the before/after browser diagnostics.

## Local results on the pushed head

| Check | Result |
| --- | --- |
| Typecheck | pass |
| Build | pass |
| Source lock, exact CI check | pass |
| Contract-document check | pass; zero errors and warnings |
| Generated local/deployment manifest check | pass; no source diff |
| Native mail journey, Node 22.20.0 | pass |
| push-3 command-journey | pass |
| push-3 definitions-import | local failure: ECONNRESET writing unchanged oversized-upload fixture |
| push-3 signed-runner | pass |
| push-3 api-transaction-journey | pass, both registrations |
| push-3 failure-page-journey | pass |
| push-3 business-provisioned | pass |

The full fixed shard passed command-journey, then definition import hit ECONNRESET at tests/definitions-import.mjs:84 while uploading its unchanged 2 MiB refusal fixture. That request uses no form code, and this carry changes no import route or server schema. The five remaining journeys were all run unchanged under Node 22.20.0 with outbound proxy variables removed from the local-only test process. Definition import repeated the same reset; the other four passed. The local full shard is not claimed green. PUSH3-RECEIPT.json, REMAINING-JOURNEYS-RECEIPT.json and the complete individual logs preserve both outcomes. Exact-SHA Verify remains mandatory.

The existing API transaction registration mounts proveProtocolForms: native owner sign-in, real emitted Worker/D1, create/save/read/reopen of SMTP/POP3/IMAP and login/create/read/delete API configuration, invalid port/plaintext-credential and foreign-origin refusal, list mutations and legacy-definition preservation. Its existing sandbox setup/cleanup, auth expiry, cancellation, debt and grant assertions also pass. The native mail regression exercises controlled signed protocol execution, auth/TLS failure, delayed receipt, receiver confirmation and synthetic-only removal. Neither proves new live-provider or hosted acceptance.

UI assertions run at 1440. Eight actual screenshots show mail connection, existing synthetic delivery, API transaction and existing API once at 1440 and 390. All were visually inspected; controls reflow without document overflow and axe found zero violations at the assertion width. The four-step API form is long; this carry retains the original design. BROWSER-RECEIPT.json and VISUAL-RECEIPT.json describe this bounded proof.

The source lock was regenerated last through node scripts/edition-authoring/cli.mjs lock and checked with CI's exact node scripts/edition-authoring/cli.mjs check. CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are untouched. One initial spec invocation used the VM's unpinned pnpm and refused without changing dependencies; the required toolchain rerun and final-head spec:check pass. The commit hook was reinstalled after setup. Diagnostic runtimes were stopped only by their own recorded PIDs; no runtime or browser remains listening.

## Counts and clause claims

Primary raw JSON setup editors: 2 before, 0 after. Journey commands: 47 before and after. Added test registrations: 0. Existing assertions deleted, skipped or weakened: 0. Contract counts: 37 done, 58 partial, 20 missing, 115 total before and after. Clause status changes: none. MAIL-001 and API-003 retain main's existing done judgments; the builder makes only the original bounded PARTIAL claims.

CLAIM MAIL-001 PARTIAL points=1 tests=tests/mail-journey.mjs#MAIL-001 owner configuration, signed native protocols, per-step incidents, receiver confirmation and synthetic-only removal; tests/protocol-forms-browser-support.mjs#proveProtocolForms
CLAIM API-003 PARTIAL points=1 tests=tests/api-transaction-journey.mjs#API-004 sandbox setup/teardown, cancellation, denied cleanup, retained debt and explicit operator resolution without a live charge; tests/protocol-forms-browser-support.mjs#proveProtocolForms
DEFAULT MAIL-001: Reuse runner-local credential references and existing protocol/TLS port defaults; no password is accepted by the form.
DEFAULT API-003: Reorder within each phase because the supported schema requires setup, request and cleanup order.
GAP MAIL-001: This UI round claims no new live mail-provider execution or hosted-provider acceptance.
GAP API-003: This UI round claims no new live API execution or hosted-provider acceptance.

## Product and CI custody

One fleet-authored and fleet-committed product commit was pushed through cloud-push.py. The complete origin/main..HEAD identity/trailer audit includes all parents and contains no OpenAI/Codex co-author. A fresh remote ref read confirms the exact product head. Main was fetched immediately before the push and still matched the base; the final lock regeneration produced no new diff. The candidate has no skip marker. No PR was created; the fleet owns branch landing.

Verify run 43597710287 was discovered on this exact SHA and is polled by one REST watcher at intervals of at least 300 seconds, including discovery. CI-DISCOVERY.json, CI-STATUS-*.json, CI-LATEST.json and GITHUB-CALLS.json preserve the actual run and budget. The final exact-SHA result is recorded below.

The old failed run 43559564706 attempt 2, job 132344272644, received one archive read: gh run view 43559564706 --repo just-every/run-uptime --job 132344272644 --log-failed. It returned exit 0 with empty output, no assertion, HTTP status or error body. It was not retried.

The cloud cannot run the fleet's Mac publication scanner. The fleet owns that unchanged gate and landing. No main push, release or deployment was made. Evidence is report-only custody and never substitutes for product readiness or acceptance. No credential, secret value, environment dump, held-out material or symlink is selected for evidence publication.

## Terminal result

READY: Verify 43597710287 completed/success on b484d6d34b92c0a85f9b3780a574ddd89cfb1e1f. This is the same exact pushed head as all final browser, API, native mail and source-lock receipts. Six GitHub calls were used: one old-job archive attempt, one exact-SHA discovery and four status reads separated by at least 300 seconds. No rerun or additional failed-job log call was needed on this candidate. The successful workflow supplies the complete CI wall, including push-3, despite the separately recorded local oversized-upload connection reset.

The carried editor import failure is fixed. Product blockers: none. Clause status changes: none. The Mac fleet still runs its publication gate and owns landing; no landing or deployment is claimed. The complete selected packet is published separately to refs/heads/evidence/main-uptime-protocol-forms-1-c1, whose exact head is returned in the terminal EVIDENCE line.

READY branch=cloud/main-uptime-protocol-forms-1-c1 head=b484d6d34b92c0a85f9b3780a574ddd89cfb1e1f
