# Plan: sd-uptime-f164-snapshot-fix-2

UTC started: 2026-11-12T17:18:46.344513+00:00

1. Initialize fleet identity, credential helper, push guard, commit hooks and pinned checkout toolchain. Shallow filtered clone only just-every/run-uptime; create the named cloud branch from main and fast-forward it to the supplied rebased candidate.
2. Confirm rebased head 1b1cb59f6a6eb7a5fecc390ef1fa5b7b92e9e079, compare with main 860e069a6e277a7f41bc8a34bc0934e005b01274 and original repair 4e5d09c76ece555a9924833e10a371de036c6a0c. Inspect the previous failed shard once and reproduce its tls-auth journey against emitted production output, retaining an actual failure receipt.
3. Diagnose the signed observation and snapshot mismatch. Apply the minimum production snapshot construction fix. Preserve all validator checks and test assertions; introduce no permanent test or contract edits.
4. Rebuild and rerun the same journey, preserve before/after receipts and receiver counts, and typecheck. Merge updated origin/main before the first push, retaining newer source judgments and whole generated views. Run contract generator write/check, restore generated views from origin/main, and refresh/check the source lock last.
5. Inspect every candidate commit, including side parents, for fleet/owner author and committer identities and permitted trailers. Commit with fleet identity and active hooks, push only cloud/sd-uptime-f164-snapshot-fix-2 through the cloud push guard. No main, tag, landing or record writes.
6. Discover and watch exact-SHA Verify through REST within the ten-call GitHub budget, observing the 300-second interval per run. Fix actionable failures if necessary. Save complete non-secret reports and receipts outside product Git, publish only the selected packet on evidence/sd-uptime-f164-snapshot-fix-2, and return provenance plus the sd inbox POST line.

NETWORK-001 stays PARTIAL. No contract text changes. Claims are limited to the existing tests/tls-auth.mjs#proveNetworkRedirectCycle proof.

Observed plan refinement: the production reset removed the native HTTP 400 and exposed an existing raw-receiver/calibrated-runner timestamp boundary assertion. Preserve the failed attempts and diagnostic; use a uniform fixed 100 ms processing interval around each recorded receiver event in the already leased fixture, retaining every assertion. Prove that this same fixture still exposes HTTP 400 with the reset removed and passes with it restored; then regenerate/check the source lock last.

Completed 2026-11-12T17:52:50Z: all plan steps fulfilled; final local journey and exact-SHA Verify succeeded, no clause promotions or count changes. Evidence publication and disposable-clone cleanup are the final custody steps.
