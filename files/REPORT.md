# Heartbeat failure output redaction

Repository: just-every/run-uptime
Branch: cloud/main-uptime-heartbeat-redact-1
Tag: main-uptime-heartbeat-redact-1
Base: 7f07c2c0584c32be2d3c0a848bc23e827832825d
Product head: 11994a0593d6a2599907f17fa41af9bb98d72ca7
Verify run: 43151105222 (exact head; final status in CI receipts)

## Plan and implementation

The complete plan is PLAN.md. Native owner admission, monitor creation, heartbeat key issuance and POST /api/heartbeats/:id/fail/3 reproduce the stranger finding on the emitted pre-fix Worker with real migrated local D1. No production installation or customer data was inspected. The reproduction confirms raw key-shaped text in durable heartbeat output, run history, the read API and the archive; existing Bearer and password masking works.

Heartbeat output now uses the existing failure-snapshot text redactor before the existing UTF-8 byte bound. Its duplicate regex scrubber is removed. Stripe secret, restricted and publishable key shapes in live and test modes join the shared provider-pattern matcher, along with the provider shapes heartbeat already supported: five GitHub token prefixes, GitHub fine-grained tokens, AWS access key ids, the existing sk-dash key form and JWTs. Private-key blocks, URL credentials and access-key assignments move into the shared implementation to retain heartbeat protections. Owner masks and control/ANSI stripping remain. Card matching now respects alphanumeric boundaries so a hex commit identifier containing a card-like digit run stays intact.

The existing signed-runner heartbeat lifecycle is extended rather than adding a registration. All planted provider-shaped input is assembled at runtime. Fifteen provider fixtures, twenty planted output secrets in total, and six ordinary/partial values cover durable rows, scheduled history, the console's Load run history control, JSON/CSV read reports and archives. Console assertions run at 1440; screenshots show the same history at 1440 and 390. No UI source, heartbeat doors or stored rows are changed. No credentials, screenshots, evidence or report files belong to the product branch.

## Existing stored rows and migration

YES: pre-fix ingress stores recognisable Stripe-shaped values verbatim. baseline-probe.json records a successful real public-door request and raw value presence in all four surfaces, without recording any planted value. The later probe on the fixed worktree records absence in all four surfaces. Its final receipt is refreshed on the committed candidate before publication. The expanded lifecycle also fails against the old build at its stored-secret assertion, establishing that this is a meaningful regression check.

Existing records are not automatically scrubbed by this change. heartbeatRuns selects heartbeat_runs.output unchanged, heartbeatJobSnapshot copies the stored output into the installation-local claim snapshot, reports and archives carry stored runs, and inactive restore validates structure/bounds rather than re-redacting historical output. A previous failing evaluation can also have copied output into immutable scheduled observations, incident explanations and notification history. A follow-up cleanup/migration is needed for affected installations to remove historical plaintext, with an explicit policy for immutable/signed evidence, retained archive-history/transfer copies and offline archives. No migration or rewrite is implemented here. Production row counts and actual customer exposure remain unknown; the reported before/after counts concern isolated synthetic reproductions only.

## Validation and counts

baseline-probe.json: HTTP 200; key present in storage, run history, read API and archive (4/4); Bearer and password masked.
candidate-probe.json: HTTP 200; key absent in all four surfaces (0/4); Bearer and password still masked.
regression-before.log: the extended existing heartbeat test fails against the old emitted build on the stored-secret assertion, as expected. During local fixture development the synthetic AWS suffix was corrected from 17 to the required 16 characters, and whole-response secret checks were separated from the intentional owner-mask setting; the final test still asserts that owner-mask text is absent from stored and displayed output.

Local build, typecheck, the full touched signed-runner journey, the shared failure-page journey and source-lock check all passed. Validation results, exact candidate identity, CI runs and final custody are recorded in validation.json and CI receipt files before evidence publication. Local commands use Node 22.20.0 and pnpm 10.12.4. System Chromium /usr/bin/chromium runs with --no-sandbox. The snapshot regression's isolated Playwright executable adapter also launches that real system Chromium; it changes no product or test code and fakes no browser behaviour.

Test registrations: +0 / -0. Clause status counts before/after: done 37 -> 37; partial 58 -> 58; missing 20 -> 20. CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are unchanged; there are no status/gap/evidence edits and no DONE claim. counts.json records this scope.

CLAIM HEARTBEAT-002 PARTIAL points=2 tests=tests/signed-runner.mjs#a sequence-protected job reports duration, bounded redacted failures and late recovery through real Bash and signed scheduled evaluation; tests/heartbeat-console-support.mjs#proveHeartbeatOutputRedaction
GAP HEARTBEAT-002: Hosted SCHEDULE-002 alert timing remains unproven; this round proves local immediate scheduled evaluation and redacted output only. Historical unmasked rows need a separately authorized cleanup round.
DEFAULT HEARTBEAT-002: Preserve all stored rows and contract judgments; investigate historical exposure through isolated reproduction and source paths, without production access.

## Publication and custody

The product branch is the sole product write target; main is never pushed. Fleet identity, commit hooks and all-candidate identity/trailer inspection remain active. The source lock is regenerated last and checked. The Mac fleet owns the complete publication scan and landing, per the cloud brief. Evidence publication uses only refs/heads/evidence/main-uptime-heartbeat-redact-1 and conveys no product acceptance or landing authority. No PR is required by the repository's documented branch workflow.
