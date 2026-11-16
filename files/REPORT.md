# Uptime mail-off C1–C4 and rer 0.2.119

Author: Run Edit Run fleet. Date: 2026-11-16 UTC.
Repository: just-every/run-uptime. Product branch: cloud/sd-uptime-mail-followups-1.
Starting main: be708323f508df4bb0955c701763eb621f5dddff. Version retained: 0.5.14.

The full work plan is PLAN.md. Product and evidence publication are separate. Product and CI provenance are recorded in the receipt files.

C1: main already contains the exact SendGrid whenUnset binding requested in OPERATIONS.json. The existing mail-off journey now exercises operations inspection for an omitted provider with complete SendGrid inputs and explicit SendGrid, Resend, Cloudflare and none. The Cloudflare edge fixture uses a syntactically valid synthetic account ID. No declaration rewrite was needed.

C2: /api/access/invitations checks the existing actor permission and requested assignment, then returns 503 mail_unavailable before Base's invite call, operator write, token write or product assignment. The hosted mail-off journey attempts Admin, Editor, Responder and Read-only invitations to both the admitted owner's and an unknown address. Before/after counts are operators 1 → 1, tokens 0 → 0, assignments 1 → 1. The native Member invitation refusal and origin protection remain covered. People shows no false Invited row.

C3: the existing self and notification responses expose a boolean mailOff, which distinguishes a deliberate off installation from missing configuration. People explains that email is off and invitations need email. Alerts says email is off, names the destination that cannot send, and omits Set up email. Saving an email destination also explains that it cannot send. Failed delivery state and the existing honest notification outcomes are preserved. Browser assertions run at 1440; screenshots show People and Alerts once at 1440 and 390. Only synthetic owner and destination data are shown.

C4 exploration: rer is pinned exactly to 0.2.119. An experimental deploy.json declaration placed MAIL_PROVIDER under publicSettings and optional secret transport. The real CLI lifecycle journey switched none → SendGrid and back using the fake provider's content/v2 and grouped-version endpoint, preserving the admitted owner. This experiment is c4-experiment.json, not final-candidate acceptance: rer check rejected MAIL_PROVIDER in both Wrangler vars and deploy secrets. Removing the Wrangler var failed managed deployment-spec generation (Managed mail requires public MAIL_PROVIDER). Read-only API inspection of modules/delivery-producer/mail.mjs and spec.mjs at bbab5d84b72e333ff1e9a6f234c0512e5721b1d9 confirmed the same requirement. The explicit brief fallback is adopted: keep C1–C3, the exact rer pin and Base refresh; retain the supported existing deployment declaration and managed spec, correct both enable-email paragraphs, and request a public-setting switch compatible with those checks. The experimental switch declaration and fake-edge changes were removed from the final product diff.

No contract Status, Gap or Evidence cell is edited. Follow-up outcomes are C1 complete (already declared on main, now tested), C2 complete, C3 complete, C4 partial (pin/Base adoption with provider-switch gap). Counts remain Published 14 done / 7 partial / 0 missing / 21 total; Target and push further 23 / 51 / 20 / 94; All 37 / 58 / 20 / 115. Release version, CHANGELOG, RELEASE.json, seed.json, tags and releases are unchanged. No new pin tests or test registrations were added; existing journeys were extended.

The local launcher initially used --input-type=module for a one-off browser invocation, which blocked Miniflare's synchronous worker. The same journey executed from a normal .mjs file passed. An access-matrix launch initially omitted the installed Chromium path and was rerun with /usr/bin/chromium. These were invocation issues, not product assertion repairs. Earlier fixture assertions exposed an invalid synthetic Cloudflare account ID and missing content retention after a single-secret version; both network-edge fixtures were corrected while preserving the behavioral assertions.

Full publication scanning is owned by the Mac lander and cannot run in this cloud, as stated in the assignment. No product READY claim substitutes for that scan or main landing. Provider tests use fake network edges; no live account or recipient delivery is claimed.


The immutable Base refresh completed successfully at bbab5d84b72e333ff1e9a6f234c0512e5721b1d9. Its complete actual output is base-refresh.log. It updated 123 copy records; byte changes are limited to Base source-lock code and documentation. No application runtime file or test changed during this refresh. Existing seed-owned Lobby and Verify workflow adaptations and existing React/Miniflare/Wrangler pins are retained; the refresh notices are advisory and offline Base verification passes. No homepage or dependency-version expansion was undertaken.

The touched rer verify run completed with exit 0 under SEED_VERIFY_SHARD=hosted-auth-browser. It passed the complete enabled/disabled native browser flow, hydration, statement-size checks and 8,116 agent conformance points. It ran before the Base record update; the application bytes it exercised are unchanged on the final candidate. After refresh, typecheck, first-party structural check, managed spec check, generated contract-document check, Base offline verification, regenerated source lock and source check passed. The exact-SHA branch CI below remains the full verification wall.


Follow-up claims (brief C1–C4; these do not promote CONTRACT.md judgments):

CLAIM C1 DONE points=1 tests=tests/mail-off-support.mjs#proveMailOff
CLAIM C2 DONE points=1 tests=tests/mail-off-support.mjs#proveMailOff
CLAIM C3 DONE points=1 tests=tests/mail-off-support.mjs#proveMailOff
CLAIM C4 PARTIAL points=none tests=tests/owner-deploy-lifecycle.mjs#real rer deploy covers fresh custody, automatic legacy upgrade, conflicts, named keys, exact repeat, resume and foreign ownership refusal
DEFAULT C4: Use the brief's explicit C1–C3 plus rer pin fallback; retain the managed-mail declaration and report the unsupported in-place switch.
GAP C4: rer 0.2.119 supports publicSettings over secret transport, but its deploy.vars-secrets check rejects the Wrangler MAIL_PROVIDER required by the managed-mail spec; removing the var makes spec generation fail.

Product publication: three fleet-authored commits were pushed through cloud-push.py, including two [skip ci] preservation saves and the real final candidate. No published history was rebased or force-pushed. Final branch: cloud/sd-uptime-mail-followups-1. Final head: a22d1fac71eb6b0a2f6e7596454393d10361829a. No PR, tag, release or main push was created. Exact-SHA Verify run 43870763957 completed successfully on a22d1fac71eb6b0a2f6e7596454393d10361829a. Four REST CI calls were used, with at least 300 seconds between observations. See ci-status.json and terminal.json for the actual final receipt. No blocker remains within the explicit fallback scope; C4’s in-place provider switch remains the reported gr follow-up.


CI: https://github.com/just-every/run-uptime/actions/runs/43870763957 — completed/success on the final 40-character SHA. The main checkout was freshly fetched and already up to date before the final commit. All three candidate commits carry fleet author and committer identity and no co-author trailers. The working tree is clean. Evidence transport is report-only and does not land the product; the Mac lander owns publication scanning and main admission.
