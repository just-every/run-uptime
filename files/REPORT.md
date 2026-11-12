# sd-uptime-c-f168 report

DEPENDENCY-002 remains PARTIAL. This round implements RL-101's released native Auth0 tenant-domain admission and bounded source-check refusal slice. It does not establish successful Auth0 status interpretation or following.

Repository: just-every/run-uptime. Branch: cloud/sd-uptime-c-f168. Final head: 85980bece32b579723fa2b3598381595857124b6. PR: none required; Verify has a push entry point. Product work and this report use separate refs. Counts are unchanged: 37 DONE, 58 PARTIAL, 20 MISSING, 115 clauses. There are 47 configured journey commands before and after; no registration was added or removed. Only DEPENDENCY-002's bounded clause prose changed. Every Status, Gap and Evidence cell is byte-identical to main.

## Plan and implementation

The complete initial plan is in PLAN.md. The plan row changed by this run is the released DEPENDENCY-002 source-check slice only; no other campaign target or held remainder is released.

The native POST /api/service-catalog/checks door now returns review_required for a valid single Auth0 tenant domain. Its disclosure identifies Auth0, the exact fixed HTTPS endpoint, the sole domain query, the tenant, one GET, request time and runner source address. Preview creates no job and performs no DNS lookup or provider request. Explicit consent must echo a valid installation-signed review bound to the current owner identity and authority revision, tenant, endpoint, catalog version and ten-minute expiry. An owner's opaque keyed binding avoids duplicating their raw identity in the review payload. A new tenant or owner requires a new review. Custom domains, arbitrary hosts, URLs, credentials, arrays, wildcards, extra fields and route query parameters are refused.

Confirmation persists that exact authorization with the job. The existing initiating-owner authority fence applies at runner claim and completion; a revoked owner cannot start pending egress. The actual signed runner independently validates the persisted fixed endpoint and tenant binding before using the existing Base public-address validation and pinned TLS transport. The existing streaming reader keeps its 1 MiB bound, identity encoding and zero redirect hops. Results repeat the authorization binding; the receiving door refuses a changed binding or a fabricated successful Auth0 status result. Persisted result reuse also runs the shared validation.

No Auth0 provider-status semantic is inferred. An empty or operational-looking RSS feed remains unqualified, needs review and cannot be followed. Non-200, malformed, oversized, redirected, disconnected and private-address sources produce bounded needs-review outcomes. Auth0 checks create no dependency monitor, incident or notification and leave populated application health, revisions, slots, observations and outbox records exact. Generic catalog flows retain their existing behavior. seed.json declares the narrow tenant-domain exception and its control-plane binding. No console controls, protected runtime helpers, protected deployment spec, Base pin or workflow changed.

## Released scope proof

All rows use tests/service-catalog-auth0-support.mjs#proveAuth0Egress, mounted once within tests/discovery-jobs.mjs#Discover a site, review and adopt monitoring, follow its dependency, and retain source custody. Only the provider DNS answers and TLS network edge are controlled; admission, native invitations, sessions, MFA, runner execution, signed completion, persistence and follow refusal are real.

