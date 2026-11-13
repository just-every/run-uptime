# sd-uptime-security-wait-1

Repository: just-every/run-uptime
Branch: cloud/sd-uptime-security-wait-1
Candidate: e46b7145c4d4ff255e30f5669b5c4394917807c4
Base/fetched main: 1bf4132ecfaba4a94a34202bbd33a1de2b5e4ba6
PR: none required by this repository's builder/landing rules; fleet owns landing.

## Result and cause

The original credential-row timeout was reproduced through the unchanged existing operator-security journey. Required JavaScript imports received 429 after several rapid cold document loads shared the real public-asset counter. The security panel never mounted, so no credential-list request followed the failing reload. The same journey had already issued and used the credential successfully, including restricted read and last-used checks. This was real rate-limit admission exhaustion in the test workload, not lost credential data or an asynchronous credential row that merely needed more visibility time.

The helper now reads the stored asset-window expiry and waits for that actual window before the heavy credential reload. It requires a successful browser GET /api/credentials before the existing row/last-use assertions continue. At the later Worker restart, the same natural wait replaces the old DELETE of public rate-limit counters. The real limiter, counters, application, session, key and stopped definition job remain in place.

Only tests/security-controls-browser-support.mjs and the regenerated sources.lock.json changed. tests/operator-security.mjs and every product file remain unchanged. No retries, timeout inflation, new registrations, permanent tests, mocks, assertion deletions/weakening, skips, heartbeat changes, contract edits, releases, accounts or deployments were introduced.

## Plan and validation

PLAN.md contains the complete work plan; TRACE.md records the path from module admission to credential-list readiness. Safe network metadata contains paths/statuses/timing, with no bodies, headers, query strings, cookies or secret values.

- Before: existing operator-security journey failed at security-controls-browser-support.mjs:91:80 with the reported 30-second timeout. Eight 429 asset responses and seven aborted script requests were recorded. DOM sample: no security panel, no credential rows, console not signed in.
- After: the same complete existing operator-security journey passed. It retained owner/member TOTP, WebAuthn, wrong-code/replay refusal, recovery custody, factor policy, scoped key issuance and last use, immediate revoked-key 401, stopped CI job and restart persistence, member refusal, factor removal and axe/reflow, plus the invocation's MFA/migration/monitor-step-up checks. The full safe browser trace recorded zero asset 429s.
- Typecheck passed; an additional exact-candidate run uses the repository's Node 22.20.0 and system headless Chromium with --no-sandbox. The direct, uninstrumented exact-candidate Node 22.20.0 command passed (exit 0), as did pinned-Node typecheck. Its receipt and focused 1440/390 credential-screen screenshots accompany this report. The first pinned-Node diagnostic wrapper captured the owner key successfully, then incorrectly tried to capture it again after the intentional switch to a nonowner member. That evidence-only locator timed out because members correctly have no key rows. The complete unchanged journey was then run directly without the diagnostic wrapper; its native command/result is separately identified in RECEIPT.json. The instrumented failure log is retained rather than concealed.
- Source lock regenerated last with node scripts/edition-authoring/cli.mjs lock; its check passed. Contract-document check and JavaScript syntax/diff checks passed. Generated views were unchanged and uncommitted.
- Fresh main was fetched before publication; the unpublished branch rebase reported already up to date. One real commit was published without a skip marker. Author and committer are Run Edit Run fleet <fleet@runeditrun.com>, with no trailers.
- Exact-SHA Verify run: 43395524991, https://github.com/just-every/run-uptime/actions/runs/43395524991. Final status is in CI.json and RECEIPT.json.

## Before/after counts and clauses

Helper assertions: 98 → 99; all 98 original assertion expressions retained, one response-status assertion added. Push journey registrations: 47 → 47; operator-security registrations: 1 → 1. New permanent tests: 0.

Contract totals remain 37 done, 58 partial, 20 missing, 115 total. Published: 14/7/0 (21); target and push further: 23/51/20 (94). No clause text, Status, Gap or Evidence changed. ACCESS-003 and READAPI-001 retain their current partial judgments; this round repairs execution of existing bounded evidence and makes no acceptance promotion.

## Custody and limits

Product push succeeded on the first guard attempt. Full product provenance, local commands/results and exact-SHA CI status are retained in the packet. Evidence is published only to evidence/sd-uptime-security-wait-1 and does not signal acceptance or landing. The cloud cannot run the Mac fleet's full publication scan; the fleet must perform it and its independent gates before landing. No hosted/provider or broader member-shell qualification is claimed.
