# sd-uptime-c-f173 report

BLOCKED: the selected one-probe, one-cleanup-step, one-monitor-retry API cell cannot be created while preserving the required native API retry limit. Owner creation refuses monitor retries above zero. This is a conflict between the selected cell and the brief's explicit instruction to preserve native limits, not a missing account or an external dependency.

Repository: just-every/run-uptime. Local branch: cloud/sd-uptime-c-f173. Inspected and executed head: 954353ad135f144d54f8e37013d6341a19a98e16, equal to freshly fetched origin/main. Product commits: zero. Product push: none. PR: none. CI run IDs: none; no workflow was dispatched. No READY or product acceptance is claimed.

## Plan and outcome

The complete initial plan is PLAN.md. Read the repository guidance, full SURFACE-006 clause and existing single-cleanup and multicleanup support. Traced debt identity to observationDebts in src/domain/cleanup-debt.mjs: one record for each incomplete cleanup step, probe and monitor attempt, with internal step attempts retained on that one debt. Traced monitor retry execution to runners/src/runner.mjs and internal fixture retries to runners/src/api-steps.mjs.

The precondition fails at src/domain/policy.mjs:126. Its native API and mail branch validates retries with minimum zero and maximum zero, naming the rule 'API transactions cannot automatically replay writes'. The public definition type in src/domain/definitions/types.ts:166 also restricts API retries to zero. There is no provided ruling or authorization to replace that no-replay policy; the selected brief expressly preserves it.

A tentative classifier extension and mounting change were reverted before any commit. No dead-shape implementation, synthetic database edit, manufactured saved definition or weakened assertion is retained. No permanent retry support module is mounted because its required owner creation fails. The requested two-attempt cleanup sequence, one-debt witness, selective approval matrix, blocked-live counterpart and replay proof were NOT RUN: all depend on that unavailable saved definition. Existing assertions and production files remain byte-for-byte unchanged, including f172's separately launched zero-retry scope.

The independent one-off reproduction is native-retry-probe.mjs in this report packet, outside the product tree. It starts the emitted production Worker with native migrations, signs in the real local owner through native authentication and MFA, then POSTs a valid API setup, request and cleanup sequence with one probe and retries set to one. It returns HTTP 400 with {'error':'Invalid API transactions cannot automatically replay writes'}. Complete before and after snapshots show no changed durable table, including monitors, revisions, slots, observations, debts and manual custody. Provider requests and additional mail are zero. No runner executes a target during this admission refusal. The identical definition with retries zero is successfully saved; independent revision and debt reads return one probe, one cleanup step, zero retries, zero open debts and the native debt limit of three.

The selected-cell success assertion is deliberately retained and fails visibly with '400 !== 200'. The recorded pinned Node 22.20.0 execution exits 1. See native-retry-receipt.json, run-receipt.json and native-retry-probe.log. This is a reproduced product-precondition blocker, not a failing GitHub Verify or a Verify repair round.

## Acceptance coverage and judgments

- Acceptance 1: not attempted; irreversible debt resolution and setup resumption remain owed.
- Acceptance 2: not attempted; ownership and destructive grouped transitions remain owed.
- Acceptance 3: not attempted; reminder and fallback suppression and affected monitor, incident and route facts remain owed.
- Acceptance 4: selected retry cell blocked before owner creation. Its requested positive boundary, summary, selective genuine-person approval, one undispatched slot, effect-free replay, blocked-live refusal and zero-open comparison matrix are unproved. Existing single-cleanup and multicleanup slices retain their prior scope. Other combinations, browser fixtures and the launched f172 multiprobe scope are not repeated or qualified.

SURFACE-006 is MISSING before and after. All 115 Status rows remain intact. Counts: 37 DONE, 58 PARTIAL, 20 MISSING before and after. No acceptance, Status, Gap or Evidence cell changed. The plan's only updated row is this report of the selected SURFACE-006 retry precondition; no next unblocked clause touching these files was supplied. All queue, continuation, provider, console, AI-flow, sibling, account and Platform holds remain unchanged.

CLAIM SURFACE-006 PARTIAL points=none tests=none
GAP SURFACE-006: The selected one-monitor-retry API cell is refused by native owner creation; proving it needs an explicitly reconciled API no-replay policy or a planner-selected reachable cell. All broader held outcomes remain owed. Stored judgment remains MISSING.
PROBE SURFACE-006 4-retry: owner POST /api/monitors with one API probe, one cleanup and one monitor retry -> HTTP 400, no durable changes, zero provider and mail traffic; identical zero-retry control saves and reads back with zero open debts and limit three.

## Checks and publication boundary

Setup completed using the required fleet owner identity. Typecheck and first-party structural check pass. Contract generator write and check both exit zero; its two generated views were restored whole from origin/main, leaving no diff. Source-lock check exits zero. No source edit remains, so no lock regeneration or migration-ledger run is needed. Exact commands and results are in checks-receipt.json, with their actual logs. The repository index and worktree are clean. The complete candidate identity and trailer query has no entries because origin/main..HEAD is empty.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0

No changed screen or UI is claimed; no browser proof is required for this blocked owner-API precondition. No new test registration was added. No full suite, publication scanner, Verify dispatch, deployment or Run site execution was run. Full-history publication scanning, any eventual generated-view commit, landing and Run site remain guarded-lander duties. Main equality here describes the unchanged starting tree and is not a landing receipt.

## DONE-RIDERS and pre-READY review

1. UNMET: no journey reaches the selected retry cell; the saved API definition is refused.
2. PASS for blocker reproduction only: actual owner authentication, full durable snapshots, positive zero-retry control and retained selected-cell failure. No target success is claimed.
3. UNMET for target: no passing selected-cell proof in Verify; no candidate or CI run was created.
4. PASS for reproduction: run-receipt.json binds the actual run to 954353ad135f144d54f8e37013d6341a19a98e16; source and test bytes did not change.
5. INSPECTED: SURFACE-006 already cites BASE-AGENT-006; unchanged.
6. PASS mechanically: generator write and check pass; judgments and counts unchanged. No DONE evidence is written.
7. PASS: no acceptance or status rewrite and no ruling invented.
8. UNMET for selected admission: owner creation was attempted, but the requested approval lifecycle cannot start. No authority claim beyond the reproduced refusal.
9. PASS: no provider, hosted, destructive, queued-lifecycle or legal qualification claimed.
10. PASS: no new policy default adopted. Existing native no-replay limit preserved.
11. PENDING and not claimed: no product candidate, landing, publication scan or candidate Run site receipt.

Pre-READY: selected behavior is not proven and has a real reproduced failure; no assertion was removed, skipped or narrowed; authority, erasure and replay implementation is unchanged; no screen changed; no exact-head Verify, publication scan or Run site is claimed. This task must not emit READY. The full non-secret packet is published only to evidence/sd-uptime-c-f173. No credential, environment dump, private gate material or symlink is selected.
