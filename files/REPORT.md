# Uptime in-place import and monitor erasure verification

Repository: just-every/run-uptime
Tag and branch: main-uptime-erase-in-place-1 / cloud/main-uptime-erase-in-place-1
Product head: 93edc3d34982c579e514b4e3df7cbaa5f72770f5
Base: 7f07c2c0584c32be2d3c0a848bc23e827832825d
PR: none; this is a fleet branch landing candidate.

## Result

Import Preview and the monitor editor's Erase action now open the same in-place second-factor prompt used by Download backup. The import client retries the retained request once after verification; it preserves the file, body, content type and import-source header. The editor opts into the prompt, retains its typed-name request and retries once. Fresh-proof refusals no longer dispatch the session-lost event in these clients. Server authorization, the five-minute rule and erasure effects are unchanged.

After successful monitor erasure, the editor shows the returned receipt before returning to the catalog. It includes the entity kind, receipt ID, completion time and a separate row for every table in the stored counts. Nonzero counts appear first. The receipt reuses the console's existing dialog and theme, with compact 14px rows, wrapping labels, modal keyboard containment and initial focus at its heading. Close receipt returns to the catalog with the existing erasure notice. Destination receipt grouping is retained.

## Plan and implementation

The full original plan is in PLAN.md. The executed sequence was:

1. Configure fleet Git identity, refresh the supplied launcher, install its decrypted-bundle helper, product push guard and commit hook, then shallow-clone the declared repository and create the named branch from main.
2. Read repository contributor, contract and operating guidance and the supplied fleet rules. Set up and build through the supplied cloud toolchain, without deployment.
3. Reproduce through the emitted console with a real owner session and enrolled authenticator. With expired proof, Preview showed no in-place prompt; its recognition request returned 200, and the gated upload is the later operation that needs fresh proof. Erase returned 403/fresh_second_factor_required without a prompt. After refreshing proof, erasure returned to the catalog while the receipt existed in storage and no receipt dialog was visible. REPRODUCTION.json preserves the raw observations, including the immediately sampled notice=false; that immediate notice sample is not a claim about the eventual catalog notice.
4. Reuse the existing step-up module in public/definitions.js and opt into it from the editor JSON client for erasure. Show the API receipt through public/notification-dialogs.js. Preserve separate per-table monitor counts and completion time.
5. Extend the existing operator-security journey via proveDestinationStepUp and the new support function proveImportEraseStepUp. Add no standalone test registration. Keep behavior assertions at 1440; capture the changed screens once per width at 1440 and 390.
6. Run the full touched security journey and typecheck. Review screenshots, put affected receipt rows first, rebuild, and rerun the focused browser journey against the final product bytes.
7. Fetch main and rebase the unpublished branch (main remained at the original base), regenerate the source lock last, run its check, and commit all eight product/test/lock files. Inspect every candidate commit's author, committer and trailers, then push once with the fleet guard. Independently read back the exact remote branch head.
8. Watch exact-SHA Verify through REST, with one watcher, a five-minute minimum interval and a ten-call total budget. Publish this packet separately to the evidence ref, then remove the pushed product clone.

## Validation

CHECKS.json records the actual commands and results. SECURITY.log is the completed full security journey. FOCUSED-BROWSER.log is the focused final-byte check. TYPECHECK.log and SOURCE-LOCK-CHECK.json retain the corresponding actual outputs.

- Build passed through cloud_run npx -y @runeditrun/rer build.
- Full tests/operator-security.mjs passed: TOTP, CTAP2 passkeys, recovery consumption, sensitive-action freshness, session/policy authority and existing Settings behavior, including the extended import/erase flow.
- The final focused browser journey passed after the receipt row-order adjustment. A real expired-proof upload was refused, the prompt opened, cancellation kept the file, another attempt retried identical upload JSON after verification, recognition retained the original bytes, and Preview created no monitor. A fresh expired-proof erasure was refused without removing the monitor; verification retried exactly the typed name and completed the erasure.
- Every displayed receipt table/count equalled the erase response. Entity kind, ID and exact machine-readable completion time matched. The response equalled the stored receipt, and the later archive's productTables carried the same receipt. Closing the receipt returned to the catalog. MONITOR-ERASURE-RECEIPT.json preserves the actual synthetic response, stored row, displayed counts and archive row from this check.
- Typecheck passed for both application and runner projects. The supplied toolchain selected Node 24.19.0 for direct commands because it already exceeds the pin; rer selects the checkout runtime for its verbs. The existing engine warning did not fail the check.
- Source lock generation/check passed after staging all intended source files. git diff --cached --check passed. No CONTRACT.md, ACCEPTANCE.md or docs/CLAIMS.md changes were made.
- Eight selected screenshots show import verification, completed Preview, erase verification and the receipt at both widths. Visual review found readable prompts, retained inputs and wrapping receipt content. The behavior assertions ran at 1440, as required; the phone proof is a visual capture rather than a second assertion run.

During development, two test fixture assumptions were corrected: monitor listing uses /api/overview.monitors, and erasure receipts travel under archive.payload.productTables. An ad hoc Node --input-type=module driver stalled Miniflare before opening a browser; only its recorded PIDs were stopped, and a normal .mjs driver worked. These were local harness corrections; the final touched suite and focused check passed. No assertions were deleted, skipped or weakened.

## Counts and clause scope

The repository selects 47 product journey commands before and after this change. New registrations: 0. One existing security registration was extended. There is no test-budget.json; the default cap remains 200. This command count is not a claim that all internal Base registrations have been recounted. COUNTS.json records the comparison.

Contract status totals remain 37 done, 58 partial and 20 missing, both before and after. Status changes: none. No DONE claim is made.

CLAIM ACCESS-003 PARTIAL points=2 tests=tests/mfa-policy-support.mjs#proveMfaPolicy; tests/monitor-stepup-support.mjs#proveImportEraseStepUp
CLAIM ERASURE-001 PARTIAL points=none tests=tests/monitor-stepup-support.mjs#proveImportEraseStepUp
CLAIM IMPORT-001 PARTIAL points=none tests=tests/monitor-stepup-support.mjs#proveImportEraseStepUp

GAP ERASURE-001: This round's new console assertions prove the monitor receipt slice, not the whole of acceptance point 2's last-owner and old-archive guarantees; the existing backend erasure journey was not rerun locally.
GAP IMPORT-001: This round adds expired-proof Preview coverage, not a fresh proof of the complete apply/export/undo acceptance point.
DEFAULT ACCESS-003: Reuse the existing prompt and freshness policy; no new MFA policy or account ruling is needed.

## Publication and custody

One product commit was created with fleet author and committer identity and no co-author trailers. The clone's fleet hook preserved repository hooks. The cloud guard pushed the named product branch on its first attempt. The product commit has no CI skip marker. No evidence, reports, screenshots or setup secrets were committed to the product branch. No main/default branch, release, deployment or PR was changed.

The full publication scan runs on the fleet Mac and was not run or claimed in this cloud. Landing, generated acceptance views and any main CI/site gates remain with the fleet. Evidence publication is report transport only and does not establish product acceptance or landing.

## Exact-SHA CI

Verify run 43150794457: https://github.com/just-every/run-uptime/actions/runs/43150794457
Head: 93edc3d34982c579e514b4e3df7cbaa5f72770f5
Discovery and the five- and ten-minute status queries observed in_progress on the exact candidate SHA. CI-STATUS.json contains the latest actual response; the terminal return will identify the final observation. GITHUB-CALLS.jsonl records each actual watcher call.
