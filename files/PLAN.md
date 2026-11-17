# Uptime 0.5.16 release metadata plan

Author: Run Edit Run fleet; date: 2026-11-17 UTC.

1. Initialize fleet identity, launcher, decrypted-bundle Git helper and clone-local forwarding hooks. Clone only just-every/run-uptime; branch cloud/sd-uptime-release-0-5-16 from fresh main.
2. Read launcher and seed instructions and inline release rules. Compare v0.5.15 with fresh main; check tag and Release collision, rer pin agreement, migrations and user-visible changes.
3. Change only leased release metadata: package.json, seed.json, RELEASE.json, RELEASE.md and CHANGELOG.md, plus sources.lock.json regenerated last. Retain tooling pin and identities, buyer backup and upgrade steps. Claim no contract clauses.
4. Frozen-install dependencies, run typecheck and relevant metadata/source-lock readers. Fetch current main and rebase only while unpublished. Regenerate and check the source lock last, stage only the intended release files and commit with fleet author and committer and active hooks.
5. Inspect every candidate identity, trailer and message. Push only the named product branch with the cloud guard. The Mac performs the publication scan and landing; no tag, Release, default-branch push or self-submission is authorized here.
6. Discover and poll exact-SHA Verify using REST within the ten-call budget and at least 300 seconds per run. Retain actual non-secret receipts in this packet; publish explicitly selected report files to the separate evidence ref.
7. Report branch, full SHA, CI run IDs, counts, zero clause changes, actual outcomes and lane POST. Remove the product clone only after product/evidence custody is established; retain recovery data for failed pushes.
