# gr-mt-uptime-dep-5

Repository: just-every/run-uptime
Product branch: cloud/gr-mt-uptime-dep-5
Candidate: 28c0bb130a0ec6b045bcbebc44ee05d787c76acb
Base: 03323cf (includes the newly landed transitive Zod 4.6.6 fix)

## Change and scope

Upgrade direct devDependency Vite from 8.2.2 to the first patched release, 8.2.4. pnpm 10.12.4 regenerated every Vite peer reference in pnpm-lock.yaml without upgrading another package. The edition authoring command regenerated sources.lock.json for the two changed files. No application, UI, test, contract or generated acceptance-view changes.

The listed ten Dependabot alerts describe five advisories affecting 8.2.0 through 8.2.3: GHSA-587h-7wmj-h5pm, GHSA-r825-w8mm-5pxw, GHSA-vfpm-58rq-9qcg, GHSA-rq7h-c2jc-7f22 and GHSA-9jrq-w75r-8gcw. The direct pin and every installed Vite consumer now resolve to 8.2.4. No request to close or change alerts was made.

## Plan and decisions

PLAN.md records the full execution plan. Refreshed the authorized fleet launcher; installed Git authentication, guarded push and chained commit hooks; cloned only the declared repository with full commit history. Read repository contributor, runtime, contract and baseline guidance. The toolchain script initially reports the VM Node version, then the command environment explicitly selects installed Node 22.20.0; all dependency install/build/typecheck commands used Node 22.20.0 and pnpm 10.12.4.

A precommit fetch discovered main had advanced from d47a432 to 03323cf with a Zod 4.6.6 fix. Advanced the unpublished cloud branch to main and reapplied the saved Vite patch. The overlapping peer line conflicted; a frozen install refused the unresolved lockfile. Regenerated from main's whole pnpm lockfile with the Vite 8.2.4 manifest, preserving Zod 4.6.6, then repeated frozen install, build and checks successfully. No published history was rewritten.

## Verification

Actual commands, exit codes and scope are in local-checks.json. Passed frozen dependency install, noninteractive fleet-owner setup, explicit production build, application and runner TypeScript checks, deployment-spec regeneration/check, edition source-lock regeneration/check, contract-doc check and git diff --check. Setup output and runtime logs remain private outside this packet; evidence contains only non-secret outcomes.

The existing command journey passed on the exact committed candidate and is the targeted integration check for Vite: real client and environment module imports, development hydration, HMR support, native setup/forms, preview production assets and CLI data recovery. It uses Chromium at /usr/bin/chromium with --no-sandbox and one browser worker at 1440. No new pin tests or full local verification suite. No UI changed, so a new visual proof is unnecessary.

## Before and after

Vite: 8.2.2 -> 8.2.4. Distinct vulnerable Vite resolutions: 1 -> 0. Unrelated package upgrades in this branch: 0. Changed product files: 3. Test registrations added/deleted/weakened: 0/0/0. Clause counts remain 37 done, 58 partial, 20 missing, 115 total. No clause status changes or new claims; existing judgments and generated views remain intact.

## Custody and remaining checks

Publication scan, product push and exact-SHA Verify receipts are added below when complete. The fleet owns independent publication checks and landing; this cloud never moves main. Evidence publication is separate from product readiness and contains no credentials, private installation settings, environment dumps, held-out gate material or symlinks.

The initial Base publication scan returned INCOMPLETE with scan.deadline-exceeded at the default 300 seconds. Its actual receipt is publication-scan-initial.json. A second invocation uses the scanner-supported 1800-second deadline on a clean worktree of the same committed candidate, not the private installation checkout. Gitleaks 8.30.1 was obtained through gh api from its official release.

The second publication scan completed on the exact candidate but returned destination.invalid because the invocation supplied a repository slug without its project binding. This was an invocation error, not a product finding. Validated the committed destination with the scanner destination.py using --project just-every/uptime-monitor and --repository https://github.com/just-every/run-uptime, then reran the full scanner with those flags. The complete failed invocation receipt is publication-scan-invocation.json.

Final publication scan: COMPLETE/PASS, zero findings, exact commit 28c0bb130a0ec6b045bcbebc44ee05d787c76acb and tree 9e187ead5aeb08e3ad7220412912969de7efd1b4. Scanned 1053 commits, 1034 trees, 9161 blobs, 1053 commit messages and 22 tag messages. The report separately retains 29 already-public detector entries; none is a new candidate finding. The fleet still owns its independent scan and guarded landing.

Product custody: guarded push succeeded on attempt 1 to cloud/gr-mt-uptime-dep-5 at 28c0bb130a0ec6b045bcbebc44ee05d787c76acb. No main push, PR, tag or release was created. Push diagnostics reported existing default-branch Dependabot alerts; they are outside this Vite-only change. The clean publication worktree was removed after scanning; the product clone and independently verified recovery bundle remain available.

Exact-SHA CI: push Verify run 43584666832 was discovered in_progress for 28c0bb130a0ec6b045bcbebc44ee05d787c76acb at https://github.com/just-every/run-uptime/actions/runs/43584666832. One watcher performs REST observations at least 300 seconds apart; ci-receipt.json retains the actual discovery and polling responses. A result from another SHA is never accepted.
