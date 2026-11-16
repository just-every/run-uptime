# Uptime 0.5.15 release metadata plan

1. Read fleet and seed instructions; install fleet identity, credential helper, commit hooks and toolchain.
2. Check immutable tag and GitHub Release availability for v0.5.15. Compare the actual v0.5.13 tree with fresh main, including migrations and dependency pins.
3. Fold the unreceived 0.5.14 notes into 0.5.15. Update only permitted release metadata and existing release-version references; retain previousVersion 0.5.13, backup steps and cautions. Leave rer at exactly 0.2.119 and preserve adoption files.
4. Fetch current main before the first commit, reconcile any drift, regenerate sources.lock.json last and check it. Run the typecheck and proportional release metadata checks; do not run the full local suite.
5. Inspect every outgoing author, committer, trailer and diff. Push only cloud/sd-uptime-release-0-5-15 through the cloud push guard, preserving the first real commit. Wait for exact-SHA Verify through REST within the ten-call API budget and 300-second polling interval.
6. Save complete non-secret results and actual receipts in this packet; publish them separately to evidence/sd-uptime-release-0-5-15. Report product custody and lane POST line; create no tag, Release or self-submission. Delete the clone only after successful product and evidence publication.

Signed Run Edit Run fleet, 2026-11-16T15:54:47Z
