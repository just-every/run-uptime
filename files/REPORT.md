# Uptime credential-row readiness continuation

Repository: just-every/run-uptime
Branch: cloud/sd-uptime-security-wait-1-pc1
Preserved published starting head: e46b7145c4d4ff255e30f5669b5c4394917807c4.

## Diagnosis and before proof

The original main journey was reproduced through tests/operator-security.mjs with the actual emitted Worker, native authentication, actual console, and Chromium. The credential API returned HTTP 200 before reload. During the reload, the real public asset limiter returned HTTP 429 for report-render.js, settings-save.js, settings-view.js, slow-policy.js, transaction-panel.js, app.monitors.new's emitted module, step-up.js, and favicon.svg. The module graph could not finish, so hydration never reached the credential row. The existing locator failed at security-controls-browser-support.mjs:91 after its unchanged 30-second timeout. See original-journey.log. This is an exhausted asset admission window in the rapid repeated-document journey; waiting longer for a row after the modules fail cannot repair that document. No missing persisted credential was observed.

The saved e46b714 change already waits for the installation's actual asset window to expire naturally rather than deleting limiter state. Its full operator-security journey passed locally; see before-journey.log. The original behavior was reproduced by temporarily using main's existing security helper and restoring the saved file afterward; that reproduction was never committed. Diagnostics are an external browser observer that records method, route pathname, status, navigation, and failure type only; it does not change requests or responses or record credentials.

Verify 43395524991, attempt 1, did not fail the credential journey. GitHub reported all other shards successful and push-6 cancelled. Its shard step ran from 08:45:32Z to 09:05:07Z and the job concluded at 09:05:11Z. The current push-6 plan does not include operator-security. One --log-failed invocation and one ordinary log invocation for that cancelled job each returned exit 0 with empty output. No assertion or root cause can be recovered from those logs. prior-job.json records the actual job metadata. An initial direct exported-helper startup probe stalled before creating schema; its owned processes were stopped, and it is not used as product behavior evidence.

## Forward change

The local loadCredentialRow helper preserves the saved natural asset-window wait and observes the public GET /api/credentials before navigation. It requires HTTP 200, requires the persisted credential ID in the response body, and waits for that same row in the new document. Both the credential-use reload and the cold browser after Worker restart use this readiness path. The existing last-use, secrecy, resource restrictions, step-up, revocation, exact stopped-job, owner/member, factor, and accessibility assertions remain. The additional readiness assertions run within the same existing journey; no permanent test registration was added, deleted, skipped, or retried, and no timeout was increased. Product code and tests/operator-security.mjs are unchanged.

Browser proof captures the relevant reloaded People credential screen at 1440 and 390 in screenshots/people-credentials-reloaded-1440.png and screenshots/people-credentials-reloaded-390.png. Both were inspected: the active monitoring key has its selected monitors and Last use, the CI key remains listed, and one-time credentials are absent. Assertions run at the existing desktop width; the phone image is proof only.

## Plan and validation

The complete working plan is PLAN.md. Work proceeded by preserving the published head, tracing the limiter and console initialization, reproducing the original public-door failure, extending the existing readiness path, running the affected journey and typecheck, merging fresh main without rewriting published history, refreshing the source lock last, checking every candidate identity/trailer, and pushing only the named product branch. The remaining publication steps inspect exact-SHA Verify and publish this report packet separately from product custody.

- Actual app setup and build completed successfully with the repository pin; Node 22.20.0 ran the browser journeys.
- Original main helper through operator-security: FAIL, reproducible asset 429 then credential-row timeout.
- Saved published helper through operator-security: PASS, full owner-to-runner lifecycle.
- Candidate typecheck: PASS, both application and runner TypeScript configurations; typecheck-candidate.log.
- Source lock: regenerated last; check returned ok=true. Only the security helper's file entry changed; lock-receipt.json.
- Candidate journey result and exact product/CI provenance are recorded in RECEIPT.json and the final receipt section below.

## Counts and clause status

Before and after: 37 done, 58 partial, 20 missing, 115 total clauses. The affected existing operator-security journey remains one journey; permanent test registration delta is zero. No clause text, Status, Gap, Evidence, acceptance point, generated view, or summary count changed. ACCESS-003 and READAPI-001 retain their existing partial judgments and gaps. No new feature-completion or landing claim is made.

CLAIM ACCESS-003 PARTIAL points=none tests=tests/security-controls-browser-support.mjs#proveSecurityControls
CLAIM READAPI-001 PARTIAL points=none tests=tests/security-controls-browser-support.mjs#proveSecurityControls

## Publication boundaries

Only tests/security-controls-browser-support.mjs and sources.lock.json belong to the forward product commit. Fleet evidence remains outside the product tree. The cloud cannot run the Mac's publication scan or land main; the fleet retains those gates. Evidence publication conveys reports only and is separate from product READY/PUSHED custody. No PR is required by this repository's contributor rules; no PR was created.

## Current product receipt

Product head: 8e0b5af47df91cf6d05eabb6eba587329b4056a7. The fleet hook was active; every candidate author, committer, and trailer passed inspection. Fresh origin/main was already contained and unchanged. The real two-file commit was pushed successfully on the first attempt at 2026-11-13T11:56:43Z. The product checkout was clean. Candidate operator-security completed successfully at 2026-11-13T11:55:18Z, after proving the persisted credential response and rendered row on both reload and restart. Exact-SHA Verify 43421074831 was still in progress at the first permitted poll, 2026-11-13T12:02:21Z. Six GitHub invocations used so far, with no rerun or dispatch. The final CI observation, if available, appears below and in RECEIPT.json.

Committed exact-SHA local timing proof also passed: `cloud_run timeout 300 node tests/operator-security.mjs` ran with HEAD 8e0b5af47df91cf6d05eabb6eba587329b4056a7 from 2026-11-13T12:05:38Z to 2026-11-13T12:08:17Z, exit 0. This uses the normal existing entrypoint without the external response observer. `exact-sha-journey.log` is its actual receipt. The selected 1440/390 images were refreshed by this committed-head run and inspected again. Verify remained in progress at 2026-11-13T12:07:44Z; seven GitHub invocations used.

## Final result

Exact-SHA Verify **43421074831** completed **successfully** for **8e0b5af47df91cf6d05eabb6eba587329b4056a7**, observed through REST at 2026-11-13T12:13:02Z. No generator exception was needed. Eight GitHub invocations were used, with no rerun or dispatch. The full local journey passed on that committed head; typecheck, source-lock freshness, identity/trailer inspection, and diff hygiene passed. Both selected browser widths were inspected. There are no remaining blockers for this scoped candidate. The historical push-6 cancellation did not recur as a red check on this candidate. PR: none. Clause status changes: none; counts remain 37 done / 58 partial / 20 missing, total 115.

READY branch=cloud/sd-uptime-security-wait-1-pc1 head=8e0b5af47df91cf6d05eabb6eba587329b4056a7
