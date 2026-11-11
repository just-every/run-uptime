# Uptime README walkthrough continuation

Repository: just-every/run-uptime
Branch: cloud/main-uptime-readme-walkthrough-1-c1
Candidate: 06dccf2ce2a48aedabd482aee468fa22e6f4e8b1
Merged main: 1b74086c760398d8ec3a7fffa13985210c0191fc
Original walkthrough: b1793418a2c866dea6ba969a738c181fdfb2b5de
PR: none; this repository uses the fleet landing lane.

## Result

The original walkthrough is preserved on Uptime 0.5.5 and current main. Relative to merged main the product diff is still exactly six files: README.md, docs/deploy.md, package.json, scripts/local/practice-target.mjs, sources.lock.json, and the extension of tests/command-journey.mjs. No new feature or additional UI change was introduced by this continuation.

The command prints the active practice target through rer's managed runtime, so the README path does not require node on PATH. Its curl controls address that same target. The form instructions use the current labels, and the docs point to package.json for the CLI version.

## Triage

The first requested read of Verify 43014289681 found attempt 2 still in progress. A subsequent REST read after the 300-second interval found completed/failure on the exact original SHA. The push-5 failed-job archive (130515856198) was read once; its failure is the security journey's credential summary click after Worker restart, security-controls-browser-support.mjs:106. The push-7 failed-log archive (130515856082) was read once and returned no failed steps. This was not a README or renamed-form-label assertion.

A file-based local reproduction on Node 22.20.0 returned the same timeout. Browser network diagnostics found HTTP 429 for the cold browser's public modules. The persisted per-client asset bucket was exhausted by this rapid test's earlier loads, so the key panel could not initialize. No production limiter defect or deliberate label mismatch was found.

A Retry-After reload adjustment passed the existing full operator-security journey locally. A subsequent required fetch found main 1b74086 already carried the smaller asset-window fix. The merge keeps main's newer security test whole: wait for the next real minute before opening the replacement cold browser. The local adjustment is superseded in the final tree. Assertions, public rate limits, persistent counters, native session/key/job identity and the test cap are all retained.

## Merge and scope

The named branch started at the exact requested walkthrough SHA and merged main, never rebasing or force-pushing. The release merge conflicted only in sources.lock.json; it was generated from the merged sources. When main advanced again, tests/security-controls-browser-support.mjs was taken whole from origin/main and the source lock regenerated last. CONTRACT.md and both generated views exactly match merged main. No Status, Gap or Evidence cell changed.

An intermediate merge head 0c6fe8ad20d5accb03ff815abe2028b72f3cc7b8 was pushed successfully for preservation. The final candidate contains the subsequent test adjustment and merge history without rewriting any published commit. Product pushes use only the named cloud branch and the required guard.

## Validation

- Frozen dependency installation and owner setup: exit 0. Setup logs remain private because they concern installation custody.
- Final emitted build through cloud_run: exit 0.
- Final Node 22.20.0 typecheck: exit 0.
- Final operator-security journey: exit 0. Native owner/member TOTP, recovery, passkey, key scope/revocation, stopped definition job after restart, authority refusal, factor removal and existing 1440 axe/reflow assertions all pass.
- Browser proof: the same post-restart People screen captured at 1440 and 390; synthetic accounts and revoked-key metadata only. The test assertions run at 1440. No real browser profile or session was copied.
- Contract generator check, source-lock check, managed spec check and git diff whitespace check: exit 0.
- Final command-journey: exit 0 on the final merged candidate. Exact-SHA CI is recorded in the final receipt when complete.

The earlier command journey passed before main advanced, including practice-target healthy/failing/healthy controls, native setup, monitor creation/hydration, teardown, rerun preservation, conflict refusal, reset, archive import/export and retained receipts. It is repeated on the final merged candidate because main changed relevant UI inputs.

## Counts and clause status

Clause counts before and after: 37 done, 58 partial, 20 missing, 115 total. Core: 37/47/11 across 95; agent surface and later remain as recorded on main. Clause status changes: none. No DONE claim or CLAIM line is made by this documentation continuation.

Selected CI journey scripts before/after: 47/47. Added registrations: 0. No test-budget raise, deleted assertion, skipped assertion or weakened assertion. The main security test and all its assertions are preserved exactly.

## Plan and custody

PLAN.md records the complete plan; investigation-notes.md records diagnostics and the superseded local experiment. Actual public run reads, selected failed-job diagnostics, check logs, screenshot files, identity inspections and product/evidence receipts form the explicitly selected packet. Evidence is published only under evidence/main-uptime-readme-walkthrough-1-c1. Product checkout/index/ref are unchanged by evidence publication.

The cloud cannot run the Mac publication scan. The fleet owns that scan and landing; nothing here claims publication acceptance, landing, provider acceptance or production operation. No push to main, PR creation or cross-repository write was performed. Final CI status and any remaining blockers are recorded in RECEIPT.json and the terminal return.
