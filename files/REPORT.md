# sd-uptime-loopback-churn-1 diagnostic return

Signed: Run Edit Run fleet, 2026-11-15T08:32:37.986544+00:00.

## Outcome and custody

BLOCKED: the reported sustained approximately 500 short loopback connections/second was not reproduced in an ordinary isolated Linux instance. The original port-exhaustion root cause is unproven. No product fix, connection-policy workaround or acceptance promotion is claimed.

Repository: just-every/run-uptime. Local branch: cloud/sd-uptime-loopback-churn-1. Product HEAD: fef01b15e0205f1c53c4e362a3729afc66a0b20b, unchanged from public main and the shipped prerequisite. Product commits: 0. Product branch pushed: no. PR: none. Candidate Verify runs: none; GitHub REST calls: 0. This report-only evidence publication is separate from product custody. No READY or PUSHED product claim is made.

## Full plan and execution

1. Configure fleet identity, refresh its launcher, install the decrypted-bundle Git helper and commit hooks, shallow/blobless clone only the declared repository, create the named branch from main. Completed.
2. Read launcher/repository rules, contract and operating guidance; inspect the native runner, due-slot claim, dev runtime/ticker and HTTP transports before editing. Completed. DIRECTION.md and SEED-PLAYBOOK.md were not present in the checkout or supplied inline; no new ruling or scope was inferred from them. The inline RULES.md was used.
3. Start one fresh isolated installation through supported `npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive` and `rer dev --detach` through cloud_run. Complete its native dev browser handoff with headless Chromium at 1440. Completed. No production/provider deployment or trial targets were used.
4. Create two synthetic local HTTP monitors at 6 seconds and 11 seconds, plus an initially paused 7-second monitor, through authenticated public APIs. Measure live histories, attributable TCP TIME_WAIT and connect syscalls across multiple configured intervals before any source edit. Completed: 91.435-second first observation plus a console observation and 182.697-second verified pause/edit/resume scenario.
5. Attribute sockets to exact started PIDs and ports, and compare console browser requests with native control/probe connections. Completed with connect-only strace and /proc TCP sampling; no request payload, cookie, authentication key or environment dump was recorded.
6. Change code only after a measured source is established. The severe failing case did not reproduce, so this step was withheld. No installed tooling was patched. The observed per-probe one-shot transports were not replaced speculatively.
7. Prove the same case after a remedy, run touched checks/typecheck, regenerate source lock last, commit/push and inspect exact-SHA Verify. No remedy or product candidate exists; therefore an after-fix comparison, source-lock rewrite, product commit, branch push, PR and candidate CI are not applicable. Existing source integrity check passed. No full local suite was run.
8. Close browsers and stop only recorded owned processes, retain the complete non-secret packet, publish only the evidence ref and relay findings to sd/FV. Runtime cleanup completed; all six recorded product/runtime PIDs exited and all isolated listeners closed. Evidence publication is reported separately in the terminal return.

## What the running instance did

The first 91.435-second window recorded 12 passing observations at 6 seconds and 7 passing observations at 11 seconds. Minimum respective start gaps were 6.803 and 12.156 seconds. The initially paused monitor recorded zero slots and observations.

The final verified session observed the same installation, not a reset or disabled checker. It recorded public API pause at 2026-11-15T08:26:30.706000+00:00, then resume with a new 15-second interval at 2026-11-15T08:27:06.233000+00:00. The pause lasted 35.527 seconds; no observation started during the pause (the analysis also explicitly checks after a 5-second in-flight grace). There were five completed observations after resume; minimum same-revision start spacing was 16.055 seconds. The unchanged 11-second monitor kept checking throughout. All 100 completed observations in the final history read passed: 58 on the edited monitor, 42 on its peer. One newly claimed slot was still in flight at the final read. The initially paused monitor remained at zero. Histories include observations before the final measurement window, because they preserve the same installation's earlier observations.

The final browser generated 203 requests after its initial 10-second page warmup over 182.697 seconds: 1.111 requests/second. Most were the console's five owner reads every five seconds. Its 743 total browser requests include initial module/navigation and native sign-in traffic; that total must not be represented as a steady rate.

| Measurement | First window | Console window |
| --- | ---: | ---: |
| Connect-only trace length | 30 seconds | 60 seconds |
| New loopback connect attempts from four owned processes | 118 | 294 |
| Attempts/second | 3.933 | 4.900 |
| Maximum in a UTC one-second bucket | 7 | 14 |
| Vite PID 2034 to workerd port 38823 | 101 | 240 |
| Managed proxy PID 1835 to Vite port 46809 | 9 | 38 |
| Native runner PID 2102 to synthetic port 46513 | 6 | 13 |
| Native runner PID 2102 to control port 8787 | 2 | 3 |

These are connect attempts, not an assertion that every syscall completed successfully or one request equals one connection. DNS and public-canary connections were excluded from loopback rates. Thread records and non-IPv4/local connect calls remain in the raw trace for inspection. Browser-to-server connections are reflected in the TCP sampler; the syscall trace intentionally attaches the four server/runner processes, not Chromium.

