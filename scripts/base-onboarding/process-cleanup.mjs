import { setTimeout as delay } from 'node:timers/promises'
import { inspectionMs, readProcessIdentity, readProcessTable, sameBirth, sameProcess, validPid } from './process-table.mjs'
import { readOwnedTree } from './process-tree.mjs'

const graceMs = 1000
const cleanupMs = 30000
// macOS ps already spaces observations by tens of milliseconds.
const pollMs = process.platform === 'darwin' ? 5 : 25
const isZombie = (member) => member.state.startsWith('Z')
const isStopped = (member) => /^[Tt]/.test(member.state)
const key = (member) => `${member.pid}:${member.birth}:${member.command}`
const isLeaf = (member, group) => !group.some((other) => other.ppid === member.pid)

// Ask every owned process to shut down gracefully, including supervisors that
// would restart a killed worker. Forced escalation is leaf-first so surviving
// parents can reap children. Every signal rechecks numeric birth identity.
export async function stopOwnedGroup(child, signal, ownership) {
  const pgid = child.pid
  if (!validPid(pgid)) throw new Error('Invalid owned process group.')
  const deadline = Date.now() + cleanupMs
  // Even callers without a prior capture must establish actual ancestry. A
  // same-PGID sibling is not ours, and a lost launcher cannot establish custody.
  ownership ??= await readOwnedTree(child)
  const inspect = async (timeout) => {
    const current = await readOwnedTree(child, ownership, timeout)
    // Retain departed group leaders as provenance, not as signal targets.
    for (const member of current) if (!ownership.some(saved => sameProcess(saved, member))) ownership.push(member)
    return current
  }
  let group
  const signalled = new Map()
  const stopped = new Map()
  let lastGroup = []

  const snapshot = async (limit = deadline) => {
    const current = await inspect(Math.min(inspectionMs, limit - Date.now()))
    if (Date.now() >= limit) throw new Error('Process inspection deadline expired.')
    lastGroup = current
    return current
  }
  const send = async (member, name, requireLeaf = true, limit = deadline) => {
    // Recheck both identity and children immediately before each numeric PID
    // signal. Never send a negative/group signal that can kill parents first.
    const timeout = Math.min(inspectionMs, limit - Date.now())
    const current = requireLeaf ? await readProcessTable(timeout) : []
    const target = await readProcessIdentity(member.pid, Math.min(inspectionMs, limit - Date.now()))
    if (Date.now() >= limit) throw new Error('Process inspection deadline expired.')
    if (!sameProcess(member, target) || isZombie(target)) return false
    if (requireLeaf && !isLeaf(target, current)) return false
    if (name === 'SIGKILL' && !isStopped(target)) return false
    if (requireLeaf && target.pid === pgid && current.some(other => other.pid !== pgid
      && ownership.some(saved => sameBirth(saved, other)))) return false
    // The full identity was read immediately before this numeric signal. A
    // stopped leaf cannot fork across its final SIGKILL inspection. Discovery
    // continues on every outer scan, including after a graceful late fork.
    try { process.kill(target.pid, name) } catch (error) {
      if (error.code !== 'ESRCH') throw new Error(`Could not send ${name} to owned process ${target.pid}.`)
      return false
    }
    return true
  }

  // A captured direct supervisor can receive its graceful shutdown signal
  // promptly. Identity is rechecked first; no group or descendant is signalled
  // until scoped/ancestry discovery establishes its own full identity.
  const leader = ownership.find(member => member.pid === pgid)
  if (leader && child.exitCode == null && child.signalCode == null) {
    const live = await readProcessIdentity(pgid, inspectionMs)
    if (sameProcess(leader, live) && live.ppid === process.pid && !isZombie(live)) {
      try { process.kill(pgid, signal); signalled.set(key(live), Date.now()) }
      catch (error) { if (error.code !== 'ESRCH') throw new Error(`Could not send ${signal} to owned process ${pgid}.`) }
    }
  }

  const unfinished = (cause) => new Error(`Owned processes remain after cancellation (last observed ${lastGroup.map((member) => `${member.pid}:${isZombie(member) ? 'zombie' : 'live'}`).join(', ')}).`, { cause })
  let cleanupError
  try {
    while (Date.now() < deadline) {
      group = await snapshot()
      if (!group.length) {
        await delay(pollMs)
        group = await snapshot()
        if (!group.length && (child.exitCode !== null || child.signalCode !== null)) return
        if (!group.length) continue
      }
      let resuming = false
      // Resume raced parents before considering any leaves, regardless of the
      // order ps returns them. Confirm SIGCONT took effect on the next scan.
      for (const member of group) {
        if (!stopped.has(key(member)) || isLeaf(member, group)) continue
        // SIGCONT also cancels a still-pending SIGSTOP; a running snapshot
        // alone is not evidence that our stop can no longer suspend a parent.
        if (await send(member, 'SIGCONT', false)) stopped.delete(key(member))
        resuming = true
      }
      if (resuming) { await delay(pollMs); continue }
      for (const member of group) {
        if (Date.now() >= deadline) break
        const identity = key(member)
        if (isZombie(member)) continue
        if (!signalled.has(identity)) {
          // A supervisor needs its shutdown signal before its worker disappears;
          // otherwise normal restart behavior can keep this tree alive forever.
          if (await send(member, signal, false)) signalled.set(identity, Date.now())
        } else if (Date.now() - signalled.get(identity) >= graceMs) {
          if (!isLeaf(member, group) || (member.pid === pgid && group.length !== 1)) continue
          if (!stopped.has(identity)) {
            // Freeze only a childless process before its final inspection. It
            // cannot fork between that inspection and SIGKILL once stopped.
            if (await send(member, 'SIGSTOP')) stopped.set(identity, member)
          } else if (isStopped(member)) {
            if (await send(member, 'SIGKILL')) stopped.delete(identity)
          }
        }
      }
      await delay(pollMs)
    }
    throw unfinished()
  } catch (error) {
    cleanupError = Date.now() >= deadline ? unfinished(error) : error
    throw cleanupError
  } finally {
    // Inspection/signalling failures must not leave a process suspended.
    const errors = []
    const resumeDeadline = Math.min(deadline + 1000, Date.now() + 1000)
    for (const member of stopped.values()) {
      try { await send(member, 'SIGCONT', false, resumeDeadline) } catch (error) { errors.push(error) }
    }
    // Preserve the original failure while reporting a failure to resume an owned process.
    // eslint-disable-next-line no-unsafe-finally
    if (errors.length) throw new AggregateError([cleanupError, ...errors].filter(Boolean),
      [cleanupError?.message, 'Could not resume every suspended owned process.', ...errors.map((error) => error.message)].filter(Boolean).join(' '))
  }
}
