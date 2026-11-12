# sd-uptime-f164-snapshot-fix-2

Repository: just-every/run-uptime
Product branch: cloud/sd-uptime-f164-snapshot-fix-2

## Diagnosis

The unchanged rebased head 1b1cb59f6a6eb7a5fecc390ef1fa5b7b92e9e079 reproduces the shard failure with `node tests/tls-auth.mjs` using Node 22.20.0 and emitted production output. Native signed completion returns HTTP 400, `Invalid failure snapshot evidence`. The actual before-receipt.json contains a target_failure observation with a single failed redirect check and no observation status, while its failure snapshot carries HTTP 302 from the last intermediate hop. Duration values agree. The receiver recorded six verified redirect-cycle TLS exchanges after the two-exchange healthy chain.

Comparing the supplied original repair 4e5d09c76ece555a9924833e10a371de036c6a0c, main 860e069a6e277a7f41bc8a34bc0934e005b01274 and the rebased tree shows that the relevant native validator, snapshot normalizer, HTTP transport and HTTP exchange modules have identical Git blobs across all three. The original repair's two-line redirect status reset is absent from the rebased probes.mjs, whose blob instead matches main. Thus this reproduced failure comes from the dropped production reset, rather than a newly changed intake rule. source-comparison.json and original-vs-rebased-probes.diff retain that comparison.

## Repair

Restore only the explanatory comment and `if(category==='redirect')capture.status=null;` immediately before the catch path constructs its failure snapshot. The refusal has no final HTTP result; the last hop's 302 must not become that result's snapshot status. The snapshot still retains bounded ordered redirect URLs, headers and timing. No validator, transport, test assertion or contract text is changed; no fallback or new permanent test is added. The existing receiver fixture now places a fixed 50 ms processing interval on each side of its recorded event, uniformly for short, cycle and restored routes. This keeps a genuine receiver-processing timestamp away from the exchange boundaries, where the production runner's Worker-clock calibration has midpoint-RTT uncertainty; it leaves every assertion, hop/connection count, timeout, quiet window and native route intact. The inherited helper and its existing mount are retained; only the receiver processing interval is adjusted. Merge current origin/main before the first push; the merge reports already up to date at 860e069a.

## Scope and custody

NETWORK-001 remains PARTIAL. Other clause judgments and all counts are unchanged: Published 14 done / 7 partial / 0 missing (21); target and push further 23 / 51 / 20 (94); all 37 / 58 / 20 (115). No contract or generated-view commit. The existing `tests/tls-auth.mjs#proveNetworkRedirectCycle` proves only bounded redirect-cycle exhaustion, native signed intake, ordinary incident/recovery, immutable history and quiet receiver/socket behavior across restart; it does not qualify the full network clause.

Plan: PLAN.md. Actual before and after journey receipts, logs, source comparison, malformed-evidence checks, typecheck, generator, source-lock and exact-SHA CI receipts accompany this report. Product and evidence publication are separate. The fleet's publication scan and landing remain on the Mac; this cloud does not publish main, a tag, an acceptance judgment, a readmission or a lane record.

## Local timing assertion observation

The first post-repair tls-auth run passed signed native intake (the existing completion-status assertion precedes the failure) and then failed the later receiver timestamp bound at tests/network-redirect-cycle-support.mjs:121. The complete log is retained as after-timing-attempt.log. An unchanged rerun also failed this bound and is retained as after-timing-retry.log. A receipt-only diagnostic (reverted before the final product) captured native intake 200, snapshot status null, duration 48 ms, and the first two raw receiver events 12 and 8 ms before the calibrated signed start. That diagnostic is after-diagnostic.json; no assertion or production clock changed. An initial diagnostic launched via node --input-type=module stalled during Miniflare startup and was terminated together with its owned esbuild/workerd children; after-diagnostic.log preserves it. The file-entry diagnostic completed and reproduced the bound failure (after-diagnostic-file.log).

