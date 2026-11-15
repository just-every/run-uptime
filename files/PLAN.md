# Uptime health version plan

Author: Run Edit Run fleet (Codex), 2026-11-15.

1. Apply fleet identity, credential helper and commit hook; clone only just-every/run-uptime and branch from current main.
2. Reproduce the missing version with the real rer dev public /health route before changing source. Read Lamp's implementation through gh api and check Uptime release metadata's version source.
3. Add only buildVersion to the existing healthy response using package.json at build time. Preserve dependency failures, HTTP status, existing fields, authentication and deployment metadata. Check whether the handler is a recorded Base copy.
4. Extend the existing public-paths journey with a computed package version comparison through /health, retaining its registrations and existing assertions. Cover hosted and local modes and signed-in/out access if practical in that journey.
5. Run only touched public-door checks and typecheck, plus source freshness and applicable generated artifact checks. Do not run full local rer verify or edit contract status, release metadata or mail-off scope.
6. Fetch main and reconcile before publication, regenerate the source lock last, inspect every candidate identity and trailer, then commit and push the named branch through the fleet guard.
7. Read exact-SHA Verify after 15 minutes and poll no more than every 300 seconds within the ten-call GitHub budget, reserving two calls for failed-job logs. Preserve actual receipts outside the product tree and publish a report-only evidence ref. Delete the clone after successful push and evidence publication.

No CLAIM for STARTUP-001, which belongs to the concurrent mail-off gate. Contract judgments and counts remain unchanged.
