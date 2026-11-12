# sd-uptime-c-f164 results

BLOCKED product branch `cloud/sd-uptime-c-f164`, head `a6a189444625c60b680a1805d354a61d13cf1675`, based on main `ed5429192d18503c4c8caa8d797d82ffdcc78f54`. The failing journey and actual non-secret receipts are preserved. This is a diagnostic save with `[skip ci]`, not a landing candidate or a READY claim. No PR was opened. No production or shared helper was changed.

## Scope and disposition

NETWORK-001 remains PARTIAL → PARTIAL. Counts are unchanged: 37 DONE, 58 PARTIAL, 20 MISSING, 115 total clauses. The existing 47 journey commands remain 47. There is no test-budget.json in this checkout, and no new standalone journey registration was added. The new differential flow is mounted once from `tests/tls-auth.mjs`; every existing assertion and invocation remains intact. CONTRACT.md and both generated views are byte-for-byte unchanged from main. The only product changes are the new dedicated support and routing files, that mount, and the regenerated source lock.

The selected point was acceptance 1's redirect-hop exhaustion cell only. The full acceptance point remains unproved. The short chain reaches Healthy through real signed native intake. The receiver then observes the cycle, and the actual production runner signs redirect target failure before the saved timeout. Native intake refuses that result. Consequently accepted failing owner history, traffic quiescence through Worker restart, and scheduled recovery are not reached and are NOT claimed.

## Actual public-door observations

The fixture independently creates a CA and a server certificate with native OpenSSL chain, server purpose and hostname verification. Node receives that CA at process startup. TLS verification stays on; the edge changes only DNS answers and numeric socket routing. The isolated emitted Worker is fully migrated, its owner bootstraps and enrolls a real second factor, and a real production runner enrolls through its signed public control door. The owner creates an enabled ordinary public HTTPS monitor with an immutable revision, no request credential or TLS trust exception, retries disabled, one assigned probe and a separately trusted passing canary.

The allowed receiver chain is `/entry` → `/healthy` → HTTP 200. Two independently observed TCP connections, two completed TLS handshakes and two HTTP requests establish the positive control; signed intake returns 200 and the owner reads Healthy with Complete coverage. The definition and revision are retained.

With the same definition and revision, only receiver routing changes to `/entry` → `/cycle-a` → `/cycle-b` → `/cycle-a` and onward. The focused diagnostic observes six actual TLS connections and ordered cycle requests. Its production-signed observation is `target_failure`, with only `redirect` failing, no HTTP status and a passing HTTP 200 canary. The duration is 60 ms against the owner's saved 3000 ms timeout. The numeric production hop bound is neither read by the journey nor configured, asserted as a constant, or changed. Six is an observed receipt count, not an expected literal in the test.

The native Worker returns HTTP 400 with `{"error":"Invalid failure snapshot evidence"}`. The actual signed snapshot retains status 302 while its observation has no HTTP status. `src/domain/evidence.server.ts:197` refuses that mismatch for redirect evidence. `runners/src/probes.mjs:64` constructs the error snapshot from the capture that still carries the final redirect response status; `runners/src/public-http.mjs:88` had constructed a null-status error snapshot, but that snapshot is not used by this catch path. No native validator is relaxed and no capture is rewritten by the test.

The brief explicitly requires unchanged production and shared helpers. Correcting the runner's statusless-error snapshot construction would change that protected scope. Disabling snapshots, mutating the signed payload in the bridge, accepting the 400, dropping the mount, or weakening the expected outcome would evade the named proof; none was done. The supplied f143 null-status requirement remains owed. Route this prerequisite to a scoped production repair, then rerun this unchanged journey to exercise the remaining restart and recovery assertions.

## Checks and provenance