TIME_WAIT was counted only when either endpoint matched one of this instance's seven listener ports. It was not machine-global. The first socket window peaked at 459 while the initial browser/module burst was still within Linux's TIME_WAIT lifetime, then ranged 226–243 after 60 seconds. Opening the monitor console again caused a burst peaking at 734; a later verified browser session peaked at 735. During that verified session, samples after the burst fell to roughly 314–341 and eventually 281. A final steady-socket observation (including the console's closure while native checks continued) ranged 182–334, ending at 184. These values establish neither a strict always-below-300 ceiling nor the requested sustained 500/sec reproduction. No physical-Mac or fleet-global socket claim is made. Cold browser module bursts must be separated from warmed continuous traffic.

## Attribution and source findings

- Native scheduler: `src/domain/attempts.server.ts` selects enabled due monitors, advances next_due by at least one configured interval and fences deliveries/revisions. The observed public histories respect the configured intervals and pause/resume. No scheduling defect was established.
- Native poll loops: `runners/src/runner.mjs` waits pollMs (default 1000) after its cycle; `runners/src/discovery-loop.mjs` waits when idle. No empty tight loop was found. The runner's two control connections, local source ports 48976 and 48986, were visible early and still present in `reuse-snapshot.json` many minutes later. Its 2–3 new control connects across the trace windows are consistent with reuse; this is socket evidence, not a wire-level count of every control request.
- Synthetic and pinned target probe transports: `runners/src/probes.mjs` syntheticHttp and `runners/src/public-http-request.mjs` requestOnce create non-keepalive agents, then destroy them on request close. This does create one short connection per synthetic target probe (6 in 30 seconds and 13 in 60 seconds here), but cannot explain hundreds/second in this measured workload. Public target transport also preserves DNS pinning, TLS identity and bounded response cleanup; it was left intact.
- Dev ticker: the installed pinned rer's `cli/scheduled.mjs:54-86` schedules declared cron triggers at minute boundaries and prevents concurrent runs of the same cron. It did not show a high-rate ticker here.
- Most observed new connections originated in Vite/Miniflare PID 2034 and went to workerd PID 2080 on port 38823. The corresponding installed dependency request path is `@cloudflare/vite-plugin/dist/index.mjs:89891-89935` dispatching to Miniflare, then `miniflare/dist/src/index.js:124770` dispatchFetch and its runtime pool creation at 124534. This locates the measured traffic, not a proven source of the unobserved 500/sec defect. The permanent internal workerd connection and bounded rer upstream pool were also present. The exact JS call/closure source of each short-lived internal connection is not established by connect-only strace.

Versions: rer 0.2.113, Cloudflare Vite plugin 1.62.2, Miniflare 5.20260926.1-alpha, Wrangler 4.144.0, Playwright 1.64.1. Application/proxy/runner used rer's managed Node 22.20.0; the separate measurement driver used the VM's Node 24.19.0. Full source hashes are in source-provenance.json.

No real trial monitor targets were contacted. Synthetic monitor URLs were the owned local fixture. The ordinary product policy supplied its default independent external canary, https://example.org/, on enabled checks; it was not replaced with a fake or silently suppressed. The paused monitor had no canary requests. No evidence here establishes real customer target behavior or external provider acceptance.

## Checks, counts and clauses

Actual checks are in checks-receipt.json. Configured interval and pause/resume assertions passed. Real local TOTP enrollment/verification through the public MFA endpoints passed. The earlier new-session pause attempt returned the normal HTTP 403 without a fresh second factor; its refusal and repeat are preserved. Source integrity (`node scripts/edition-authoring/cli.mjs check`) passed. Product tree remained clean. No source edits mean no typecheck or full suite was needed or run.

Before/after product changes: 0/0 commits; 0 added, removed or modified registered tests. No contract text, Status, Gap, Evidence, generated views, lock, release metadata, rer pin, shared Base or homepage changes. After-fix metrics: not available, because no remedy was made. Repeated pre-change measurements must not be presented as a fixed result.

CLAIM SCHEDULE-001 PARTIAL points=none tests=packet/analyze-runtime.py#configured intervals and pause/resume
DEFAULT SCHEDULE-001: Preserve existing interval, pause, TLS, retry and import behavior; make no speculative transport or scheduler change without the severe failing case.
GAP SCHEDULE-001: Diagnostic one-off source-head proof only; the full clause's retries, manual cadence and confirmation obligations were not re-proved and no new candidate was pushed. Clause status stays unchanged.

SCHEDULE-002 scale and managed-location timing remain untested. No clause status is promoted or demoted.

## Blocker and handoff

FV needs a bounded, connect-only per-PID trace and listener ownership from an affected live Mac instance, together with its actual loaded rer/Vite/Miniflare versions and whether repeated browser reload/HMR is occurring. This task did not inspect, stop or modify any existing live installation. The clean pinned Linux checkout does not reproduce the diagnosis, and attributing its low-rate internal dev traffic to the original failure would overstate the evidence. A product patch cannot honestly be qualified against an absent failing case. Return the packet to sd/FV/strategy for that comparison; do not mark READY or land an empty product candidate.

Packet includes actual runtime/history/browser-request receipts, raw connect-only traces, exact-port socket series, source/package hashes, analysis and one-off probe sources, the handled 403 receipt, successful diagnostic checks and owned-process cleanup receipt. No secrets, private gate material, browser state, credentials or symlinks were selected.
