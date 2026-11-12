# sd-uptime-c-f167 results

Repository: just-every/run-uptime. Product branch: cloud/sd-uptime-c-f167.
Candidate: 3c3aa4c459d2688d6f6a7576b7658722db238012. Main inspected: 88c586f6fabdaed6768ddc8072af2340310a7ace.
No PR is required: Verify has a branch-push entry point. No default branch was pushed.

The selected acceptance-4 slice is implemented. SURFACE-006 remains MISSING; no complete acceptance point or DONE promotion is claimed. Before and after: 37 DONE, 58 PARTIAL, 20 MISSING, 115 clauses, 47 registered journey commands. The new support is mounted once in the existing agent-door journey; no new journey command or registration is added. No existing assertion was deleted, narrowed, skipped or conditionalized.

## Plan and implementation

The complete plan is in PLAN.md. Execution followed that plan: inspect the saved-definition classifier and single-cleanup proof; count saved cleanup steps inside the existing one-probe, zero-retry API boundary; add an independent owner-created two-cleanup fixture and a signed production-runner result; exercise real agent and person public doors; run the touched journey and mechanical checks; push only the named product branch; publish this separate packet for guarded landing.

The classifier now uses the number of saved cleanup steps as its possible-debt count. API type, one probe, zero retries, setup presence, nonempty cleanup, enabled state and the existing open-debt boundary remain required. Other shapes remain unqualified. No runner implementation, shared runtime helper, protected attempts source, deployment specification or UI implementation changed. The original single-cleanup support and published conformance fixture remain byte-identical to main.

The new proveManualMultiCleanup creates two enabled API monitors through the owner API with two cleanup steps each and separately enrolled runner authority. One scheduled production execution succeeds at setup, request and the first cleanup, fails the second cleanup, and is accepted through HMAC-signed runner intake. The proof independently reads saved revisions and both native debt records and their observation link. The first monitor has one open debt, so its two possible debts reach three. The second has zero open debts, so two possible debts stay below three.

Unmodified autonomous and held policies are exercised first. Selective-live and blocked-live variants explicitly allow the external check class so the live decision is independently observable under each policy and protocol. Modern pending responses are input_required; legacy responses retain approval_required. Genuine signed-in person approval posts the exact saved revision and summary digest. Each accepted call appends exactly one queued, unclaimed manual slot and its originating agent custody; replay appends nothing. The agent-created slots are never dispatched. The proof compares all unrelated durable tables, retained scheduled slots, observations, monitor state and cadence, incident readback, debt records, Worker requests, target socket traffic and mail. Allowed bookkeeping tables are explicitly enumerated and the decision relay is independently checked.

## Bounded proof map

All line references below are in tests/agent-manual-multicleanup-support.mjs unless stated otherwise.

| Item | Public-door proof and observation | Result |
| --- | --- | --- |
| Acceptance 1, irreversible debt resolution and setup resumption | Outside selected POINTS; no resolution is performed by the new proof. | Held; no claim |
| Acceptance 2, incident ownership and destructive grouped actions | Outside selected POINTS. | Held; no claim |
| Acceptance 3, reminders, fallback and monitor, incident and route facts | Outside selected POINTS. | Held; no claim |
| Acceptance 4, multiple cleanup calculation | Owner monitor writes and runner enrollment at lines 27–64; production scheduled execution and signed intake at 65–77; saved revisions, two steps and one linked open debt independently read at 80–94. | PASS selected shape |
| Acceptance 4, named live effect and person summary | MCP classification at 157–184; person summary names the native monitor, one open debt, two possible debts, three total and exact debt identity at 140–154. | PASS selected shape |
| Acceptance 4, approval holds without execution | Complete native-state comparison before person approval at 182–185. | PASS |
| Acceptance 4, approved execution and replay | Person POST at 187–194; one queued unclaimed slot and original person and agent custody at 123–138; repeated identical key changes no native state. | PASS |
| Acceptance 4, unsafe live policy refusal | MCP call with live blocked at 195–201: policy_blocked, no result or approval, no native changes. | PASS |
| Acceptance 4, below-boundary exclusion | Zero-open counterpart remains external, succeeds without live approval under both selective and blocked variants, and replays without another slot at 203–208. | PASS |
| Acceptance 4, no-fixture exclusion and prior single-cleanup boundary | Unchanged tests/agent-manual-debt-support.mjs proveManualDebt remains invoked immediately before the new support. It retains ordinary HTTP exclusion, the two-existing-debts-plus-one-possible-debt approval slice and stale debt-evidence refusal. | PASS in final integrated journey |
| Inherited BASE-AGENT-006 class and policy duties in this slice | Runtime classifications, both protocol encodings, actual native approval, audit approver and class readback at 140–208. | PASS selected slice; broader duty not promoted |
| Scheduled health, evidence and unrelated state | Explicit all-table preservation at 96–118, 123–138, 169–176, 185–215. No further runner poll occurs after signed fixture establishment. | PASS |