| Item | Observed result | Proof lines |
| --- | --- | --- |
| Exact disclosure and no pre-review work | Review names Auth0, fixed endpoint, tenant, GET and disclosed data; no job or provider traffic | 74–79, 93–100 |
| Strict single tenant and fixed counterparty | Invalid domain, URL, credential, host, enumeration, extra field and extra query attempts refused without work | 80–93 |
| Owner authority and review binding | Anonymous and runner-only callers denied; admin denied; another owner cannot reuse review | 91–100 |
| Persistence and restart | Review survives restart; consented spec survives another restart and completed readback | 101–108, 143 |
| Actual permitted egress | Real signed runner makes the authorized GET; exact host, TLS identity and sole tenant query retained | 39–43, 109–114, 149–158 |
| No inferred success | Ambiguous, empty and operational-looking feeds stay needs review with zero follow creation | 113–119, 141–148 |
| Unusable source refusal | Non-200, malformed, oversized, redirect, connection loss and private DNS are refused conservatively | 24–35, 141–143, 160 |
| No arbitrary DNS or secret disclosure | Only official source resolved; header set, no body, cookies, authority or referrer; no tenant or redirect resolution | 36–43, 149–158 |
| Signed result custody and replay | Changed tenant or endpoint and invented operational result rejected with running job unchanged; completed result replay denied | 120–134 |
| Revocation | Queued second-owner job stops after native owner revocation with no provider request; stale owner session denied | 135–139 |
| Persisted reuse and changed input | Same check remains refused after restart; changed input requires another review before its one authorized request | 144–148, 151 |
| Application separation | A genuinely healthy populated application retains exact definition, state, revisions, scheduled evidence and notification facts | 67–73, 118, 161 |

Line ranges are report guidance; the committed helper is authoritative. The standalone focused probe passed on exact final commit 85980bece32b579723fa2b3598381595857124b6 with the final helper. The complete discovery regression reached the unchanged real public-DNS helper and failed with queryCname ENOTIMP run-uptime.com. The same helper failed with the same error on a freshly built detached main checkout at 88c586f6fabdaed6768ddc8072af2340310a7ace. No resolver replacement, assertion weakening or application repair was made. The focused Auth0 probe passed independently; the complete discovery command is not reported green. Exact-head CI state is recorded in RECEIPT.json and the selected logs.

## Acceptance and retained gaps

No whole acceptance sentence is newly claimed closed by this Auth0 requirement slice. Existing discovery assertions for acceptances 1–5 and 7 remain, and the existing source-import assertions for 6 and 8 are unchanged. The new slice supports the source refusal and application separation duties without claiming that a nonexistent Auth0 follow turned Unknown. Existing route, contact, fallback, quiet-hours, dependency notice, application incident, archive, erasure and import proof was retained.

GAP DEPENDENCY-002: Successful Auth0 status interpretation and following, live authorized tenant qualification and complete named-provider acceptance remain unproved. Fastly free-text status stays unqualified and Unknown. Uip tenant-entry, disclosure and confirmation controls, broader console requalification, catalog and account proof, geographic and hosted qualification and agent surfaces remain held. All other plan holds remain unchanged.

DEFAULT DEPENDENCY-002: RL-101 already authorizes only explicitly reviewed disclosure of one named tenant domain to Auth0's fixed official status endpoint. Admission uses the conservative owner-only, no-secret, no-arbitrary-host, no-enumeration floor; no broader policy or provider-status interpretation is adopted.

## DONE-RIDERS and pre-handoff review

This is a PARTIAL claim. No DONE count is requested.

| Rider | Result | Evidence or boundary |
| --- | --- | --- |
| 1 | PARTIAL | Released source-check outcomes execute through public doors; full named-provider and held UI outcomes remain owed |
| 2 | PASS for released slice | Allowed reviewed egress completes; unsafe inputs and unsafe signed answers are refused with retained state |
| 3 | EXPECTED VIEW EXCEPTION | Push Verify 43276758886 on the exact head failed only generated ACCEPTANCE.md freshness; dependent runtime shards skipped. No CI runtime pass is claimed |
| 4 | PASS for released slice | Final focused helper run; production code and notice bytes equal the saved regression tree; its unrelated DNS failure also reproduced on main |
| 5 | INSPECTED | DEPENDENCY-002 already cites BASE-DATA-004 and names application separation |
| 6 | MECHANICAL PASS | Local generator write and check passed, generated views restored from main; judgments unchanged |
| 7 | PASS | All eight acceptance sentences and all Status rows unchanged; RL-101 governs the prose |
| 8 | PASS for released slice | Native admin, other owner, stale owner and queued revocation cases; forged results refused |
| 9 | PARTIAL | No live Auth0 tenant, successful follow or provider readiness claimed |
| 10 | AUTHORIZED | Explicit 28 October RL-101; conservative owner-only admission; no new broader authority |
| 11 | LANDER_PENDING | Main equality, publication scan and candidate Run site belong to the guarded lander |

