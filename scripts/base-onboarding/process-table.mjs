import { execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const execute = promisify(execFile)
// One bounded wait for any process inspection; a loaded machine can take over a
// second to list processes, which must not abort an otherwise healthy cleanup.
export const inspectionMs = 5000
export const validPid = (pid) => Number.isSafeInteger(pid) && pid > 0 && pid <= 0x7fffffff

// Inspect numeric identity and the executable name, never private argv.
// Linux's start ticks distinguish recycled PIDs more precisely than ps lstart.
async function linuxProcess(pid, pgid, signal) {
  for (;;) {
    signal.throwIfAborted()
    let text
    try { text = await readFile(`/proc/${pid}/stat`, { encoding: 'utf8', signal }) } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ESRCH') return
      throw error
    }
    const group = pgid ?? Number(text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/)[2])
    if (pgid === undefined && group === 0) return // Kernel tasks cannot belong to an owned detached group.
    let member
    try { member = parseLinuxProcess(pid, group, text) } catch {
      // Procfs may finish an already-open read while its task is exiting or
      // replacing its thread leader. An invalid snapshot never grants identity:
      // reconcile this same PID until valid, gone, or the inspection aborts.
      await delay(5, undefined, { signal }); continue
    }
    if (!member) return
    try { return { ...member, uid: (await stat(`/proc/${pid}`)).uid } }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return; throw error }
  }
}

export function parseLinuxProcess(pid, pgid, text) {
  if (!validPid(pid) || !validPid(pgid) || !text.startsWith(`${pid} (`) || !text.includes(') ')) {
    throw new Error('Invalid process identity.')
  }
  const fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/)
  const ppid = Number(fields[1])
  if (Number(fields[2]) !== pgid) return
  if (!Number.isSafeInteger(ppid) || ppid < 0 || !/^\d+$/.test(fields[19])) {
    throw new Error('Invalid process identity.')
  }
  return { pid, ppid, pgid, state: fields[0], birth: fields[19], command: text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')) }
}

async function processGroup(pgid, signal) {
  if (process.platform === 'linux') {
    // Minimal Linux containers need not install ps. Procfs provides exact
    // start ticks and includes zombies until their actual parent reaps them.
    const pids = (await readdir('/proc')).filter((name) => /^\d+$/.test(name)).map(Number).filter(validPid)
    const group = []
    for (let offset = 0; offset < pids.length; offset += 16) {
      signal.throwIfAborted()
      const members = await Promise.all(pids.slice(offset, offset + 16).map((pid) => linuxProcess(pid, pgid, signal)))
      group.push(...members.filter(Boolean))
    }
    return group
  }
  const { stdout } = await execute('/bin/ps', [
    '-ax', '-o', 'pid=', '-o', 'ppid=', '-o', 'pgid=', '-o', 'uid=', '-o', 'stat=', '-o', 'lstart=',
  ], { env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' }, signal, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 })
  const group = []
  for (const line of stdout.split('\n').filter((line) => line.trim())) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.{24})\s*$/)
    if (!match) throw new Error('Could not read process identities.')
    const [, id, parent, groupId, uid, state, birth] = match
    const pid = Number(id)
    const ppid = Number(parent)
    if (pgid === undefined && (pid === 0 || Number(groupId) === 0)) continue
    if (pgid !== undefined && Number(groupId) !== pgid) continue
    if (!validPid(pid) || !validPid(Number(groupId)) || !Number.isSafeInteger(ppid) || ppid < 0 || !Number.isFinite(Date.parse(birth))) {
      throw new Error('Invalid process identity.')
    }
    group.push({ pid, ppid, pgid: Number(groupId), uid: Number(uid), state, birth })
  }
  return group
}

// Executable inspection is limited to owned candidates. Asking macOS ps for
// comm across every user process invokes expensive argv lookups and can make
// cleanup slower than the existing bounded shutdown contract.
export async function readProcessIdentity(pid, timeout = inspectionMs) {
  if (!validPid(pid) || !(timeout > 0)) throw new Error('Invalid process identity deadline.')
  if (process.platform === 'linux') return linuxProcess(pid, undefined, AbortSignal.timeout(timeout))
  let stdout
  try {
    ({ stdout } = await execute('/bin/ps', ['-p', String(pid), '-o', 'pid=', '-o', 'ppid=', '-o', 'pgid=', '-o', 'uid=', '-o', 'stat=', '-o', 'lstart=', '-o', 'comm='],
      { env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' }, timeout, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 }))
  } catch (error) { if (error.code === 1 && !error.stdout?.trim()) return; throw new Error('Could not inspect process identity.') }
  const match = stdout.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.{24})\s+(.+?)\s*$/)
  if (!match) throw new Error('Invalid process identity.')
  const [, id, parent, groupId, uid, state, birth, command] = match
  if (Number(id) !== pid || !validPid(Number(groupId)) || !Number.isFinite(Date.parse(birth + ' UTC'))) throw new Error('Invalid process identity.')
  return { pid, ppid: Number(parent), pgid: Number(groupId), uid: Number(uid), state, birth, command }
}

export async function readProcessTable(timeout = inspectionMs, pgid) {
  if (!(timeout > 0)) throw new Error('Process inspection deadline expired.')
  const controller = new AbortController()
  let timer
  try {
    return await Promise.race([processGroup(pgid, controller.signal), new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('Process inspection deadline expired.'))
      }, timeout)
    })])
  } finally { clearTimeout(timer) }
}

export const sameBirth = (left, right) => validPid(left?.pid) && left.pid === right?.pid && left.birth === right?.birth

export const sameProcess = (left, right) => validPid(left?.pid) && left?.pid === right?.pid
  && left?.birth === right?.birth && left?.command === right?.command
