import { readdir, rmdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { inspect } from './files.mjs'
import { buildDestination, inspectBuildFile, restoreBuildFile } from './build-files.mjs'
import { localOperation } from './operation.mjs'

// Legacy setup/build names and encoded build inventory names retain private
// originals across a hard kill. The next local operation recovers them first.
const hiddenOriginals = [['local-build', 'original.dev.vars'], ['local-setup', 'previous.dev.vars']]

export async function strandedOriginals(root) {
  const found = []
  // Never follow a symlinked output directory; setup refuses those itself.
  const realDirectory = async (path) => { const status = await inspect(path); return status?.isDirectory() && !status.isSymbolicLink() }
  if (!await realDirectory(join(root, '.wrangler'))) return found
  for (const [folder, name] of hiddenOriginals) {
    const directory = join(root, '.wrangler', folder)
    if (!await realDirectory(directory)) continue
    let runs
    try { runs = await readdir(directory, { withFileTypes: true }) } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    for (const run of runs) {
      if (!run.isDirectory() || !run.name.startsWith('run-')) continue
      const path = join(directory, run.name, name)
      const status = await inspect(path)
      if (status?.isFile()) found.push({ path, status, folder, file: '.dev.vars' })
      if (folder === 'local-build') {
        for (const entry of await readdir(join(directory, run.name), { withFileTypes: true })) {
          const file = buildDestination(entry.name)
          if (!file) continue
          const hidden = join(directory, run.name, entry.name)
          const status = await inspect(hidden)
          if (!status?.isFile() || status.isSymbolicLink()) throw new Error('Unsafe private build recovery file.')
          found.push({ path: hidden, status, folder, file })
        }
      }
    }
  }
  return found
}

// Restores stranded private originals before anything reads or replaces them.
// Recovery runs under the operation lock, so a live build's hidden file is
// never taken: that build owns the lock and the caller is told to wait. Returns
// the operation the caller now holds (the one passed in, or a new one).
export async function recoverInterrupted(root, operation) {
  if ((await strandedOriginals(root)).length === 0) return operation
  const held = operation ?? await localOperation(root)
  try { await restore(root) } catch (error) {
    if (!operation) await held.release()
    throw error
  }
  return held
}

async function restore(root) {
  const stranded = await strandedOriginals(root)
  for (const file of new Set(stranded.map(item => item.file))) {
    const items = stranded.filter(item => item.file === file)
    const current = (await inspectBuildFile(root, file, { publication: true })).status
    const pending = []
    for (const item of items) {
      if (current && item.status.ino === current.ino && item.status.dev === current.dev) await unlink(item.path)
      else pending.push(item)
    }
    if (current) {
      for (const item of pending) console.error(`An interrupted build or setup left an earlier private copy of ${file} at ${item.path}. The current file was kept; delete that copy once you no longer need it.`)
      continue
    }
    if (pending.length > 1) throw new Error(`${file} is missing and interrupted runs left several private originals:\n${pending.map(item => `  ${item.path}`).join('\n')}\nMove the one to keep to ${file}, then run again.`)
    if (!pending.length) continue
    const [item] = pending
    await restoreBuildFile(root, item)
    if (item.folder === 'local-build') await rmdir(dirname(item.path)).catch(() => {})
    console.error(`Restored ${file} from an interrupted build or setup (${item.path}).`)
  }
}
