# Implementation claims

These claims track the daily-use clauses built in the 18 October 2026 round.
The complete target and current implementation status remain in CONTRACT.md.

| Clause | Status | Proven behavior | Evidence |
| --- | --- | --- | --- |
| ROUTING-002 | done | Per-contact delays, bounded or unlimited recurring reminders, recovery and acknowledgement preferences, durable restart-safe schedules and reviewed saved-source conversion. Channels and human receipt follow their separate contracts. | `tests/contact-schedules.mjs`; `tests/contact-schedules-browser.mjs`; `docs/evidence/contracts/contact-schedules/` |
