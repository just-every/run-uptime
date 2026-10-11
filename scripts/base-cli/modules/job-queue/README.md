# Machine-wide development job queue

Dependency-free Node 22+ library and CLI for macOS and Linux. All repositories,
worktrees, terminals and Codex homes belonging to the same OS user coordinate in
`~/.rer/jobs`. This uses the OS home, independent of `CODEX_HOME` and the working
directory (even if a launcher overrides `HOME`). `RER_JOBS_DIR` selects another
shared local directory. Cross-account scheduling requires a common execution
identity with access to both state and private lifetime sockets; the default is
private to its owner. Use a local filesystem with atomic hard links and rename,
not a network filesystem. No daemon, install, service or provider is needed.

```sh
node /path/to/base/modules/job-queue/cli.mjs run --kind heavy --label 'app build' -- pnpm build
node /path/to/base/modules/job-queue/cli.mjs run --kind heavy --priority owner --label 'Owner browser review' -- pnpm exec playwright test --workers=2
node /path/to/base/modules/job-queue/cli.mjs status
node /path/to/base/modules/job-queue/cli.mjs status --json
node /path/to/base/modules/job-queue/cli.mjs drain --max-wait 30 --json
```

Run waits indefinitely unless `--max-wait SECONDS` is supplied. Expiry removes the
request, reports the admission reason, and exits **75** (`EX_TEMPFAIL`). Command
exit codes pass through, including 75; `--json` identifies queue expiry with
`timedOut: true`. SIGINT returns 130 and SIGTERM returns 143. Invalid invocation
or queue failure returns 64. Command arguments pass directly without shell
interpolation; use `sh -c` explicitly when a shell is required. Command stdout
and stderr are inherited. For `run --json`, the final control result is written
to stderr; `status` and `drain` JSON use stdout. `drain` waits for an empty queue,
reclaims dead leases and never cancels live work. It is useful in tests; ongoing
producers can keep it waiting indefinitely.

## Admission and the owner's machine rule

Heavy work starts only when its request heads the ordered queue, occupied heavy
slots are below the configured count, the one-minute OS load is at or below the
threshold, and OS free memory is strictly above the floor. Defaults:

| Setting in config.json | Default | Environment override |
| --- | --- | --- |
| slots | max(1, min(3, floor(CPUs / 4), floor(RAM / 8 GiB))) | RER_JOBS_SLOTS |
| loadThreshold | 36 | RER_JOBS_LOAD_THRESHOLD |
| minFreeMemoryBytes | 4 GiB | RER_JOBS_MIN_FREE_MEMORY_BYTES |
| pollMs | 3000 | RER_JOBS_POLL_MS |
| nice | 15 | RER_JOBS_NICE |
| killGraceMs | 1000 | RER_JOBS_KILL_GRACE_MS |

Put numeric settings in `$RER_JOBS_DIR/config.json` (or `~/.rer/jobs/config.json`).
Environment overrides take precedence. All clients should use the same policy;
central config avoids differing limits between sessions. Resource settings are
read when a client is created. `status` prints its effective policy, current load
and free memory, running labels/repositories/elapsed times, ordered waiting jobs,
and the head's admission reason. `os.freemem()` reports actual OS free memory,
not an estimate of reclaimable caches or compressed memory. On memory-constrained
machines set an owner-reviewed floor in central config.

FIFO is the sequence assigned at atomic enqueue. Priority classes are `owner`,
`normal` (default), then `background`; FIFO holds within each class. Owner work
can overtake queued normal/background jobs, but cannot preempt running commands.
Continuous higher-priority arrivals can delay lower-priority work.

The queue replaces independent load polling with coordinated admission. It
cannot control commands launched outside it or prevent unrelated applications
raising load after admission. Keep the owner's 15 GiB disk guard and small test
worker counts. Agents should still run at most one heavy job per session.

## State, crash recovery and cancellation

`state.json` contains monotonically assigned sequence numbers, queued requests
and running leases with PID, process start time, command, repository and label.
Each mutation replaces a complete snapshot by atomic rename. A short Lamport
bakery lock publishes fully written immutable contender identities by exclusive
hard link in `locks/`; choosing/ticket changes use atomic rename. This avoids
read-then-write admission and stale-reclaimer races against a replacement lock.
Lock entries have unique names and are removed after the transaction. Abandoned
temporary files from a hard crash are ignored; they carry no authority and may
be removed when no clients are using the directory.

