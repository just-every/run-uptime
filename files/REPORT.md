# Uptime: actionable second-factor step-up

Repository: just-every/run-uptime
Tag: main-uptime-mfa-stepup-1
Product branch: cloud/main-uptime-mfa-stepup-1
Product head: da7ac7af62cfda990f22f3e2ec520ef658c7ce49

## Plan and implementation

The full plan is in PLAN.md. Reproduced the finding before changing application logic by opening the real Settings › Alerts route as a new owner with no factors, entering an email and submitting Add destination. The route returned HTTP 403 with only the existing five-minute refusal and no dialog guidance link. Both screenshots and reproduction.json record that result.

Sensitive-action refusals now include non-secret guidance and a public enrollment deep link. The console uses the refusal to offer authenticator/passkey enrollment or a visible code/passkey verification prompt, then retries the retained request once after successful verification. Cancelling keeps the destination inputs. Ordinary permission refusals still follow the console's existing handling.

People's existing pending key and invitation flow uses the same server guidance and enrollment link. The enrollment deep link opens the enrollment control directly. Verification opens separately from Manage second factors whenever a fresh proof is needed. Pending actions wait until the owner acknowledges newly issued recovery codes, so a newly created key cannot replace those codes on screen.

Authenticator enrollment now presents the server's standard otpauth URI, a QR code generated locally from exactly that URI, and the manual secret. The URI, QR and secret are removed with the enrollment screen. No QR service receives factor material. Existing server authorization, five-minute freshness, replay checks, recovery-code generation/storage, policy enforcement and rate limits are retained.

## Scope and counts

Before publication, fetched main and rebased the unpublished work onto `c379fc6`, preserving the parallel rer 0.2.108 adoption. Reinstalled its pinned dependencies and repeated the touched checks.

No CONTRACT.md clause text, Status, Gap or Evidence cell changed. Generated acceptance views are unchanged. Clause summary before/after: 37 done / 58 partial / 20 missing, total 115. ACCESS-003 remains partial. No DONE claim is made.

Verify journey commands before/after: 47 / 47. Added test registrations: 0; extended the existing operator-security journey with related second-factor public-route assertions. The seed's 200-test cap is unchanged.

## Validation and browser proof

- Public Settings route proves refusal guidance matches what the owner sees and the returned enrollment link opens real enrollment.
- A QR decoder scans the rendered enrollment image and requires exactly the URI shown by the authenticator link; that URI must contain the manual secret.
- The destination flow covers wrong codes, real enrollment, recovery-code acknowledgement, retained email, stale verification, cancellation and exactly one destination created on continuation.
- Existing key and invitation flows prove continuation after verification without retyping. A factorless key waits for recovery-code acknowledgement before showing the key.
- Existing API/CLI policy, TOTP replay, recovery consumption, passkey edge, revocation, audit secrecy, notices, rate limits, restricted keys, CI-job stop, restart and member-refusal assertions remain in the touched security journey.
- Browser proof records the changed screens at 1440 and 390. Enrollment QR, URI and secret are masked; recovery authority is masked or dismissed before capture. Assertions run at 1440.

A local fixture's Worker restart left Chromium reusing a dead connection for tooltip.js and prevented the console modules from loading. The restart portion now closes and reopens the test-owned browser with the same synthetic session before reading the exact retained stopped job. No assertion was deleted or weakened; the persisted session, revoked key and job still have to survive the restart.

The integrated build, typecheck, deployment-spec check, source-lock check and complete touched operator-security journey passed (exit 0). VALIDATION.json contains the actual commands and results; CI.json records exact-SHA GitHub status. One non-fatal workerd Broken pipe diagnostic occurred during owned Worker shutdown; all assertions completed and the command exited 0.

## Limits and custody

The hosted 12ui review was unavailable because it required a new account sign-in; design-review.txt records the attempted review. The existing Uptime design was retained and actual browser renders were inspected locally.

Base's complete publication scan runs on the fleet's Mac at landing, as required by this cloud assignment; it is not claimed here. No deployment, release, PR or main/default-branch push is authorized or performed. Product custody and the evidence-only ref are separate. No credentials, environment dumps or private gate material are selected for evidence publication.

CLAIM ACCESS-003 PARTIAL points=1,2 tests=tests/security-controls-browser-support.mjs#proveSecurityControls; tests/mfa-policy-support.mjs#proveMfaPolicy; tests/mfa-webauthn-support.mjs#proveMfaWebAuthn
GAP ACCESS-003: Existing broader SSO/provider-MFA and local installation-recovery acceptance remains outside this UI fix; clause status remains partial.

## Final candidate result

Product branch `cloud/main-uptime-mfa-stepup-1` was pushed successfully at `da7ac7af62cfda990f22f3e2ec520ef658c7ce49`. Verify run [42985832979](https://github.com/just-every/run-uptime/actions/runs/42985832979) completed successfully on that exact SHA. The single watcher made five REST calls, separated by at least 300 seconds. No product blockers remain. No PR was created; the fleet owns landing and its Mac publication scan.

The plan and complete non-secret results are selected explicitly for the separate `evidence/main-uptime-mfa-stepup-1` ref. Product custody and CI status do not depend on evidence publication. The product clone is removed only after successful evidence publication; the packet remains outside it.
