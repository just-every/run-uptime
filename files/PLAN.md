# Uptime mail-off fix plan

Author: Run Edit Run fleet, 2026-11-15.

1. Configure fleet Git credentials, identity and forwarding commit hooks. Read launcher instructions, repository contributor guidance and inline builder rules. Limit writes to just-every/run-uptime and its named cloud branch.
2. Reproduce `pnpm run test:base` on d600eba12c99ca0865b91f77b12556f9aad314c6 before changing the declaration. Read Oncall and Lamp main mail declarations through one read-only GraphQL request.
3. Rebase the unpublished inherited mail-off commit onto current Uptime main, retaining main's configuration journeys, contract judgments and health/release metadata. Keep Uptime's managed public MAIL_PROVIDER default and remove the redundant static secret. Oncall and Lamp inform the single-declaration intent; Uptime's retained producer requires the public field, while rer rejects even an empty duplicate. Preserve native dynamic bindings and the SendGrid fallback, and check managed spec freshness.
4. Extend existing journeys only: valid providers and omitted provider through native validation, deploy plan and Base preflight; real owner deploy with an omitted provider; explicit SendGrid shared-key mapping; actual hosted mail delivery with no provider selection. Add no registration and change no Status, Gap or Evidence cell.
5. Generate contract views and prove their generator check; restore main's two generated views. Regenerate the source lock last and check it. Run `pnpm run test:base`, typecheck, emitted build, hosted-auth-browser including proveMailOff, owner-deploy-lifecycle, public-paths and hosted-alerts. Capture mail-off login once at 1440 and 390 through the existing journey.
6. Review all candidate identities, trailers and diff. Commit with explicit fleet author/committer and active hooks; push through the fleet guard. Preserve first substantial work and require a final non-skipped head.
7. Discover exact-SHA Verify by REST after the prescribed 15-minute delay; use a single watcher with at least 300 seconds between calls and reserve two failed-log calls. Accept only success or the generated-contract-view exception. Do not deploy, land or push main.
8. Save actual non-secret reports/receipts outside the product; publish explicitly selected files only on evidence/main-uptime-mail-off-1-fix1. Return product provenance, claims, counts, CI results and lane POST lines. Remove the product clone only after successful publication and preserving reports.

No status promotion is planned. STARTUP-001 remains PARTIAL, points=none. Live provider, hosted qualification and existing broader startup diagnostics gaps remain outside this fix.
