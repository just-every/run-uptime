# Uptime readable maintenance and erasure receipts

Tag: main-uptime-readable-receipts-1
Repository: just-every/run-uptime
Product branch: cloud/main-uptime-readable-receipts-1

## Plan

1. Refresh the fleet launcher, install decrypted-bundle Git authentication, commit cleanup hooks and the checkout's pinned toolchain.
2. Read contributor guidance and the maintenance, erasure and interface clauses. Reproduce both reported screens through the app's public local-practice door on current main.
3. Preserve maintenance and erasure behavior and stored receipt format. Render monitor display names in selection and preview. Give completed erasure a named human summary, a copyable receipt reference, and a collapsed technical inventory or downloadable receipt.
4. Extend existing public-door coverage within the test cap. Check behavior at 1440; capture the changed screens at 1440 and 390. Run touched tests and typecheck, refresh the source lock last.
5. Integrate fresh main without rewriting published history, inspect every candidate identity and trailer, and push only the named branch with the cloud guard. Observe exact-SHA Verify through the REST API within the ten-call budget.
6. Preserve non-secret reports and actual receipts outside the product tree and publish the explicit packet on the separate evidence ref. Report clause claims without changing judgments or making DONE claims.

## Reproduction on current main

Main at reproduction: `36779a7228727cb38d7180b26c5b5aa656ca1056`.
A disposable native local owner session was issued through the documented local CLI door, verified with a real enrolled second factor, and used to complete setup, create **Local practice** in the console, pause it, open Planned maintenance, preview a window and erase the monitor after typing its name. No production or owner browser profile was used. The bundled practice target ran locally.

The selection and preview each printed the actual monitor UUID. Erasure completion did not name Local practice, printed the raw receipt UUID, and showed 42 per-table inventory rows. The baseline browser had no page errors. Actual baseline observations are in `BEFORE.json`; the original completed receipt is `before-erasure-receipt.json`. The six `before-*.png` files show selection, preview and completion at 1440 and 390.

## Implementation and measured results

- Maintenance selection and preview render escaped display names. The same monitor IDs, immutable revision checks, preview digest and apply payload continue to select and protect the operation.
- Monitor erasure receives the already-known display name from its Edit form and renders it with textContent. Its completion explains saved settings, checks, incidents and related alert/heartbeat data in human terms. The anonymous audit and receipt are explicitly retained.
- Receipt references use `ER-` followed by all 32 hexadecimal digits of the existing receipt ID, uppercased and grouped in eights. This is a lossless display-only reference, not a new stored identifier. Copy reference copies exactly the displayed reference. Failed clipboard access gives a manual selection/copy fallback.
- Receipt details start closed and retain the original UUID, completion time, every exact table count (including zero counts), and the limits on downloaded backups, sent messages and in-progress requests. Download receipt contains the original server receipt object unchanged. No stored receipt format or server erasure path changed.
- The touched maintenance UTC line is at least 13px. The existing form fields, responsive layouts, text buttons and native disclosure are retained; no icon-only controls or new top-level feature entries were added.
- In the public-door proof, selection and preview name Local practice without a raw monitor ID. Erasure completion names it with no raw receipt ID and zero visible inventory rows. All 42 rows remain in details, and every count equals the actual response. Copy equals the displayed reference and the downloaded JSON deep-equals the original server response. The exact previewed window is saved, and the paused monitor stays paused. The erased monitor disappears from the owner overview.
- The changed planner and completion pass scoped axe checks and desktop reflow assertions at 1440. Six `after-*.png` screenshots show the three changed states at 1440 and 390. The receipt and assertion record are `after-erasure-receipt.json` and `readable-receipts.json`.

## Test scope and counts

The existing desktop owner lifecycle in `tests/operator-browser.mjs` now invokes `proveReadableMaintenanceAndErasure` after its existing backup journey. The helper uses the actual console, public maintenance endpoints, typed erasure confirmation, native clipboard and downloaded receipt. It asserts at one width (1440); the additional phone captures are browser proof. The existing 390 smoke remains in place. No new test registration was added; configured public-door journey commands remain 47 before and after.