The existing network-edge fixture was then given a uniform 100 ms processing interval with its recorded event at the midpoint. This retains the real receiver timestamp, every assertion, the same saved 3000 ms deadline and the same route table; it avoids using the edges of an effectively instantaneous exchange as cross-clock proof. Full final journey and same-fixture status-reset differential results follow below. No timing fudge is added to production, the validator or assertions.

## Final local results and product custody

Product head: d201128f7bdf90979efd0127eaaaa58224e072e0. Product push succeeded on its first attempt, using the named branch and fleet guard. No PR is required by the seed instructions, and none was opened. Every one of the seven candidate commits, including side parents, has fleet author and committer identities and no forbidden trailer.

- Original rebased `node tests/tls-auth.mjs`: exit 1, native signed completion HTTP 400, last-hop snapshot status 302.
- Final `node tests/tls-auth.mjs`: exit 0. Short/cycle/restored receiver counts are 2/6/2 verified TLS connections, handshakes and ordered HTTP requests. Signed outcomes and state are pass/Healthy, target_failure/Failing, pass/Healthy. Durations are 234/650/226 ms, all below the unchanged 3000 ms deadline. Two full 3000 ms quiet windows across persistent Worker restart show zero extra target/canary traffic, zero open target sockets, unchanged prior history and the same incident. Ordinary due recovery closes that incident.
- With the final receiver fixture held identical, temporarily removing only the reset again yields native HTTP 400 and snapshot status 302 (before-delayed-receipt.json). Restore the exact production bytes immediately afterward; no temporary diagnostic is committed.
- Direct production-validator replay accepts the actual repaired observation and rejects eight malformed/pre-repair cases: last-hop status on a statusless redirect, duration mismatch, undeclared field, unsupported version, oversized body, success carrying failure snapshot, and fabricated observation response status. The initial temporary harness used observation start as due time and rejected its earlier canary; it was corrected to use the actual retained slot due_at. Both the initial harness log and corrected receipt are retained. The production validator is unchanged.
- Pinned build, final application/runner typecheck, syntax checks, contract write/check and final source lock/check pass. Contract generation writes zero documents, with zero prose errors/warnings. Generated views are restored whole from main; final source lock changes only the probe and existing helper entries.

No clause status change or count change. NETWORK-001 remains PARTIAL. The only new claim points are bounded redirect-cycle exhaustion, retained statusless signed failure, no continued socket/request activity across restart, immutable earlier evidence, and ordinary due recovery, via tests/tls-auth.mjs#proveNetworkRedirectCycle.

Exact-SHA CI and evidence custody are recorded below once complete.

## Exact-SHA CI result

Completed UTC: 2026-11-12T17:52:50Z. Verify run 43271226325 completed/success on exact product head d201128f7bdf90979efd0127eaaaa58224e072e0: https://github.com/just-every/run-uptime/actions/runs/43271226325 . Five GitHub calls were used in total, including the single archived log read for the original failed job and discovery; candidate polls were separated by 301 seconds. No rerun or second product push was needed.

The remote product branch advertises the same full SHA, and the product checkout is clean. Candidate state is READY. No remaining blocker. The fleet owns the publication scan and landing; no main, default-branch, tag, PR, lane record or acceptance judgment was written here.

The full relevant packet is selected explicitly for separate report-only publication at refs/heads/evidence/sd-uptime-f164-snapshot-fix-2. That evidence transfer does not promote a clause or land the product. The terminal EVIDENCE line supplies its exact ref/head; the fleet independently verifies its manifest and file hashes. The disposable product clone will be removed after successful evidence publication and verification; the complete packet remains under the task work directory.

CLAIM NETWORK-001 PARTIAL points="bounded redirect-cycle exhaustion; signed statusless failure intake; quiet restart; immutable history; ordinary due recovery" tests=tests/tls-auth.mjs#proveNetworkRedirectCycle
