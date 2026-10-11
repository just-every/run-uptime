import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { inspectionMs, readProcessIdentity, readProcessTable, sameBirth } from './process-table.mjs'

const execute = promisify(execFile)
const scopes = new WeakMap()
const baselines = new WeakMap()
const birthKey = member => `${member.pid}:${member.birth}`
const marker = 'RER_ONBOARDING_PROCESS_OWNER'

// An exclusive inherited token follows a child through chdir, setsid and
// reparenting. Shared directory, executable name and process group never grant
// ownership. Tokens and inspected environments stay private to this module.
// No process present before this store can have been started by it. This
// immutable exclusion avoids repeatedly reading foreign environments; it never
// authorizes signalling a process. Every later match still requires its token.
export async function createProcessBaseline() {
  const baseline = Object.freeze({})
  baselines.set(baseline, new Set((await readProcessTable()).map(birthKey)))
  return baseline
}
export function createProcessScope(baseline, token = randomUUID()) {
  const scope = Object.freeze({ token })
  if (baseline && !baselines.has(baseline)) throw new Error('Unknown process baseline.')
  scopes.set(scope, { excluded: baselines.get(baseline), unmarked: new Map() })
  return scope
}
export function processScopeEnvironment(scope, environment) {
  if (!scopes.has(scope)) throw new Error('Unknown process scope.')
  // Nested command stores add custody without erasing their parent's marker.
  return { ...environment, [marker]: [...new Set([...inheritedScopeTokens(process.env), ...inheritedScopeTokens(environment), scope.token])].join(',') }
}
export async function scopedProcesses(scope, table, timeout = inspectionMs, previous = []) {
  if (!scopes.has(scope)) throw new Error('Unknown process scope.')
  const inspectionEnd = Date.now() + timeout
  // Inspect same-user candidates in one bounded call. A child can change cwd,
  // detach and lose its parent between captures; the exclusive inherited marker
  // still proves ownership. Arguments/environment never leave this function.
  // A zombie keeps no environment to read and no descendants (they were reparented
  // and carry the marker themselves), so it can neither prove nor hold ownership.
  const { excluded, unmarked } = scopes.get(scope)
  const liveKeys = new Set(table.map(birthKey))
  for (const key of unmarked.keys()) if (!liveKeys.has(key)) unmarked.delete(key)
  // A stable unmarked foreign process cannot inherit a new launch token without
  // a fork. Known owners (including exec transitions) are always reinspected;
  // their descendants are independently discovered by ancestry as well.
  const candidates = table.filter(member => !excluded?.has(birthKey(member))
    && (!unmarked.has(birthKey(member)) || previous.some(saved => sameBirth(saved, member))) && !member.state?.startsWith('Z')
    && (member.uid === undefined || member.uid === process.getuid())
)
  if (!candidates.length) return []
  const environments = process.platform === 'linux' ? new Map() : await readEnvironments(candidates.map(member => member.pid), timeout)
  const matches = []
  inspectCandidate: for (const member of candidates) {
    let environment
    for (;;) {
      try {
        if (process.platform === 'linux') environment = await readFile(`/proc/${member.pid}/environ`, { encoding: 'utf8', signal: AbortSignal.timeout(Math.max(1, inspectionEnd - Date.now())) })
        else environment = environments.get(member.pid)
        if (environment === undefined) throw new Error('Missing process ownership metadata.')
        break
      } catch (error) {
        // Linux withholds the environment of same-user processes that opted out
        // of inspection. Actual ancestry remains an independent custody proof.
        if (process.platform === 'linux' && error?.code === 'EACCES') continue inspectCandidate
        // Exit may remove environ before stat or the zombie state catches up.
        // Reconcile the same birth inside this bounded inspection; never treat
        // a transient read error as foreign ownership or completed cleanup.
        const current = await readProcessIdentity(member.pid, Math.max(1, inspectionEnd - Date.now()))
        if (!sameBirth(current, member) || current.state.startsWith('Z')) continue inspectCandidate
        if (Date.now() < inspectionEnd && (process.platform !== 'linux' || ['ENOENT', 'ESRCH'].includes(error.code))) {
          // The same live birth is still between images (fork/exec) or being
          // reaped. Wait for its environment to become readable, up to the
          // inspection deadline, instead of reading the batch listing once.
          await delay(5)
          if (process.platform !== 'linux') for (const [pid, text] of await readEnvironments([member.pid], Math.max(1, inspectionEnd - Date.now()))) environments.set(pid, text)
          continue
        }
        throw new Error(`Could not inspect ownership of process ${member.pid} (${error.code ?? 'missing'}, state ${current.state}).`)
      }
    }
    if (environment.split(/[\0\s]+/).some(value => value.startsWith(marker + '=')
      && value.slice(marker.length + 1).split(',').includes(scope.token))) matches.push(member)
    else unmarked.set(birthKey(member), true)
  }
  // A recycled PID must not transfer a token reading to its successor. PGID may
  // legitimately change, so follow the same birth identity across that change.
  // The caller rechecks each match's full PID/start/command identity.
  return matches
}

// macOS exposes a process environment only through ps. One bounded call lists
// every candidate; a process that vanishes or is between images yields no line
// or an empty command, and callers wait for that same birth rather than guess.
async function readEnvironments(pids, timeout) {
  let stdout
  try {
    ({ stdout } = await execute('/bin/ps', ['eww', '-p', pids.join(','), '-o', 'pid=', '-o', 'command='], { timeout, maxBuffer: 16 * 1024 * 1024 }))
  } catch (error) {
    // ps may lose a candidate while it enumerates. Keep partial private output
    // only for that exit code; each missing identity is checked by the caller.
    if (error.code === 1 && typeof error.stdout === 'string') stdout = error.stdout
    else throw new Error('Could not inspect scoped process ownership.')
  }
  const environments = new Map()
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/)
    if (match) environments.set(Number(match[1]), match[2])
  }
  return environments
}

export function inheritedScopeTokens(environment) {
  return String(environment?.[marker] ?? '').split(',').filter(value => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
}
