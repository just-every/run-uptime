<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Uptime homepage claims

A claim is done when every clause behind it is done, missing when every one is missing, and partial otherwise.

| # | Claim | Clauses | Status |
| --- | --- | --- | --- |
| 1 | Uptime checks your sites and APIs on schedule | `HTTP-001` partial; `SCHEDULE-001` partial | partial |
| 2 | It tells you only when a failure is confirmed | `STATE-001` partial; `SCHEDULE-001` partial | partial |
| 3 | It never calls a missing check healthy: a result that never arrives or expires is marked Unknown, so a quiet runner can't pass for a healthy site | `STATE-001` partial; `PRESENCE-001` partial | partial |
| 4 | Every green dot is a check that actually ran and passed | `EVIDENCE-001` partial; `STATE-001` partial | partial |
| 5 | You choose how many failed checks in a row open an incident and how many passes close it | `SCHEDULE-001` partial; `STATE-001` partial | partial |
| 6 | Each incident keeps the evidence that justified it: the status, timing and the rule that failed on every check | `EVIDENCE-001` partial; `HTTP-001` partial | partial |
| 7 | HTTP and HTTPS checks can assert on status, body text, headers, JSON values and response time | `HTTP-001` partial; `API-001` done | partial |
| 8 | Keyword checks look for the words a page should contain | `HTTP-001` partial; `API-001` done | partial |
| 9 | Heartbeats notice when a cron job or backup stops reporting in | `HEARTBEAT-001` partial; `HEARTBEAT-002` partial | partial |
| 10 | Send incidents and recoveries by email, to a Slack incoming webhook, or to a signed JSON webhook, and every enabled destination covers every monitor in your installation | `NOTIFY-001` partial; `DELIVERY-001` partial | partial |
| 11 | Run Uptime on your own computer: open-source monitoring you run yourself | `PUBLIC-001` partial; `STARTUP-001` partial | partial |
| 12 | A small private runner checks your targets from a machine you choose | `PRIVATE-001` done; `AUTHORITY-001` partial | partial |
| 13 | Export monitors, evidence and delivery history whenever you like | `ARCHIVE-001` partial | partial |
| 14 | Maintenance windows pause alerting while you work on a service | `MAINT-001` partial | partial |
| 15 | Manual checks run now without opening or closing an incident | `STATE-001` partial; `SCHEDULE-001` partial | partial |
| 16 | Each heartbeat uses its own token and increasing sequence numbers | `HEARTBEAT-001` partial | partial |
| 17 | Every DNS answer and redirect is validated, then the connection is pinned | `NETWORK-001` done | done |
| 18 | The Worker accepts only results signed by your runner | `AUTHORITY-001` partial; `EVIDENCE-001` partial | partial |
| 19 | Restored monitors start paused and imported alerts never send | `ARCHIVE-001` partial | partial |
| 20 | 100% free, open source (MIT licensed) alternative to Pingdom, UptimeRobot and Better Stack | `PUBLIC-001` partial; `MIGRATE-001` partial; `MIGRATE-002` partial; `MIGRATE-003` partial | partial |
| 21 | What it doesn't do (yet): no ping or browser checks, no SMS or on-call paging, and one runner is one network vantage | `BOUNDARY-001` partial | partial |

Claims: 21; 1 done, 20 partial, 0 missing.
