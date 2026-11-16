# Seroval maintenance plan

Author: Run Edit Run fleet, 2026-11-15.

1. Configure fleet identity, credential helper and commit hooks; clone only just-every/run-uptime with full history onto cloud/gr-mt-uptime-dep-6.
2. Read repository guidance and inspect all lockfiles, parent constraints and existing SSR/authentication checks. Confirm the reported dependency is present.
3. Use pnpm 10.12.4 to resolve only seroval 1.6.11. A temporary override may guide resolution; remove it and regenerate the lockfile before committing. Preserve all unrelated versions and plugin versions.
4. Verify frozen installation under Node 22.20.0, reachable dependency graph, safe focused package security probes and a legitimate structured-data round trip. Run repository setup, production build, typecheck, and the existing hosted authentication browser journey at its existing 1440 width with system Chromium.
5. Regenerate source lock last and run its freshness check. Preserve contract judgments and generated acceptance views; no clause changes are intended.
6. Commit with fleet identity and active forwarding hooks. Independently review the patch for surviving affected resolutions and compatibility regressions. Fetch main and rebase only if unpublished, regenerate lock if integration requires it.
7. Run Base publication scanner from the pinned RER package against the exact committed tree, requiring complete PASS and zero findings before public product push. Publish only named cloud branch via fleet push guard after checking every candidate commit identity and trailer.
8. Use exact-SHA REST CI discovery and no more than one poll per 300 seconds with a total ten-call GitHub budget. Keep full local report and actual receipts outside product branch; publish explicitly selected non-secret packet via evidence/gr-mt-uptime-dep-6. Report READY only for a qualifying exact-SHA Verify; otherwise retain honest custody and blockers.