Both policies and both supported protocol versions execute the same matrix. PROBE lines are retained in agent-door.log. The helper is imported at tests/agent-door.mjs:8 and invoked once at line 319 through the existing push Verify command. A deliberate temporary regression setting the possible count to one failed the first native live-class assertion with exit 1; mutation.log records the actual failure. The intended implementation was restored and rebuilt before the final integrated run.

## Local checks and development results

- Focused emitted-Worker proof: exit 0, all four policy and protocol combinations; approval summary personally inspected at 1440 and 390.
- Final integrated command: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tests/agent-door.mjs, through cloud_run with a 1200-second timeout. Exit 0. All existing and new assertions pass; agent-door.log records the complete successful output.
- pnpm run typecheck: exit 0.
- npx -y @runeditrun/rer check --profile first-party: exit 0.
- node src/base/contract-docs.mjs write, then check: both exit 0. Generated ACCEPTANCE.md and docs/CLAIMS.md were restored whole from origin/main and are not in the product commit. The restored-view check then exits 1 only because ACCEPTANCE.md differs from its generated content; restored-views-check.log records that expected lander-owned condition.
- node scripts/edition-authoring/cli.mjs lock, then check: both exit 0 after the final source and test edits. No migration changed; migration ledger check is not applicable.
- git diff --check: exit 0. Full Status table unchanged; no new email-shaped text or credential-shaped fixture values. Candidate authors, committers and trailers inspected over every candidate commit, including side parents.

The initial full run loaded an earlier in-memory version of the newly written helper and failed its assertion on a nonexistent task.manual DTO property. The corrected proof independently reads the persisted slot's manual flag instead. Focused fixture development also exposed the fresh owner MFA prerequisite and a mistaken table name; the final helper completes real native MFA and compares actual retained tables. The final integrated run is authoritative; no existing assertion or production authority check was weakened. These were local development failures, not CI repair rounds.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0

## DONE riders and pre-handoff checks

A complete clause DONE claim is intentionally withheld. The required slice retains MISSING and the following limits.

| Rider | Assessment |
| --- | --- |
| 1 | PASS for the selected runtime slice in the proof map; full clause outcomes remain unproved and no complete acceptance number is claimed. |
| 2 | PASS for selected native allow, genuine person approval, blocked refusal and below-boundary counterpart; wrong possible count visibly fails the journey. |
| 3 | Local journey PASS; exact-candidate push Verify has only the permitted generated-view failure; shards were skipped and full suite execution remains the lander's duty. Its event and actual conclusion are recorded below and in candidate-ci.jsonl. The existing Verify command loads the new helper without a workflow change. |
| 4 | Relevant production and test bytes are bound in RECEIPT.json; no relevant byte changes follow the final runtime run. |
| 5 | INSPECTED: SURFACE-006 continues citing BASE-AGENT-006; no inheritance or requirement change. |
| 6 | Generator write and check PASS before restoring main's views; Status, Gap, Evidence and counts remain exactly main's judgments. The lander owns regenerated-view commits. |
| 7 | INSPECTED: no acceptance point, clause id, ruling or coverage mapping changed. |
| 8 | PASS scoped owner MFA, genuine person approval and blocked refusal; existing revocation, native authority and erasure-replay assertions remain in the full journey. |
| 9 | INSPECTED: only network-edge fixture execution is claimed. No hosted, provider, legal or live account qualification is inferred. |
| 10 | Not applicable: no new custody, spending or authority default adopted. Existing native authority and declared class policy are retained. |
| 11 | Pending guarded lander: main equality, candidate full-history publication scan and landing Run site are not claimed. |

