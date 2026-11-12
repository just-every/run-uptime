# main-uptime-plain-states-1

Repository: just-every/run-uptime
Product branch: cloud/main-uptime-plain-states-1

## Plan

1. Reproduce the documented heartbeat import, development email acceptance and inactive archive restore through real owner routes on the emitted Worker with migrated D1. Use synthetic installation settings and network-edge fixtures only.
2. Present the job name in heartbeat summaries and move internal receipt paths into explicitly opened integration instructions. Translate job-run states without changing storage or heartbeat authority.
3. Use the existing mailSuppressed installation flag and per-delivery mail_development outcome to distinguish simulated email from provider acceptance. Keep recipient confirmation separate. Translate restored delivery states and explain why sending is held.
4. Inspect alert and monitor presentation modules for other state codes, digests and fallback reasons; translate those on the same screens.
5. Extend existing monitor and alert browser journeys at 1440 without adding registrations. Capture the changed screens at 1440 and 390, run touched journeys and typecheck, then synchronize main and regenerate/check the source lock last.
6. Commit with fleet identity and active repository-preserving hooks, audit all outgoing commits, push only the named cloud branch using the fleet guard, and inspect exact-SHA Verify through REST within the ten-call budget. Publish this actual packet through the isolated evidence ref. Keep evidence out of the product tree.

## Defaults and scope

No clause Status, Gap or Evidence edits. No DONE claim. No delivery, stored-state, heartbeat-door or unrelated stranger-finding changes. The inline polish essentials govern this wording round; no new screen or visual redesign is needed.

## Results

Implementation and local validation complete. Exact-SHA CI custody is recorded below and in CI-RECEIPT.json.

## Implementation results

- Heartbeat headings and expanded receipt summaries use the job name. Receipt paths are retained in explicitly opened Integration instructions and Job reporting instructions, and in copyable one-time commands. Routine job-run history says Started, Finished successfully or Failed, uses local time, and describes older settings as before your last edit. Numeric revision details remain in diagnostic history.
- Development email has a visible installation notice, simulated destination summaries, simulated delivery pills and reasons, and a simulated drill acknowledgment. All say that no email left the machine. The recorded mail_development outcome identifies an old simulation after mail configuration changes, so switching providers cannot relabel that history as a real send. Actual provider acceptance keeps its existing presentation. Recipient confirmation remains an independent fact.
- Restored delivery summaries say Imported, sending held, with a reason explaining that restore retains history without resending it. Storage and delivery authority are unchanged.
- Other raw presentation states found and translated: heartbeat start/success/fail; scheduled-drill provider accepted/rejected/uncertain/queued/sending/not_sent; schedule active/complete/cancelled; recipient pending/missing/confirmed; scheduled-run drill_queued/destination_disabled/credential_rotated/credential_expired/credential_unavailable; and fallback-chain outcome codes such as claim_expired, credential_unavailable and retry limits. Unknown delivery states receive an unavailable label instead of echoing an internal code.
- Alert route previews and monitor health labels already have human labels. Raw protocol evidence and diagnostic JSON remain available in their existing diagnostic disclosures; integration paths remain available where a job needs to copy them.
- No delivery or heartbeat policy was changed. The scheduled-drill read response now includes its existing recorded provider outcome code so the UI can distinguish actual development simulations without guessing from the installation's current configuration.

## Verification and counts

The baseline public-door reproduction confirmed all three findings: an internal 64-character digest in the heartbeat summary, no simulation notice despite mailSuppressed=true, and raw imported-inactive delivery states after restore. The extended journeys cover all three corrections, including actual development test, trigger and recovery deliveries and a real archive restore into an empty receiving installation. Before: 3 reproduced findings. After: 0 of those findings in the exercised screens.

Registered push journey commands: 47 before and 47 after; no registrations added and no cap increase requested. Existing journeys were extended. Contract counts remain 37 done, 58 partial and 20 missing before and after. No clause Status, Gap or Evidence cell, generated acceptance view or generated claims view was edited.

Local checks: rer build, typecheck, spec generation/check, contract document check, source-lock generation/check, signed-runner.mjs and alert-drill.mjs (including its scheduled-drill browser extension). Assertions added by this round run at 1440. Browser proof includes 1440 and 390. The existing scheduled-drill journey retains its existing 390 smoke assertions.

While extending the journeys, the practice target's canary needed its own always-up network edge, restarting the Worker required replacing its D1 handle, and the heartbeat history read moved to the journey's existing reload so it does not race one-time-key action reconciliation. These changes retain the original lifecycle assertions. A scheduled-state assertion was narrowed to the schedule paragraph so the ordinary phrase Consent active is not mistaken for a raw schedule code. A redundant standalone scheduled subjourney was stopped after the complete registered alert journey passed; it is not counted as a passing command.

CLAIM INTERFACE-001 PARTIAL points=1 tests=tests/heartbeat-console-support.mjs#proveHeartbeatConsole; tests/alert-presentation-support.mjs#proveAlertPresentation; tests/agent-drill-schedules-support.mjs#proveScheduledDrills
GAP INTERFACE-001: This round proves the requested wording and state presentation in the exercised flows; it makes no complete-clause or DONE claim.

## Product custody

Baseline: 7f07c2c0584c32be2d3c0a848bc23e827832825d.
Intermediate save: 027d039, published with skip ci.
Candidate: 6b94d940fe9d4519f98cafb236ebf35ac8e15eaf, published without a skip marker on cloud/main-uptime-plain-states-1.
Main was fetched and rebased before the initial save, and fetched again before the final candidate; the post-publication merge reported already up to date. Published history was not rewritten. Every outgoing author and committer was Run Edit Run fleet <fleet@runeditrun.com>, with no trailers. Both product pushes succeeded on their first guard attempt. No PR or default-branch push was made. The fleet owns the publication scan and landing on its own machine; this cloud run makes no landing claim.

Exact-SHA Verify: run 43151393663, https://github.com/just-every/run-uptime/actions/runs/43151393663. Final status is recorded in CI-RECEIPT.json. Evidence publication is separate from product readiness.