- Setup, explicit build, typecheck and `rer check --profile first-party`: PASS, exit 0.
- `node src/base/contract-docs.mjs write` then `check`: PASS, exit 0, zero prose errors or warnings. Both generated views restored whole from main; neither committed.
- `node scripts/edition-authoring/cli.mjs lock` then `check`, plus `check` after fetching main and rebasing: PASS, exit 0. Source lock regenerated after the final source edit. No migrations changed; ledger check not applicable.
- Initial full registered `node tests/tls-auth.mjs`: FAIL, exit 1 at cycle signed completion, after existing trust, authentication, keyword and hostname flows ran. The registered command reproduced on the first published SHA `397ce9b0bcdf546803c7e1dee267dc44bd0fc589`. Its only later source change is the unreached quiet-window comparison. A focused file-based diagnostic is also run on the final saved head, retaining its actual receiver and signed payload records.
- A preliminary ad hoc `node --input-type=module -e ...` diagnostic stalled during Miniflare initialization. It was stopped by its own known process IDs; no proof rests on it. The normal file-based command reproduced promptly. No GitHub workflow repair was attempted.
- `git diff --check`, empty staged CONTRACT.md diff, empty production and shared-helper diff, exact unchanged generated views, and all candidate author and committer identities and absent trailers: PASS. Two fleet-authored commits are pushed successfully through the cloud guard, each on its first attempt. The second corrects only the new journey’s future quiet-window comparison: an open incident’s calculated elapsed duration grows while all durable incident facts must remain unchanged. No force push or main write.

Main's exact-head successful Verify runs include 43226883415 and 43224554437; Run site 43224554366 is successful on `ed5429192d18503c4c8caa8d797d82ffdcc78f54`. These are main evidence only. REST discovery for `a6a189444625c60b680a1805d354a61d13cf1675` returned zero workflow runs, consistent with this diagnostic save's intentional CI skip marker. No candidate Verify is claimed, and no workflow was dispatched for known failing work. GitHub budget used: three calls, comprising main and the two distinct saved heads. No run was polled. Publication scanning, generated-view landing commits and Run site on any eventual candidate remain guarded-lander duties; no scan-complete or landed claim is made.

MECHANICAL lock=`node scripts/edition-authoring/cli.mjs lock` and `check` exit=0; views=`node src/base/contract-docs.mjs write` and `check` exit=0; ledger=none exit=0 (no migrations changed).

PROBE NETWORK-001 acceptance-1: owner-created unchanged public HTTPS monitor, short redirect then cycle on the actual signed production runner → native Healthy for short chain, then signed redirect target failure with passing canary but HTTP 400 Invalid failure snapshot evidence at intake. Persisted failure and recovery remain unproved.

The retained assertion locations are `tests/network-redirect-cycle-support.mjs`: certificate generation and independent verification, lines 17–31; actual receiver and signed native bridge, lines 36–60; enrolled production child and owner creation, lines 71–85; scheduled immutable owner history and independent counts, lines 90–109; exhaustion without a pinned numeric bound, lines 110–123; unchanged revisions and earlier observations, lines 128–132; quiet and persisted restart assertions, lines 137–153; ordinary due recovery and matching incident, lines 155–159. Lines after the native intake refusal are registered but unreached.

## Acceptance and rider register