Pre-handoff: selected behaviours have a public-door sanity proof and a demonstrated regression failure; no prior assertion removed or weakened; full journey retains revoked-credential and erased-target replay fences; no UI implementation touched. Both approval viewport captures show the computed summary in the existing interface. Source lock is fresh. Candidate CI status is stated honestly below. Publication scanning cannot run in this cloud and is delegated to the guarded lander: commit=3c3aa4c459d2688d6f6a7576b7658722db238012, complete=unestablished, historyScanned=unestablished, findings=unestablished. This is not a scan receipt or a landing claim.

## Custody, CI and held remainder

Exact-candidate push Verify 43275702351 completed with conclusion failure on 3c3aa4c459d2688d6f6a7576b7658722db238012. The only substantive failure is build job 131383500929 at `node src/base/contract-docs.mjs check`: `ACCEPTANCE.md: generated content differs; run contract-docs write.` Plan and prepare passed; shards were skipped because build failed. Aggregate job 131383880548 failed solely on that failed build and skipped coverage. The two failed-job archives were read once each and retained in build-job.log and verify-job.log with environment listings removed. This is precisely the cloud generated-view exception: READY eligibility is accepted for handoff, while the actual workflow conclusion remains failure and the guarded lander must regenerate and rerun its own exact-SHA gates. No workflow was dispatched or rerun, and no product repair was made. Six of ten allowed GitHub calls were used, with one status observation at least 300 seconds after discovery.

Main Verify 43271045004 and Run site 43271045029 were successful on 88c586f6fabdaed6768ddc8072af2340310a7ace at inspection. Another main Verify, 43273433822, was in progress. No candidate result is inferred from those runs. GitHub API calls and exact candidate status are retained separately.

No product blocker remains for the selected POINTS. Plan row changed in this report only: SURFACE-006 selected acceptance-4 multiple-cleanup cell completed, current MISSING judgment retained. Full clause status and counts do not move.

GAP SURFACE-006: Acceptance 1's irreversible debt resolution and setup resumption; acceptance 2's ownership reassignment and destructive grouped actions; acceptance 3's assignment-only absence of live, reminder and fallback suppression and affected monitor, incident and route facts; acceptance 4's other API shapes, browser fixtures, multiple probes and retries remain outside this bounded proof. The attributed-review-feed hold, ambiguous remainder, uip-owned console work, money and destructive-grant classification, worker-family qualification, resources and record links, AGENT-001 through AGENT-005 AI-flow hold, undeclared capabilities and unscoped lifecycle families, account, device, sibling and Platform obligations remain unchanged. Publication scanning, regenerated views, landing and candidate Run site remain guarded-lander duties.

CLAIM SURFACE-006 PARTIAL points=none tests=tests/agent-manual-multicleanup-support.mjs#proveManualMultiCleanup; tests/agent-manual-debt-support.mjs#proveManualDebt

Terminal handoff: READY branch=cloud/sd-uptime-c-f167 head=3c3aa4c459d2688d6f6a7576b7658722db238012, using only the explicitly permitted generated-view exception. No landing, publication-scan or candidate Run site result is claimed.
