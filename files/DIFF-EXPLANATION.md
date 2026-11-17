# Candidate versus prior round

Main: 6c223b6fd8982b8ffa70fe9e2b129e898637a4c8

Prior: b41d62102f8f12cfc9724305267b67a080cccae7

Every current difference from the prior round is in a file changed by newer main, except: none. Source-lock differences are regenerated from the combined source. The main file additions, importer corpus and field reports remain inherited whole.

Overlapping files:

- public/app.js
- public/assets/access-member-controls.js
- public/assets/alert-teams.js
- public/assets/security-controls.js
- sources.lock.json
- src/domain/control.server.ts
- src/domain/monitoring-watch.server.ts
- src/server.dev.ts
- src/server.ts
- tests/access-member-controls-browser-support.mjs

Resolved overlaps:

- Alert teams: retain main management restrictions, responder route, membership filtering and safe failure messages; isolate personal recipient markup for destination refresh; account email is shown to its own account only, with responder-safe guidance.
- Security controls: retain main last-owner refusal, second-factor action explanation and recovery code copy/download; add the round profile errors.
- Monitoring watch: keep the newer checker-stopped alert and assigned-runner query; address owner mail through the round native owner-account resolver.
- Member browser journey: keep main recovery copy/download and last-owner/removal-confirmation assertions; scope the owner row disclosure selector to its direct summary.
- Other automatically merged files retain main identity header, checker startup health and public import behavior. README practice-target parsing remains fail-closed.

The remote advanced during local validation by Hono patch commit 6c223b6fd8982b8ffa70fe9e2b129e898637a4c8. The unpublished candidate was advanced to that parent without a merge, retaining its package/lock pin and regenerating sources.lock.json last.
