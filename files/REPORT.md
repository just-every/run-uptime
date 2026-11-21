# Uptime Run site HTTP-500 retry continuation

Status: READY. Verify run 44881087377: completed/success on exact head 73a3c77de5857576281d558c111301f9988a3aa4.
The named product branch was pushed successfully on the first attempt. The existing saved implementation is preserved unchanged and the exact-tree publication scan passes. No clause status changed. No landing or production deployment is claimed.

Repository: just-every/run-uptime.
Branch: cloud/gr-mt-uptime-ci-6-c1.
Product head: 73a3c77de5857576281d558c111301f9988a3aa4.
Product tree: 60de456ac781b8d66c03ea1d9441ef4d62e9b10d.
Main base: 6e7149d1257fae22d2882ca7fa0b4b856acd22f2.
PR: none; this brief returns the named branch to the fleet lander.
Blockers: none.

## Full plan and disposition

1. Refreshed the authorized launcher; installed the decrypted-bundle Git helper, credential cleanup and cloud push guard; configured the fleet identity and repository-preserving commit hooks.
2. Cloned only the declared product repository, fetched the stipulated saved branch, and created the continuation branch at its saved head. Compared the complete diff against main. Main remained at the original base, so no merge or new product commit was necessary. Both saved commits were retained without a rebase or rewrite.
3. Ran the existing deployment test and typecheck once. Checked source-lock freshness and the Verify journey inventory. Materialized raw committed bytes and ran the pinned Base publication scanner against the exact candidate and the public remote main base.
4. Audited every candidate commit identity and complete message, including all parents in origin/main..HEAD, then pushed only the named product branch through the fleet push guard. Observed the continuation's own exact-SHA Verify run through one REST watcher, with at least 300 seconds between requests for that run.
5. Kept reports and receipts outside the product checkout and selected packet files explicitly for the separate evidence ref. Clone deletion follows successful evidence publication and is reported in the terminal return. Evidence transport does not establish landing or replace independent gates.

## Product implementation

The diff contains exactly the six expected files: scripts/deployment/run-site-http.mjs, .github/workflows/run-site.yml, tests/run-site-deploy.mjs, scripts/verification-plan.mjs, package.json and sources.lock.json: 94 insertions and 4 deletions. No contract, generated view or unrelated prose changed. This continuation authored zero new product commits.

The Run site workflow preloads the retry only for the site deploy command. A GET to the Cloudflare site deployment lookup retries once after HTTP 500, retaining the caller deadline. A persistent error stops after two reads and zero provider writes. An ambiguous Worker upload receives one attempt.

## Verification and receipts

- Existing deployment tests: 3 passed, 0 failed. Transient 500 recovery, persistent 500 refusal and single-attempt upload refusal passed. See TOUCHED-TEST.txt.
- Typecheck: application and runner TypeScript projects passed. See TYPECHECK.txt.
- Source lock: check returned ok=true; the exact output and source-lock digests are in SOURCE-LOCK-CHECK.json.
- Verify inventory: 48 journeys, 48 unique commands, deployment test selected exactly once. See JOURNEY-INVENTORY.json.
- Publication: PASS, complete, zero new findings; 1,126 commits, 1,107 trees and 9,922 blobs inspected. The 29 pre-existing findings are classified against the advertised public main base. Environment matching and full-history inspection completed. Scanner version 0.2.125; implementation digest dace44a03ce03a9402975c82e7f6c62a84c21671674722cfa6841d2b25fd600a. See PUBLICATION-SCAN.json.
- Identity audit: both candidate commits use the fleet author and committer identities, with no trailers or OpenAI/Codex coauthors. The audit was repeated immediately before the guarded product push. See IDENTITY-RECEIPT.json and PUSH-RECEIPT.json.
- CI: Verify run 44881087377: completed/success on exact head 73a3c77de5857576281d558c111301f9988a3aa4. See CI-RECEIPT.json. This result uses the new continuation run, not the older run cited in the brief.

The supplied toolchain retained the installed Node 24.19.0 and pnpm 10.12.4. pnpm printed an engine warning for the repository's Node 22.20.0 pin. Local checks passed; the Verify workflow runs with Node 22.20.0.

## Before and after

| Measure | Main | Candidate |
| --- | ---: | ---: |
| Verify journey commands | 47 | 48 |
| Core done / partial / missing | 37 / 47 / 11 | 37 / 47 / 11 |
| Agent surface done / partial / missing | 0 / 11 / 8 | 0 / 11 / 8 |
| Later done / partial / missing | 0 / 0 / 1 | 0 / 0 / 1 |
| All done / partial / missing | 37 / 58 / 20 | 37 / 58 / 20 |
| Total clauses | 115 | 115 |

Clause status changes: none. CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are byte-identical to main.

## Scan recovery and limits

The first two scan attempts were INCOMPLETE because the initial partial clone lacked historical blobs. Full main/tag history and the remaining five intermediate candidate blobs were fetched from the declared origin; the object inventory then showed zero missing objects. The initial reports are retained.

A subsequent complete scan's sole finding, destination.invalid, came from this task passing a bare repository slug where the scanner requires its full GitHub URL. The invocation was corrected, the official destination preflight passed, and the complete scan then passed. PUBLICATION-SCAN-ARGUMENT-ERROR.json retains that invocation-error result. No product metadata was edited to address it.

No UI changed, so no browser proof applies. No provider writes, PR, landing, main push or production deployment were performed. The fleet's independent publication and landing gates remain separate from this builder's proof and evidence return.
