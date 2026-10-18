# Implementation claims

These claims track the daily-use clauses built in the 18 October 2026 round.
The complete target and current implementation status remain in CONTRACT.md.

| Clause | Status | Proven behavior | Evidence |
| --- | --- | --- | --- |
| ROUTING-002 | done | Per-contact delays, bounded or unlimited recurring reminders, recovery and acknowledgement preferences, durable restart-safe schedules and reviewed saved-source conversion. Channels and human receipt follow their separate contracts. | `tests/contact-schedules.mjs`; `tests/contact-schedules-browser.mjs`; `docs/evidence/contracts/contact-schedules/` |
| SLOW-001 | partial | Real scheduled consecutive/percentile response windows open separate Slow notices with their own contact schedules and acknowledgement; recovery and report time preserve availability. Pingdom thresholds and supported static Site24x7 rules map without guessing. Better Stack and unsupported Site24x7 strategy mappings remain open. | `tests/slow-responses.mjs`; `tests/slow-import.mjs`; `docs/evidence/contracts/slow-responses/` |
| UDP-001 | done | Pinned public UDP request/response checks with bounded bytes and traffic, immutable server-validated assertions, honest timeout/runner failures, scheduled recovery and inactive portability. Requires a private Node runner. | `tests/udp-monitors.mjs`; `tests/udp-browser.mjs`; `docs/evidence/contracts/udp/` |
