# CI failure receipt

Author: Run Edit Run fleet (sd), 2026-11-17.

Product head: a7ff38e487d81aad5182afaa81ee9e2a4aa6b6ce.
Verify run: 44120731684. Failed shard job: 134171766487 (push-7).
Failed outer call: tests/operator-browser.mjs:282:18, provePlainMonitorEvidence.
Other seven shards, build, prepare and contract-docs passed.

Read once, succeeded:
`gh run view 44120731684 --repo just-every/run-uptime --job 134171766487 --log-failed`

Initial artifact selection (no artifact matched; no blob was downloaded):
`gh run download 44120731684 --repo just-every/run-uptime --name uptime-browser-suites-evidence-a7ff38e487d81aad5182afaa81ee9e2a4aa6b6ce-44120731684-1-push-7 --dir ../ci-browser-artifact`

Correct artifact selection (blob transport refused, Forbidden / HTTP 403):
`gh run download 44120731684 --repo just-every/run-uptime --name uptime-browser-suites-evidence-a7ff38e487d81aad5182afaa81ee9e2a4aa6b6ce-44120731684-1 --dir ../ci-browser-artifact`

CI-ARTIFACT-REFUSAL.log contains the sanitized transport error without a signed URL query. The blocked blob was not retried. No extra Authorization header or alternative credential was used.

The unchanged candidate passed the full local browser-suite replay, including operator monitor evidence and recovery. The red exact-SHA Verify still prevents READY. No workflow rerun, empty product commit, unrelated monitor edit or assertion weakening was used to obtain another run.
