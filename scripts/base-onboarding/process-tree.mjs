import { scopedProcesses } from './process-scope.mjs'
import { inspectionMs, readProcessIdentity, readProcessTable, sameBirth, sameProcess, validPid } from './process-table.mjs'

// Retain PID/start/command identities after close. An exclusive inherited marker
// recovers descendants after reparenting; group membership and cwd never grant
// ownership. Inspect executable identity only for actual custody candidates.
export async function readOwnedTree(child, previous = [], timeout = inspectionMs, scope = previous.scope) {
  if (!validPid(child.pid)) throw new Error('Invalid owned process tree.')
  const table = await readProcessTable(timeout)
  const candidates = table.filter(member => previous.some(saved => sameBirth(member, saved)))
  let owned = (await Promise.all(candidates.map(member => readProcessIdentity(member.pid, timeout))))
    .filter(member => member && previous.some(saved => sameProcess(member, saved)))
  if (scope) {
    for (const member of await scopedProcesses(scope, table, timeout, previous)) {
      if (owned.some(saved => sameBirth(saved, member))) continue
      const live = await readProcessIdentity(member.pid, timeout)
      if (sameBirth(member, live) && !owned.some(saved => sameProcess(saved, live))) owned.push(live)
    }
  } else if (!previous.length && child.exitCode == null && child.signalCode == null) {
    const leader = await readProcessIdentity(child.pid, timeout)
    if (!leader || leader.ppid !== process.pid) throw new Error('Could not establish owned process tree identity.')
    owned = [leader]
  }
  let changed
  do {
    changed = false
    for (const member of table) {
      if (owned.some(saved => sameBirth(saved, member))) continue
      if (!owned.some(parent => parent.pid === member.ppid)) continue
      const live = await readProcessIdentity(member.pid, timeout)
      if (sameBirth(member, live) && owned.some(parent => parent.pid === live.ppid)) { owned.push(live); changed = true }
    }
  } while (changed)
  Object.defineProperty(owned, 'scope', { value: scope })
  return owned
}