| Item | Result | Evidence or limit |
| --- | --- | --- |
| NETWORK-001 acceptance 1, selected redirect-cycle cell | FAIL | `tests/network-redirect-cycle-support.mjs` proveNetworkRedirectCycle: allowed chain passes; signed cycle result is refused by native intake. Restart quiescence and recovery remain unreached. Other transport cells remain outside this round. |
| Rider 1 | FAIL | An acceptance outcome remains unreached: accepted bounded cycle failure, restart persistence and scheduled recovery. |
| Rider 2 | PARTIAL | Genuine positive receiver and native owner control run; cycle attempts the dangerous path, but native completion is refused. Assertions remain strict. |
| Rider 3 | NOT ESTABLISHED | No exact-head Verify for a deliberately blocked CI-skipping save. |
| Rider 4 | EXACT-HEAD DIAGNOSTIC | Registered TLS command reproduced on the first published head; the final focused public-door run is bound to the final saved head in custody.json. This is failure evidence, not successful acceptance. |
| Rider 5 | INSPECTED | No receiving clause or inherited duty changed; complete original requirements preserved. |
| Rider 6 | MECHANICAL PASS, CLAUSE PARTIAL | Generator write and check pass; main judgments and generated views restored unchanged. No false Evidence or Gap edit. |
| Rider 7 | PASS | No acceptance sentence, clause id or ruling changed. |
| Rider 8 | UNCHANGED | Owner bootstrap and real MFA exercised; no product authority implementation changed. Existing refusal and erasure tests retained; not newly requalified. |
| Rider 9 | PASS BOUNDARY | Only controlled local native HTTPS behavior is reported; hosted, managed-location, provider and account qualification remain held. |
| Rider 10 | NOT APPLICABLE | No new custody, consent, spending or authority policy was adopted. |
| Rider 11 | NOT MET | Branch-only diagnostic save; main differs, candidate Verify absent, no publication scan or candidate Run site. No DONE or landing claim. |

Pre-READY assessment: no READY is offered because the selected runtime path fails. No existing assertions were removed, narrowed or conditionalized. No screens changed, so no new screenshot or viewport proof is applicable. Revocation, erasure and replay behavior and all protected files remain unchanged, rather than newly claimed. Source lock and generated-source checks pass. Scan and exact-candidate Verify are not established.

## Remaining work and plan return

The full plan is retained in PLAN.md. Completed steps: scope and source mapping; dedicated registered differential helper and focused edge; independently verified HTTPS, actual signed allowed and refused cycle observations; mechanical checks; first real commit and guarded branch push; diagnostic receipt preservation. The selected acceptance cell is blocked by the protected snapshot-construction prerequisite, and its restart and recovery assertions remain ready to run after repair. No other clause is taken because the extract names no next unblocked clause touching these files, and its broader obligations remain held.

Plan row return: NETWORK-001 remains PARTIAL; record the native intake blocker and the new registered proof without promoting any clause. No plan or inbox file was read or written in the VM. All pending transport qualification remains explicit: mixed-DNS qualification, rebinding, complete redirect-chain re-resolution, forbidden address families, exact-origin credentials, other timeout, body and encoding bounds, broader hostname and credential cases and zero-connection qualification of rejected destinations. Existing f143, f150, f153, f157 and f160 campaigns and every console, hosted, managed-location, account, sibling and Platform hold are unchanged.

CLAIM NETWORK-001 PARTIAL points=none tests=tests/network-redirect-cycle-support.mjs#proveNetworkRedirectCycle

GAP NETWORK-001: Signed cycle failure is refused with HTTP 400 because a statusless redirect observation carries snapshot status 302; the permitted scope prohibits changing the production snapshot helper. Accepted failure, persisted restart quiescence and ordinary due recovery remain unproved, with all broader held obligations unchanged.

## Final exact-head receipt

On `a6a189444625c60b680a1805d354a61d13cf1675`, the focused file command invokes the same registered proveNetworkRedirectCycle helper with unchanged production code and emitted Worker. Exit 1 reproduces native intake HTTP 400 Invalid failure snapshot evidence. The actual signed cycle duration is 45 ms, category redirect, outcome target_failure, no observation HTTP status, snapshot status 302 and passing canary. Receiver totals across positive control and cycle: 8 TCP connections, 8 completed TLS handshakes, 8 ordered requests. Final typecheck and source-lock check both pass with exit 0. `redirect-final-sha.json`, `final-cycle.log` and `custody.json` retain the actual exact-head evidence. No CI log download or repair round was attempted.

BLOCKED branch=cloud/sd-uptime-c-f164 head=a6a189444625c60b680a1805d354a61d13cf1675 reason=native-signed-redirect-intake-refuses-statusless-observation-with-302-snapshot; required-production-helper-repair-prohibited-by-brief
