# gr-rer-dryrun-output-1

## Finding and candidate

Released rer 0.2.118 still prints **Needed for a real deploy** twice for one ordinary Uptime `rer deploy --dry-run`. Both lists are identical. The Base candidate renders the combined list once, preserves every bullet, exits 0 and makes no outbound connection/send calls. This is a Base source fix awaiting normal PR verification and fleet landing; no release or seed adoption occurred.

- Base source main inspected: `c3a38757f6ab6246f61aeca5eb9f4f83efd5f88f` (released 0.2.118).
- Base candidate: `34847bae3f640486f16d42affb2274f32075248a`, tree `792ce8c8f75c58fa8adb8e149c99db0d722408e1`.
- Product branch: `cloud/gr-rer-dryrun-output-1`, pushed once through the fleet guard; origin advertised the exact same SHA.
- Required PR: https://github.com/runeditrun/base/pull/862 (open, targeting main).
- Uptime fresh main: `2045014b15f76380b5d7493c0c42b2caa430f88b`, version 0.5.12, tracked rer pin 0.2.113. No product commit, product push or PR in Uptime.

## Invocation path and renderers

The public launcher delegates to the checkout's pinned rer. The project dispatcher is `bin/rer.mjs → cli/main.mjs → cli/lifecycle.mjs:132 → deployCommand`.

Uptime's `scripts/installer/local.mjs` selects its deployment wrapper. In `scripts/deployment/command.mjs:82–95`, that wrapper is marked `managesHostedOwner: true` and calls the real shared `deployCommand` again at line 90 with its upload hook. The inner controller runs the actual Uptime Vite build and local resource plan; both inner and outer controllers then rendered the dry-run summary.

There are two textual heading sites in Base's `cli/deploy-needs.mjs`: `missingCredentialsMessage` at line 40 and `reportNeeded` at line 72. The ordinary successful dry run invokes **the same reportNeeded site twice**, through the nested controllers. The other textual site is not the cause: `cli/deploy.mjs` only throws that missing-credentials message for a non-dry-run deployment.

The fix at `cli/deploy-command.mjs:29–31,90–106` passes a private symbol through the dry-run hook context. A nested controller keeps all planning, authentication/input preflights, needed-input calculation and return data, and defers its summary to its caller. The outer controller already merges its own needs, hook needs and owner-input needs into a Set. Only it renders the completion, needed-input section and related summary notices. Real deployment code paths are unchanged. Failure before an outer plan succeeds does not print a premature nested success summary. There is no global deduplication state shared between independent invocations.

## Real consumer evidence

All CLI proofs use real Uptime application code and its real build/plan, with no mocked/fallback application or provider implementation. The probes constructed an allowlisted credential-free environment, isolated HOME and exact Node 22.20.0/pnpm 10.12.4 PATH. No env-file was supplied. `unshare --user --map-root-user --net` created a network namespace without external interfaces; `strace -f -e trace=network` recorded the command descendants. No connect/sendto/sendmsg calls occurred in any of the three proofs. No server or browser was started.

| Actual run | Executed package path | Headings | Base completion summaries | Exit | Outbound connect/send calls |
| --- | --- | ---: | ---: | ---: | ---: |
| `public-uptime` | released 0.2.118 launcher → Uptime's installed 0.2.113 pin | 2 | 2 | 0 | 0 |
| `current-0118` | released 0.2.118 public project dispatcher and 0.2.118 adapter dependency resolution | 2 | 2 | 0 | 0 |
| `candidate-uptime` | repository-packed candidate project dispatcher and candidate adapter dependency resolution | 1 | 1 | 0 | 0 |

The first case is an ordinary public `rer deploy --dry-run`, without additional rer flags. For current-source and candidate isolation, only the ignored installed `node_modules/@runeditrun/rer` symlink was temporarily redirected to each real package outside the consumer checkout. The public `bin/rer.mjs deploy --dry-run` entry then ran the same actual project code. This avoids changing Uptime's pin or triggering the global launcher's intentional pin reconciliation. The original installed symlink was restored afterward; all tracked Uptime files remained byte-for-byte unchanged. This is consumer testing, not seed adoption.

The candidate tarball was built from the scoped working-tree patch before the final commit with `node scripts/rer-package.mjs --out ../candidate-artifacts`. The packer retained the tagged source's 0.2.118 version in this disposable fixture. It is **not** the published release. `source-provenance.receipt.json` proves that its changed module is byte-identical to the final committed source and regenerated reference copy, and that released npm 0.2.118 matches the original Base source. The tarball SHA-256 and npm acquisition integrity are retained.

`section-comparison.json` asserts equality of all four missing-input bullets across both before sections and the one after section: Cloudflare credentials/permissions, OWNER_EMAIL, production mail/SSO guidance and owner name. Full stdout, stderr, exact argv/cwd, time stamps, byte counts, package/Node versions, exit codes and network traces are retained under each run's prefix. These runs show why stdout-only counting would miss the section: ordinary output here has 26 bytes on stdout (the completion result) and the actual needed-input section on stderr. Count both streams. The cause of the historical empty-output observation was not established.

## Validation and source custody

- Focused existing tests: 18 passed, 0 failed, 0 skipped; `deploy-dry-run`, `deploy-dry-run-hook`, `deploy-mail-notice` and `deploy-mail-binding`, concurrency 1. These existing tests use their established test provider boundaries; they are separate from the real consumer reproduction.
- Touched TypeScript compiler/import-graph check passed with allowJs/noEmit. This is not a claim of strict checkJs inference over the untyped CLI.
- Generated CLI inventory consistency check: 1 passed; `cli/cli.test.mjs` restricted to its portable inventory test.
- `node --check cli/deploy-command.mjs` and `git diff --check` passed.
- Maintained copy/inventory regenerated only with `node scripts/export-cli.mjs default-seed`. No source-lock or contract generator applies to these three changed Base paths.
- Fresh main fetched before the candidate; unpublished changes stashed with fleet identity, rebase confirmed the same current main, then restored. No published history rewrite or force push.
- Fleet hooks remained active. The sole product commit has fleet author and committer and no trailers; the complete `origin/main..HEAD` audit is retained.
- No permanent test, release/version bump, Uptime adoption, contract cell, auth, money, deployment authority, data path, migration or doctor correction change. Only Base's controller, its generated maintained copy and generated inventory changed.

No local full suite or publication scan was substituted for the required gates. Natural exact-SHA PR Verify is the full wall; the fleet still owns its independent publication scan and landing. CI status is recorded in the current result/CI receipts; this report does not itself assert READY.

## Clause judgments and limitations

Clause status changes: **none**. Uptime progress remains Full target 37 done / 58 partial / 20 missing, total 115 (Core 37/47/11; Agent surface 0/11/8; Later 0/0/1). All contract, acceptance and claims files remain untouched. The task closes only the duplicated CLI rendering question, not any hosted deployment or provider readiness claim. Released 0.2.118 and Uptime's retained 0.2.113 pin continue to have their original behavior until a later authorized release/adoption.

The full execution plan is PLAN.md. Complete actual non-secret proof streams, receipts, source diff, identities and CI records accompany this report. Evidence publication is report-only, separate from product custody and acceptance. Cleanup and terminal outcome are recorded in result.json and cleanup.receipt.json; any evidence-return fault must be reported as a tool gap.
