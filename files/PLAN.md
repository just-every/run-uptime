# Plan for gr-mt-uptime-dep-1

1. Configure fleet Git identity, refresh the launcher, install the bundle-only Git helper, push guard, evidence transport and commit hooks.
2. Clone only just-every/run-uptime into work/maint/gr-mt-uptime-dep-1/repo and create cloud/gr-mt-uptime-dep-1 from origin/main.
3. Read repository AGENTS.md, CLAUDE.md, TESTING.md, package manager pins, contract, lockfile and publication instructions. Determine the current direct and transitive TanStack versions.
4. Select the smallest compatible patched react-start update (at least 1.168.60), regenerate pnpm-lock.yaml with the pinned pnpm, and independently confirm start-server-core is at least 1.169.39. Avoid unrelated updates; use an override only if no compatible parent carries the fix.
5. Run install, build, typecheck and the relevant touched tests under the required cloud toolchain; preserve logs and version receipts outside the product checkout.
6. Commit the minimal product change using fleet author and committer identity and the fleet co-author hook. Synchronize main without rewriting published history. Run the required exact-tree publication scan and candidate identity/trailer checks before publishing only the named cloud branch with cloud-push.py.
7. Discover and poll exact-SHA Verify via the mandated REST API within the ten-call budget and 300-second per-run interval. Fix in-scope failures when possible. Do not publish or land main.
8. Save result.json plus the complete non-secret report and receipts. Publish selected packet files only through evidence/gr-mt-uptime-dep-1; report actual product custody and CI honestly.

No target contract clauses or status changes are prescribed by this dependency-only brief. Their actual counts remain unknown until repository access succeeds.
