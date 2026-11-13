# Scope of the timestamp assertion

Read-only source observation; this is not a reproduced cause or a repair proposal.

The target HTTPS receiver in tests/network-redirect-cycle-support.mjs records `row.at` with its parent Node process's `Date.now()`, after a 50 ms delay. It delays a further 50 ms before replying. The signed runner child performs HTTP work and records its attempt's start/completion in runners/src/probes.mjs. In runners/src/runner.mjs, the claim exchange is measured with local send/receive times, and `clock.observe(sentAt, receivedAt, answer.now)` calibrates the runner to the Worker's time. Before submission, `clock.align(evidence, {dueAt})` shifts the attempt's timestamps. The support helper then compares receiver-local wall time directly to those signed, calibrated observation endpoints.

runners/src/clock.mjs computes offset = round(workerNow - (sentAt + receivedAt) / 2), retaining its quickest recent exchange. Alignment shifts by max(offset, dueAt - evidence.startedAt), preserving measured duration. A comment in the receiver describes its delays as allowing for midpoint calibration uncertainty. The source does not establish an absolute 50 ms bound on that uncertainty under all scheduling/exchange conditions.

These mechanics explain what measurements a future reproduction should retain: actual failing receiver row, signed observation endpoints, the claim exchange's measured send/receive/Worker time, and the resulting applied shift. Neither successful local receipt includes the original failed values, and no failing-row values could be read from the original job archive during the active retry. Thus this source observation cannot identify whether the original failure was caused by calibration, scheduling, a different timing event, test assumptions or a product defect.

The compared support, routing, runner clock, runner loop and HTTP probe files are byte-identical on failed head e6b5aab6aeaa68f6b6317e1701f157e0405961ca and main 954353ad135f144d54f8e37013d6341a19a98e16; their hashes are in source-comparison.json. No alternate assertion, tolerance increase, code edit or new test was introduced.
