import { lstat, rename, link, unlink } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { assertRegular, inspect } from './files.mjs'

// The encoded relative name is also the recovery record. Publishing it by
// rename records the destination atomically with moving the original inode.
export function hiddenBuildName(file) {
  validateName(file)
  return `original.${Buffer.from(file).toString('base64url')}.private`
}

function validateName(file) {
  if (typeof file !== 'string' || !file || isAbsolute(file)
    || file.split(/[\\/]/).some(part => !part || part === '..' || part === '.')) {
    throw new Error('Private build files must be contained checkout paths.')
  }
}

export function buildDestination(name) {
  const match = /^original\.([A-Za-z0-9_-]+)\.private$/.exec(name)
  if (!match) return
  const file = Buffer.from(match[1], 'base64url').toString('utf8')
  if (hiddenBuildName(file) !== name) throw new Error('Invalid private build recovery record.')
  return file
}

export async function inspectBuildFile(root, file, { publication = false } = {}) {
  validateName(file)
  const parts = file.split(/[\\/]/)
  let path = root
  for (const [index, part] of parts.entries()) {
    path = join(path, part)
    const status = await inspect(path)
    if (!status) return { path: join(root, ...parts) }
    if (index < parts.length - 1) {
      if (!status.isDirectory() || status.isSymbolicLink()) throw new Error('Unsafe private build file ancestor.')
    } else {
      if (publication && status.isFile() && !status.isSymbolicLink() && (!process.getuid || status.uid === process.getuid())) return { path, status }
      assertRegular(status); return { path, status }
    }
  }
}

export async function hideBuildFile(item, work, file) {
  const current = await lstat(item.path)
  if (current.ino !== item.status.ino || current.dev !== item.status.dev) throw new Error('Private settings changed during build; run again.')
  const hidden = join(work, hiddenBuildName(file))
  await rename(item.path, hidden)
  return { path: hidden, file }
}

export async function restoreBuildFile(root, item) {
  const destination = await inspectBuildFile(root, item.file, { publication: true })
  const hidden = await inspect(item.path)
  if (!hidden) return
  if (destination.status?.ino === hidden.ino && destination.status?.dev === hidden.dev) {
    await unlink(item.path)
    return
  }
  assertRegular(hidden)
  // Linking keeps exact bytes/mode and refuses a concurrently created file.
  await link(item.path, destination.path)
  await unlink(item.path)
}
