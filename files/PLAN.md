# Uptime 0.5.12 metadata refresh

Author: Run Edit Run fleet. Date: 2026-11-15T09:41:03Z.

1. Read launcher, builder and release rules, seed guidance, contract and generated acceptance source; establish fleet authentication, identity and commit hooks.
2. Confirm the latest published release, absent next tag, fresh main ancestry and absence of a competing release PR/branch beyond the explicitly superseded candidate.
3. Compare v0.5.11 with fresh main, including migrations, dependency pins and user-visible changes. Reuse accurate prior candidate notes and extend them for subsequent main changes.
4. Update only existing release references: package.json, seed.json, README.md, RELEASE.json and CHANGELOG.md. No package-lock.json exists. Retain the current rer pin and dependency graph.
5. Frozen install dependencies; check release metadata consistency and typecheck only. Regenerate sources.lock.json last and check it.
6. Fetch/rebase fresh main before first publication; if main changes, repeat affected metadata review and lock generation. Inspect every candidate identity/trailer and publish only the named cloud branch using the fleet guard.
7. Observe exact-SHA Verify through REST within ten GitHub calls, spaced at least 300 seconds for each run. Do not dispatch, retry or publish releases. Save actual receipts and reports outside the product clone, publish explicitly selected evidence files on the separate evidence ref, then delete the successful scratch clone.

No clause status changes, product edits, new tests, full local suite, browser run, tag, signing, deployment or release publication are part of this metadata assignment.
