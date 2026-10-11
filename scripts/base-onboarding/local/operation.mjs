import { randomUUID } from 'node:crypto'
import { link, lstat, open, readFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { privateDirectory } from './files.mjs'
import { processStart } from './process-table.mjs'
import {processName} from '../process-diagnostics.mjs'

const busy = async (path) => {
 let owner;try{owner=JSON.parse(await readFile(path,'utf8'));}catch{}
 const pid=Number.isSafeInteger(owner?.pid)&&owner.pid>0?owner.pid:undefined;
 const identity=pid?`PID ${pid} (${await processName(pid)})`:'an unidentified process';
 return Object.assign(new Error(`An active local operation owns the state: ${identity}. Stop it with rer dev --stop or rer preview --stop; for an unmanaged process, stop PID ${pid ?? 'shown in the lock'} before retrying.`), {code: 'LOCAL_OPERATION_BUSY', ownerPid: pid});
}
const graceMs = 10000

// Setup holds this lock through its nested build and migration commands. A
// separate build/setup cannot restore credentials into another active build.
// The lock and every takeover guard record the owner's PID and start time, so a
// PID reused by an unrelated process never keeps a dead owner's lock alive.
export async function localOperation(root, inheritedToken) {
  const directory = join(root, '.wrangler/local-operation')
  await privateDirectory(root, directory)
  const path = join(directory, 'active.json')
  if (inheritedToken) {
    let owner
    try { owner = JSON.parse(await readFile(path, 'utf8')) } catch { /* Fixed diagnostic below. */ }
    if (owner?.token !== inheritedToken || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) {
      throw new Error('The parent local setup operation is no longer active. Run the command again.')
    }
    if (!await ownerAlive(owner)) throw new Error('The parent local setup process has stopped. Run the command again.')
    return { token: inheritedToken, release: async () => {} }
  }
  const self = await currentProcess()
  let file
  for (let attempt = 0; !file; attempt++) {
    try { file = await open(path, 'wx', 0o600) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      // A killed process cannot release its lock. Take over only when the
      // recorded process is gone; a half-written file gets a short grace.
      if (attempt === 0 && await takeOver(path)) continue
      throw await busy(path)
    }
  }
  const token = randomUUID()
  try { await file.writeFile(JSON.stringify({ ...self, token })) } finally { await file.close() }
  const acquired = await identity(path)
  return { token, release: async () => {
    if (await identity(path) === acquired) await unlink(path).catch(missing)
  } }
}

async function currentProcess() {
  return { pid: process.pid, start: await processStart(process.pid) }
}

// A recorded owner is alive only while its PID exists and, when the record
// carries a start time, that PID still names the same process.
export async function ownerAlive(owner) {
  try { process.kill(owner.pid, 0) } catch (error) {
    if (error.code === 'ESRCH') return false
    if (error.code !== 'EPERM') throw error
  }
  if (typeof owner.start !== 'string') return true
  return await processStart(owner.pid) === owner.start
}

// Removing a stale lock by name alone could remove a lock another starter has
// just created. Every starter that judged the same stale file competes for one
// exclusive guard named after that file's identity; only the guard holder may
// remove it, and only while the path still names that exact file. A new lock
// has a new identity, so it can never be removed as stale.
async function takeOver(path) {
  const judged = await staleIdentity(path)
  if (judged === undefined) return false
  if (judged === null) return true // Already gone: retry the exclusive create.
  const guardPath = `${path}.takeover-${judged}`
  let guard
  for (let attempt = 0; !guard; attempt++) {
    try { guard = await open(guardPath, 'wx', 0o600) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      // Another starter is taking over; it, or a faster starter, owns the lock.
      // A guard whose owner was killed is removed once, after its grace.
      if (attempt > 0 || !await removeAbandonedGuard(guardPath, path)) return false
    }
  }
  try {
    await guard.writeFile(JSON.stringify(await currentProcess()))
    const current = await identity(path)
    if (current === judged) await unlink(path).catch(missing)
    return true
  } finally {
    await guard.close()
    await unlink(guardPath).catch(missing)
  }
}

// Returns the identity of a stale lock, null when the lock is already gone, or
// undefined when a live (or freshly created) lock holds the path. Judge and
// identify through one descriptor so the verdict belongs to that exact file.
async function staleIdentity(path) {
  let handle
  try { handle = await open(path, 'r') } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  try {
    const status = await handle.stat({ bigint: true })
    const id = key(status)
    try {
      const owner = JSON.parse(await handle.readFile('utf8'))
      if (Number.isSafeInteger(owner.pid) && owner.pid > 0) return await ownerAlive(owner) ? undefined : id
    } catch { /* Half-written or unreadable: judged by age below. */ }
    return Date.now() - Number(status.mtimeMs) > graceMs ? id : undefined
  } finally { await handle.close() }
}

// A takeover guard left by a killed starter would otherwise block every later
// build. After the grace, a guard whose recorded owner is gone (or that was
// never written) is moved aside and removed. The move is checked against the
// judged file; a guard created meanwhile is put back, never discarded.
async function removeAbandonedGuard(guardPath, lockPath) {
  let handle
  try { handle = await open(guardPath, 'r') } catch (error) {
    if (error.code === 'ENOENT') return true
    throw error
  }
  let judged
  try {
    const status = await handle.stat({ bigint: true })
    if (Date.now() - Number(status.mtimeMs) <= graceMs) return false
    let owner
    try { owner = JSON.parse(await handle.readFile('utf8')) } catch { /* Never written: abandoned. */ }
    if (Number.isSafeInteger(owner?.pid) && owner.pid > 0 && await ownerAlive(owner)) {
      throw new Error(`A stale-lock takeover has held ${guardPath} for more than ${graceMs / 1000} s. If no local setup or build is running, delete it and ${lockPath}, then run again.`)
    }
    judged = movedKey(status)
  } finally { await handle.close() }
  const aside = `${guardPath}.abandoned-${randomUUID()}`
  try { await rename(guardPath, aside) } catch (error) {
    if (error.code === 'ENOENT') return true
    throw error
  }
  if (movedKey(await lstat(aside, { bigint: true })) !== judged) {
    // Another starter replaced the abandoned guard first. Restore its guard
    // without replacing a newer one, and let that starter finish.
    await link(aside, guardPath).catch((error) => { if (error.code !== 'EEXIST') throw error })
    await unlink(aside)
    return false
  }
  await unlink(aside)
  return true
}

const missing = (error) => { if (error.code !== 'ENOENT') throw error }

async function identity(path) {
  try { return key(await lstat(path, { bigint: true })) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

// Inode numbers can be reused after deletion; the change time cannot repeat.
const key = (status) => `${status.dev}-${status.ino}-${status.ctimeNs}`
// A rename changes ctime, so a moved file is matched by its unchanged fields.
const movedKey = (status) => `${status.dev}-${status.ino}-${status.birthtimeNs}-${status.mtimeNs}`
