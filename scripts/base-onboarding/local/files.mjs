import { lstat, mkdir, open } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

export async function inspect(path) {
  try { return await lstat(path) } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

// Inspect every ancestor: mkdir({recursive:true}) alone follows symlinks.
export async function privateDirectory(root, path) {
  const parts = relative(root, resolve(path)).split(sep)
  if (parts.includes('..')) throw new Error('Unsafe local setup directory.')
  let current = root
  for (const part of parts) {
    current = resolve(current, part)
    const status = await inspect(current)
    if (status && (!status.isDirectory() || status.isSymbolicLink())) {
      throw new Error('Unsafe local setup directory; remove its symlink or non-directory first.')
    }
    if (!status) await mkdir(current, { mode: 0o700 })
  }
}

export async function privateFile(path, content) {
  const handle = await open(path, 'wx', 0o600)
  try { await handle.writeFile(content) } finally { await handle.close() }
}

export function assertRegular(status) {
  if (status && (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1)) {
    throw new Error('Unsafe .dev.vars path; replace its symlink, hard link or non-file before setup.')
  }
}
