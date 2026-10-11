import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { promisify } from 'node:util'

const execute = promisify(execFile)
export const validPid = (pid) => Number.isSafeInteger(pid) && pid > 0 && pid <= 0x7fffffff

// Inspect only numeric process metadata: command lines can contain credentials.
// Linux's start ticks distinguish recycled PIDs more precisely than ps lstart.

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
  return { pid, ppid, pgid, state: fields[0], birth: fields[19] }
}

async function processGroup(pgid, signal, deadline) {
  if (process.platform === 'linux') {
    // Minimal Linux containers need not install ps. Procfs provides exact
    // start ticks and includes zombies until their actual parent reaps them.
    const pids = (await readdir('/proc')).filter((name) => /^\d+$/.test(name)).map(Number).filter(validPid)
    const group = []
    // Procfs metadata reads are tiny kernel snapshots. Avoid hundreds of
    // thread-pool round trips delaying cooperative shutdown; retain an explicit
    // deadline and every PID/start-tick check while scanning the same inventory.
    for (const pid of pids) {
      signal.throwIfAborted()
      if (Date.now() >= deadline) throw new Error('Process inspection deadline expired.')
      let text
      try { text = readFileSync(`/proc/${pid}/stat`, 'utf8') } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ESRCH') continue
        throw error
      }
      const member = parseLinuxProcess(pid, pgid, text)
      if (member) group.push(member)
    }
    return group
  }
  const { stdout } = await execute('/bin/ps', [
    '-ax', '-o', 'pid=', '-o', 'ppid=', '-o', 'pgid=', '-o', 'stat=', '-o', 'lstart=',
  ], { env: { ...process.env, LC_ALL: 'C' }, signal, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 })
  const group = []
  for (const line of stdout.split('\n').filter((line) => line.trim())) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/)
    if (!match) throw new Error('Could not read process identities.')
    const [, id, parent, groupId, state, birth] = match
    const pid = Number(id)
    const ppid = Number(parent)
    if (Number(groupId) !== pgid) continue
    if (!validPid(pid) || !Number.isSafeInteger(ppid) || ppid < 0 || !Number.isFinite(Date.parse(birth))) {
      throw new Error('Invalid process identity.')
    }
    group.push({ pid, ppid, pgid, state, birth })
  }
  return group
}

export async function readOwnedGroup(pgid, timeout = 1000) {
  if (!validPid(pgid)) throw new Error('Invalid owned process group.')
  if (!(timeout > 0)) throw new Error('Process inspection deadline expired.')
  const controller = new AbortController()
  let timer
  try {
    return await Promise.race([processGroup(pgid, controller.signal, Date.now() + timeout), new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('Process inspection deadline expired.'))
      }, timeout)
    })])
  } finally { clearTimeout(timer) }
}

export const sameProcess = (left, right) => left?.pid === right?.pid
  && left?.pgid === right?.pgid && left?.birth === right?.birth

// A process start time distinguishes a live owner from an unrelated process that
// reused its PID. Linux reports start ticks since boot; elsewhere ps reports a
// one-second start time, read in UTC so every caller sees the same value.
// Returns undefined when no process has this PID.
export async function processStart(pid) {
  if (!validPid(pid)) throw new Error('Invalid process identity.')
  if (process.platform === 'linux') {
    let text
    try { text = await readFile(`/proc/${pid}/stat`, 'utf8') } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ESRCH') return undefined
      throw error
    }
    const fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/)
    if (!/^\d+$/.test(fields[19] ?? '')) throw new Error('Invalid process identity.')
    return `linux:${fields[19]}`
  }
  let stdout
  try {
    ({ stdout } = await execute('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
      env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' }, killSignal: 'SIGKILL', timeout: 5000,
    }))
  } catch (error) {
    // ps exits 1 when the PID does not exist.
    if (error.code === 1 && !String(error.stdout ?? '').trim()) return undefined
    throw error
  }
  if (!stdout.trim()) return undefined
  const started = Date.parse(`${stdout.trim()} UTC`)
  if (!Number.isFinite(started)) throw new Error('Invalid process identity.')
  return `ps:${started}`
}
