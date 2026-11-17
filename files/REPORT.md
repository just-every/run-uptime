# Uptime destination verification, recovery codes and member removal

Author: Run Edit Run fleet (sd), 2026-11-17.
Tag: sd-uptime-design-alerts-1. Repository: just-every/run-uptime.
Branch: cloud/sd-uptime-design-alerts-1. Product SHA: a7ff38e487d81aad5182afaa81ee9e2a4aa6b6ce. Tree: e75ef47cd5590ef502c903d04cbdcae6528cc94d. CI receipts are recorded in CHECKS.json and the final return.

## Plan and scope

The complete plan is in PLAN.md. Read fresh main and the seed guidance; reproduce the three owner journeys on the built baseline; implement the expected explanations/save controls and consequence confirmation; extend existing public-door journeys; typecheck, build, refresh main, regenerate the source lock last, check identity/hooks, push only the named branch and inspect exact-SHA Verify. Publish reports independently on the evidence ref. No contract judgments, release metadata, rer pin, tags or unrelated product areas change.

## Results

- D8: The destination step names saving an alert destination and explains that a second factor helps protect where alerts go. It describes available enrollment or verification choices from the returned factor state. The original request continues once, without retyping, after real verification and recovery-code acknowledgment. Enrollment guidance disappears when the codes appear.
- D9: Both destination enrollment and People settings explain the codes' purpose after sign-in, single-use behavior and one-time display. The count comes from the issued array. Copy all preserves all characters; Download produces a plain-text file with one issued code per line. A clipboard failure leaves a readable fallback and Download available. The existing I saved this gate remains; codes and authenticator material are removed from the screen after acknowledgment. Code generation and formats are unchanged.
- D13: Remove member opens the existing consequence-confirmation dialog with the member's current display name and sign-in consequence. Cancel makes no removal request. A stale second-factor prompt says which person is being removed. Base's last_owner refusal displays “You are the only owner. Add another owner first.” The server's last-owner fence is unchanged, and the refusal preserves access.

The short documentation paragraph is in docs/mfa.md. New helpers share the recovery screen and its browser-edge proof; they add no test registrations. Existing literal recovery-heading assertions were replaced with the displayed code region, and server-guidance copy pins with visible guidance checks; behavioral enrollment, QR, retry, denial and authority assertions remain.

## Truth checks

| Added behavioral statement | Verification |
| --- | --- |
| Second factor protects destination changes | requestNeedsStepUp requires fresh proof on destination creation; real create returns 403 until enrollment/verification. |
| Continues without retyping | app.js retains and retries the original request; the destination journey checks retained values after Cancel and exactly one matching saved destination. |
| Enrollment choices exist | Native TOTP enrollment/confirmation and Chromium CTAP2 WebAuthn run through the application; unavailable passkeys are not offered in the new enrollment sentence. |
| Recovery codes work after sign-in without another factor | Native recovery verification records session proof; the existing MFA lifecycle exercises a fresh email session, and the extended journey uses a saved code, then rejects its replay. |
| Count, contents and one-time display | Array length comes from the response; displayed, copied and downloaded bytes are compared to the real issued values. Only hashes are stored, the status endpoint returns no codes, and acknowledgment removes the displayed codes. |
| Removed person can no longer sign in | Member removal uses Base's inactive-status door; the public self endpoint returns 401 for the removed member's existing session. |
| Only owner must add another owner first | Base's last_owner status fence returns 409, the UI maps that refusal, and the same owner remains admitted. |

No unverified behavior sentence was retained. The codes' existing character alphabet was preserved; Copy all and Download avoid retyping it. No owner/customer-facing environment or storage names were added.

## Proof and counts

The built baseline was main 395b92f1c37ab3ff166a18112643b18a31b5339e. Its screenshots and actual observations are in before/. The baseline displayed generic verification guidance, offered only I saved this for the ten issued recovery codes, removed members without confirmation, and rendered the last-owner refusal as a generic failure.

Final changed-screen screenshots are in after/, once per state at 1440 and 390. Assertions run at 1440. BROWSER.json records capture hashes and masking. CHECKS.json records actual command outcomes; the selected non-secret console output is in TEST-OUTPUT.log. The browser tests use fresh synthetic identities and real application sessions; only mail/clipboard/WebAuthn platform edges are controlled by the existing test fixtures. Issued codes, authenticator keys, session values and downloaded code files are excluded from this packet.

Contract counts before/after: 37 done / 58 partial / 20 missing, total 115; no status changes. Configured public journey entrypoints before/after: 47 / 47; no added registrations. D8, D9 and D13 move from the reproduced baseline to the implemented and checked behavior above. No clause is promoted or claimed.

## Validation boundaries and custody

Only touched journeys and typecheck ran locally, plus builds and the source-lock check; branch Verify supplies the full CI gate. The cloud brief reserves the complete publication scan and landing to the fleet's Mac. No main/default branch was pushed, no PR or release was created, and no self-submission was made. Product and evidence custody are separate.

A preliminary baseline harness used a bootstrap session lacking Base's fresh email proof; the final baseline replay used native email sign-in. A focused eval-mode test wrapper stalled before migrations; the exported journey was rerun from a normal module file, and only the owned processes and temporary data were removed. Neither harness issue required product changes.

Related out-of-scope note: People’s invite menu does not offer Owner. The requested last-owner sentence is implemented; exposing the existing owner-addition authority in that menu is a separate journey change.

No contract clause claimed; these are owner-journey design fixes (DIRECT 87).

## Exact-SHA CI failure

Verify run 44120731684 completed with failure on a7ff38e487d81aad5182afaa81ee9e2a4aa6b6ce. Build, contract-docs, prepare and seven of eight shards succeeded. Job 134171766487, shards (push-7), failed in tests/operator-browser.mjs:282:18 while calling provePlainMonitorEvidence, before the alert and People flows. This is not the generated-view exception, so this candidate is not READY. CI-jobs.json and CI-FAILED-JOB.log contain the actual run and failed-job evidence.

The required command `gh run view 44120731684 --repo just-every/run-uptime --job 134171766487 --log-failed` succeeded once. The browser suite stores its nested diagnostic in a separate artifact. An initial artifact selection had an incorrect suffix and matched nothing. Using the exact workflow artifact name then reached blob storage but returned HTTP 403 Forbidden. No blocked blob download was retried, and signed URL queries are excluded from the packet. CI-ARTIFACT-REFUSAL.log contains the sanitized transport diagnostic.

The unchanged candidate’s local browser-suite replay passed the operator/monitor journey, including the point CI reported, and proceeded to recovery checks. This does not replace the red exact-SHA CI result. No unrelated monitor code or assertions were changed to obtain another run, and no workflow rerun was requested.

The complete local browser replay subsequently passed both tests/operator-browser.mjs and tests/recovery-browser.mjs, with owned runtimes stopped and temporary grant/state removed (LOCAL-BROWSER-RESULTS.json). All requested edits are committed and pushed. The remaining blocker is successful exact-SHA Verify; no further product change was justified by the non-reproducing monitor failure. The fleet should inspect the failed job’s private operator/suite.log and resolve that gate before landing.