No existing assertion was removed, narrowed, skipped or made conditional. No production UI control changed; the informational catalog notice was inspected at 1440 and 390, with its existing layout. No newly introduced email-shaped fixture or provider key is present. The touched discovery file retains a pre-existing unsafe URL literal used by an existing credential-refusal assertion; that assertion was not edited. No migration changed, so ledger checking is not applicable.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0, followed by restoring ACCEPTANCE.md and docs/CLAIMS.md from origin/main; ledger=none exit=0.

The source lock was regenerated last after final edits and main reconciliation. Publication scan: NOT RUN in cloud; complete, historyScanned and findings are unestablished here. Candidate main equality and Run site are pending guarded landing. The full-history clone was used without rewriting published history. The final product ref was verified remotely as 85980bece32b579723fa2b3598381595857124b6. Main baseline at inspection was 88c586f6fabdaed6768ddc8072af2340310a7ace: successful Verify 43271045004 and Run site 43271045029 were observed; another Verify on that same SHA was running. No main push or PR was made.

## Execution notes

An initial inline module invocation stalled the Miniflare synchronous binding bridge before fixture initialization. A normal script-file invocation under the pinned Node 22.20.0 ran successfully; no application workaround was added. Local proof first exposed the owner's permission error being mapped to HTTP 400; the implementation now uses the standard AccessError and returns 403. The native second-owner invitation fixture was corrected to obtain a genuine email-link owner session, preserving Base step-up rules. No guard was weakened.

The actual non-secret packet contains this report, the plan, receipt, selected command outputs, exact CI metadata and two catalog screenshots. Product commits contain no fleet report files. Evidence publication establishes transport custody only; it is not product acceptance or landing.

PROBE DEPENDENCY-002 RL-101-review: owner source-check POST with one tenant -> exact disclosure, no job, no DNS and no provider request.
PROBE DEPENDENCY-002 RL-101-egress: explicitly confirmed review -> one pinned GET to status.auth0.com with exactly the reviewed domain query, no credentials and no redirect; restart retained the binding.
PROBE DEPENDENCY-002 RL-101-refusal: changed tenant, forged signed success, malformed, oversized, redirected, unavailable or ambiguous source -> refusal or needs review, no follow and unchanged application evidence.
PROBE DEPENDENCY-002 RL-101-authority: admin, other-owner reuse and revoked pending owner -> denial and no unauthorized egress.

Local regression limitation: the VM resolver does not implement the unchanged public-DNS helper's CNAME query. Both candidate and main failed with queryCname ENOTIMP run-uptime.com; this is an observed environment limitation, not a new product defect. The lane should use the exact-candidate Verify and guarded publication scan independently.

## Final exact-head CI disposition

Push Verify 43276758886 completed with failure on exact candidate 85980bece32b579723fa2b3598381595857124b6. Build job 131387218263 failed only node src/base/contract-docs.mjs check: "ACCEPTANCE.md: generated content differs; run contract-docs write." Aggregate job 131387571378 failed because its build and runtime coverage dependencies were unavailable. Plan and prepare passed; runtime shards were skipped. Both failed-job archives were read once through gh run view; no CI rerun or dispatch occurred. This is the brief's explicit generated-view freshness exception, and qualifies for the READY handoff. It is not a green runtime Verify claim. The guarded lander must regenerate the view and rerun exact-head gates before landing. Six GitHub CLI budget calls were used.

VERIFY_REPRODUCED {"command": "node src/base/contract-docs.mjs check", "exit": 1, "failure": "ACCEPTANCE.md: generated content differs; run contract-docs write.", "head": "85980bece32b579723fa2b3598381595857124b6", "job": 131387218263, "test": "generated ACCEPTANCE.md freshness"}