The existing in-place verification journey in `tests/monitor-stepup-support.mjs`, mounted by `tests/operator-security.mjs`, is adapted to open Receipt details before its original receipt assertions. It retains the exact identity, completion time, every count, durable stored receipt and later archive comparisons. It also checks the named completion and initially hidden UUID/inventory. None of its authentication, retry, erasure or storage assertions are removed.

## Validation and custody

- The targeted owner journey passed through the live rer dev public door with no browser errors. Build and typecheck passed, and both passed again on the final candidate. A build attempted while dev still held its local operation lock was correctly refused; stopping only the recorded owned server PID resolved it before the successful build.
- The enclosing operator browser suite passed 13 local accessibility/reflow checks, including the new lifecycle extension. Its recovery companion passed too. The adapted `tests/operator-security.mjs` journey passed on the final SHA, including the in-place verification and exact stored/archive receipt assertions. A fresh `proveReadableMaintenanceAndErasure` run on the final SHA also passed with zero browser errors and no outside traffic; the six after screenshots and downloaded receipt were refreshed from that run.
- The source lock was regenerated by `node scripts/edition-authoring/cli.mjs lock`; its check passed. Spec generation after build produced no tracked-file changes. Contract document check passed with zero errors or warnings.
- The first product commit was rebased against freshly fetched main before publication. It pushed on the first guard attempt. Future published changes merge fresh main and preserve published ancestry. Every candidate author/committer and complete commit message is inspected before push; no AI co-author trailer is present. Product refs are limited to the named cloud branch.
- The cloud adaptation explicitly assigns the complete publication scan and landing to the fleet Mac. No main or default-branch push, landing, provider deployment or release is claimed.

## Clause judgments and bounded claims

No CONTRACT.md, ACCEPTANCE.md or docs/CLAIMS.md judgment, gap, evidence or summary count was changed. Before/after: 37 done, 58 partial, 20 missing, 115 total. ERASURE-001 stays done; MAINT-001 stays done; INTERFACE-001 stays partial. These UI assertions are bounded supporting evidence and do not complete a previously unproved numbered acceptance journey, so no DONE claim is made.

CLAIM ERASURE-001 PARTIAL points=none tests=tests/operator-browser.mjs#proveReadableMaintenanceAndErasure; tests/operator-security.mjs#proveImportEraseStepUp
CLAIM MAINT-001 PARTIAL points=none tests=tests/operator-browser.mjs#proveReadableMaintenanceAndErasure
CLAIM INTERFACE-001 PARTIAL points=none tests=tests/operator-browser.mjs#proveReadableMaintenanceAndErasure
DEFAULT ERASURE-001: Keep the anonymous stored receipt format unchanged; derive the readable reference in the completion UI and pass the known monitor name only to that UI.
GAP INTERFACE-001: This round does not qualify the entire console or claim a human screen-reader pass.

## Terminal provenance

Final product branch: `cloud/main-uptime-readable-receipts-1`.
Final product SHA: `18bdd8c3b9ccc1e0e6a4c057208d06310c7ac0c8`.
First product commit: `777770f7187cffd0a453f5c1068b23c363840732` (Verify `43363865657`, queued when observed; superseded by the final candidate).
Second product commit: `18bdd8c3b9ccc1e0e6a4c057208d06310c7ac0c8`, retaining published ancestry and adapting the existing step-up receipt checks to their disclosure.
Final exact-SHA Verify: `43364308126`, currently in progress.
Both product pushes succeeded on their first guard attempt. The product tree is clean. No PR was required or created; this seed has a pre-main push Verify and the fleet owns landing.
Evidence publication is separate from product readiness and landing. The packet is selected as regular files only, screened for injected values, and published only on `refs/heads/evidence/main-uptime-readable-receipts-1`. The full publication scan is intentionally deferred to the fleet Mac lander. CI status and evidence transport are finalized below.
