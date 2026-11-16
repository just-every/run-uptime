# Uptime C4 mail provider switch

Author: Run Edit Run fleet. Date: 2026-11-16 UTC.
Repository: just-every/run-uptime.
Branch: cloud/sd-uptime-mail-switch-1.

## Plan

1. Initialize the authorized launcher, bundle credential helper, commit hooks and repository toolchain. Clone only the declared Uptime repository and preserve fleet author/committer identity.
2. Adopt exact @runeditrun/rer 0.2.121 and refresh Base from immutable f2737d02a5f77be042cfdfd237a7dce4689cbe2f using the supported API acquisition door; no additional repository clone.
3. Declare MAIL_PROVIDER as an explicitly public setting with optional secret transport and a none source default matching Wrangler. Preserve SendGrid behavior for legacy inputs omitting the selector.
4. Extend the existing lifecycle journey and fake Cloudflare network edge, without a new test registration, to enable SendGrid and return to none on the same admitted installation. Check Worker/D1 ownership, admitted owner, signing authority, migrations, restored public default and guarded sign-in. No real provider.
5. Replace obsolete enable-email limitations in OPERATIONS.md and docs/deploy.md with the proven grouped commands. Check operations inspection for sendgrid, resend, cloudflare, none and an omitted selector.
6. Regenerate deployment projections after the build, regenerate the source lock last and check it. Run touched lifecycle checks and typecheck; use exact-SHA branch Verify for the full suite. No contract judgment, generated contract-view edit, release metadata, tag, main push or PR bypass.
7. Refresh main before publication, audit every unpublished commit identity/trailer, push only the named cloud branch through the guard, inspect exact-SHA Verify through REST within budget, then publish this packet separately to the evidence ref.

## Results

The first attempted declaration failed the pre-existing lifecycle assertion at tests/owner-deploy-lifecycle.mjs:23, before any switch step, build or provider upload. With MAIL_PROVIDER omitted and the existing MAIL_FROM/SENDGRID_API_KEY inputs, the public none source default is selected during production preflight. Exit 4, safety_refusal: “MAIL_PROVIDER=none turns outbound email off, and SENDGRID_API_KEY would bind a way to send. Remove it or choose a mail provider. Nothing was built or uploaded.”

The brief explicitly says to stop at pin adoption plus correct docs if rer 0.2.121 refuses something the journey needs. Applied that instruction: withdrew the attempted declaration, Wrangler default, adapter change, managed projection and journey/fixture extension in a new commit rather than rewriting the published save. The final product scope is the exact rer 0.2.121 pin, immutable Base refresh and corrected limitation documentation. No fallback, disabled assertion or weakened journey was introduced.

Operations inspection passed all five requested configurations with synthetic inputs and no provider requests. Explicit none reports optional-disabled/mailOff, the other four cases ready. The source-declaration trial passed rer check, the build, managed-spec generation and typecheck before the lifecycle refusal. These trial results do not prove the switch.

The attempted lifecycle retained one test registration before and after. The final journey is unchanged from main, so no registrations were added or removed. Contract counts remain 37 done, 58 partial and 20 missing (115 total). Clause statuses are unchanged.

The unchanged lifecycle journey passed under the exact rer 0.2.121 pin on save 39e0b107e1d1a901429ad33344083f8788e16f37: one test, zero failures, 81.74 seconds. The native mail-off deployment and guarded owner sign-in receipt is included. This result establishes the preserved path, not the withdrawn switch.

Base refresh completed at immutable f2737d02a5f77be042cfdfd237a7dce4689cbe2f. All 123 recorded copy entries now name that revision. It changed only Base provenance and the copied SEED-COMMAND-CONTRACT.md browser provisioning guidance; runtime code and tests are unchanged. Existing seed-owned workflow/lobby/mail-package adaptations and dependency selections were preserved. The refresh reports an existing lobby adaptation difference and React/Miniflare/Wrangler version differences; offline verify-base passes, and these unrelated policies were not changed.

The final fallback build, deployment-spec generation/check and typecheck passed under Node 22.20.0. Offline verify-base, final rer check --profile first-party and the regenerated source-lock check also passed. The lock was regenerated last. The copied command contract and provenance are the only changes after the successful lifecycle run, so no runtime re-test was warranted.

Fetched main immediately before final publication; main was unchanged and the required merge was already up to date. All three candidate commit identities and full messages, including side-parent traversal, were checked before push. No coauthor trailers. All three product pushes succeeded on their first guarded attempt. No main/default-branch push, force push, PR mutation, release metadata edit, tag or real provider operation occurred.

Final candidate: f5ae7e2e254bc90c64d2ec617e617a2fe3dd1ed9 on cloud/sd-uptime-mail-switch-1. No PR is required by this seed's branch landing flow. Exact-SHA Verify run 43943587519 completed successfully on f5ae7e2e254bc90c64d2ec617e617a2fe3dd1ed9: https://github.com/just-every/run-uptime/actions/runs/43943587519. CI REST custody used one discovery call and three status calls, at five-minute intervals. The complete packet was published to the separate evidence ref and is being updated with this terminal result. Clone cleanup follows successful final evidence publication; the packet remains outside the clone. The Mac lander retains the required publication scan and landing authority; this cloud makes no landing or release claim.

No contract clause claimed; this is the mail follow-up C4.
