# Local invitations and sign-in instructions

Repository: just-every/run-uptime
Branch: cloud/main-uptime-local-signin-truth-1
Baseline: 36779a7228727cb38d7180b26c5b5aa656ca1056

Both stranger findings reproduced through the app on baseline main at 1440 and 390. A Responder invitation returned HTTP 202 and the UI claimed it was sent, although the installation used development mail. A fresh Lobby offered persona selection on its Sign in destination; /login instead forwarded to the private RER_OPEN gate, which offered no account picker. The reproduction receipt and six before screenshots retain the actual observations without any key or session.

Successful development invitation responses now carry non-delivery metadata on both the Base Member invitation and the product-role invitation routes. Settings > People explains that the invitation was recorded, no email was sent, and local access uses the private RER_OPEN terminal link followed by the existing /signin picker. Real provider success retains the sent acknowledgement; Base still decides sender success. Demo non-delivery is also distinguished. The Lobby now describes the terminal handoff that fresh /login already requires, with a reminder to keep the link private. Authentication, invitation token issuance/consumption, role policy, access grants, sessions and mail adapters retain their existing behavior; no route was added.

Implementation files: public/assets/access-member-controls.js, src/domain/operator-auth.server.ts, src/domain/access-members.server.ts and src/base/lobby.ts. The existing Base-copy acknowledgement and generated source lock record the intentional Lobby wording adaptation. CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are unchanged.

The existing COMMAND-JOURNEY gained proveLocalSignInTruth, using a real rer setup/dev installation and its development sender. It exercises Member and Responder invitations through People, verifies non-delivery and pending accounts, refuses a fresh browser's private read, compares the fresh Lobby with its actual sign-in destination, checks that neither response nor UI displays an invitation credential, and follows the existing key-gated /signin picker to accept the invited account. No provider fixture or fabricated session participates in that proof. Behavioral assertions run at 1440; separate screenshots show People, Lobby and /login at 1440 and 390 with no horizontal overflow. Existing hosted HTTPS auth and the complete access matrix remain regression checks for real-provider handoff and authority behavior.

Counts: two reproduced findings before, zero remaining in the scoped browser proof. Product Verify journey commands remain 47 → 47; zero new test registrations, one existing journey extended. Contract progress remains 37 Done / 58 Partial / 20 Missing out of 115. No clause Status, Gap or Evidence cell changed. No full acceptance point or DONE claim is made by this narrow copy/feedback round.

CLAIM ACCESS-001 PARTIAL points=none tests=tests/command-journey.mjs#COMMAND-JOURNEY; tests/local-signin-truth-support.mjs#proveLocalSignInTruth
DEFAULT ACCESS-001: Keep existing private installation authority and gated account selection; add no sign-in door or mail service.
GAP ACCESS-001: This round proves invitation feedback and existing local admission only, not the entire role/revocation acceptance point or real hosted recipient receipt.

The plan is in PLAN.md. Local receipts, exact product/CI provenance, checks and terminal disposition are recorded below when complete. The Mac fleet owns the complete publication scan and landing; this cloud task does not deploy or move main. No PR is required by the repository's supplied landing instructions.

Product head: fb6da95ae60e4b37f5df44ac4f6ad848a3485d5e

All touched local checks passed: build, typecheck, complete COMMAND-JOURNEY, hosted native HTTPS authentication browser journey, access matrix, generated deployment spec check, contract-docs check and source-lock check. See checks-receipt.json and actual summary logs. The scoped staged diff passed a credential-pattern check. Product push succeeded on attempt 1; push-receipt.txt retains the guard output. The first three exact-SHA CI discovery attempts returned HTTP 401. The prescribed launcher refresh, Git helper reset and bounded backoff recovered on attempt 4. Exact-SHA Verify run 43364177836 is passed: https://github.com/just-every/run-uptime/actions/runs/43364177836 . No failed workflow or green result is inferred from the API authentication errors. The final CI receipt records its outcome.

The committed candidate browser proof passed again on fb6da95ae60e4b37f5df44ac4f6ad848a3485d5e. The capture reused the actual public-door journey with fresh synthetic addresses 821/822; the repeat capture disambiguated the retained fixture names by their existing picker links. Only the task-owned dev server PID 10038 was stopped; the test browsers and temporary command-journey installation were closed by their own cleanup.

Terminal CI: Verify run 43364177836, exact head fb6da95ae60e4b37f5df44ac4f6ad848a3485d5e, passed. GitHub CLI/API calls used: 8/10. No workflow rerun or failed-job log download was needed.

Blockers: none. The earlier API 401 responses recovered within the prescribed authentication backoff.

The separate report-only evidence publication selects only the files listed by its manifest. All product work is on the named cloud branch. No main/default-branch push, force push, deployment or PR was performed. The task-owned test installation and clone are removed after evidence publication succeeds.