Linux identities include boot ID and kernel start ticks. macOS uses UTC `ps` start
time plus a random lifetime nonce served by an owned Unix socket. The nonce
distinguishes recycled PIDs even within macOS's one-second start-time precision.
The detached supervisor has a unique process title, also checked before sending
group signals on both platforms. The lifetime sockets are private files in the OS temp
directory (short `/tmp` paths if needed). Dead lease sockets are removed on
recovery. An unavailable identity probe that cannot establish death fails closed.
If a lifetime socket resets during shutdown, the queue rechecks PID/start: proven
death is reclaimed, while an uncertain live owner stays held until the next
sample. Ordinary client shutdown therefore cannot abort another queued command.

A reservation initially belongs to its calling process. A separate detached
supervisor establishes its process group and transfers its identity into the
lease **before** receiving permission to spawn the command under `nice -n 15`.
The command and ordinary descendants inherit that group. Normal command exit,
SIGINT or SIGTERM triggers TERM to the entire group, followed by KILL after the
grace interval, then releases the slot. IPC loss tells the supervisor to stop
its group if the caller is killed. If the supervisor itself is killed, the next
queue operation kills remaining group members before reclaiming the lease.
PID reuse never authorizes killing a replacement group. POSIX keeps group IDs
reserved while old group members exist ([process ID reuse](https://pubs.opengroup.org/onlinepubs/009696699/basedefs/xbd_chap04.html)).
Node's [detached child option](https://nodejs.org/api/child_process.html#optionsdetached)
establishes the supervisor's new group and session on these platforms.

This controls descendants that remain in the command's process group. Commands
that deliberately call `setsid`/detach into another group need their own cleanup;
portable process groups do not provide sandbox containment. SIGKILL cannot run
JavaScript cleanup, so recovery occurs when another client runs or through the
surviving supervisor. Zombies are stopped processes and their OS parent/init
must reap them. No macOS or Linux guarantee requires an installed daemon.
Darwin can report `EPERM` for a zombie-only group; cleanup confirms that no live
members remain before treating this as completion. A real zombie-only process
group test covers this behavior.
Permission failures with live members, or an unavailable inspection, retain the
lease and report failure.

Never pass credentials in command arguments: the private state records argv for
lease inspection. Supply credentials through environment variables. Do not
print them in labels, commands or diagnostics.

## Library and CLI integration

```js
import { createQueue } from './modules/job-queue/index.mjs';
const queue = await createQueue();
try {
  const result = await queue.run(['pnpm', 'verify'], {
    kind: 'heavy', label: 'Project verification', cwd: projectDirectory,
    // priority: 'owner', maxWait: 120, signal: abortController.signal
  });
  process.exitCode = result.code;
} finally {
  await queue.close();
}
```

The CLI should route the actual command array for `rer verify`, `build`, `dev`
and `preview` through `queue.run`, preserving cwd, inherited environment/stdin,
and the returned exit code. Browser suites, dependency installs and any separate
workerd/build steps use the same wrapper. Use one queue boundary around a whole
workflow; wrapping a subcommand again while its parent holds the only slot would
deadlock. Long-running dev/preview serving uses the separate managed-server cap. Only
finite preparation holds a heavy-job slot; no persistent server may outlive a
released job as its descendant. Avoid spawning independent unsupervised
servers around this wrapper. No `rer` verbs are changed by this module.

Tests inject `sampler: () => ({ load, freeMemoryBytes })` through the library;
the CLI always uses actual OS samples. Library config overrides are also useful
for isolated test directories. Call `close()` only after all operations finish.
`pnpm verify:job-queue` runs the focused suite with file concurrency one. Its
cross-process probes launch lightweight real children, not actual builds.

## Proposed text for Codex homes' AGENTS.md

This is a proposal only; no Codex home instructions were edited:

> Queue bounded dependency installs, builds, verify/test/browser suites and
> temporary wrangler/workerd resource journeys. Run those commands through
> `node /path/to/base/modules/job-queue/cli.mjs run --kind heavy --label TEXT -- COMMAND ARGS`.
> All sessions use the same `~/.rer/jobs` (or owner-set `RER_JOBS_DIR`); never use a
> per-worktree queue. The queue admits only within slots, load <=36 and the memory
> floor, and runs commands at low priority. Let it wait; use `--max-wait 1200`
> only when a task explicitly requires a twenty-minute bounded wait. Use
> `--priority owner` only for the owner's interactive work. Keep at least 15 GiB
> disk free, one heavy job at a time per session, and few test workers. Wrap one
> boundary per workflow; nested first-party commands validate and share that
> live membership. Dev/preview queue finite preparation and use the separate
> server registry for persistent serving. Do not hold a heavy lease for an idle
> server or leave a server descended from a finished job. Stop servers when
> finished. Inspect waiting reasons with `status`; do not bypass admission.
