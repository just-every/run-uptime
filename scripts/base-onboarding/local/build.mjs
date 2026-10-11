import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { privateDirectory } from './files.mjs'
import { localVariables, secretValues } from './environment.mjs'
import { localOperation } from './operation.mjs'
import { recoverInterrupted } from './recovery.mjs'
import { inspectBuildFile, hideBuildFile, restoreBuildFile } from './build-files.mjs'

// Hide every declared private setting and backup under the shared operation
// lock. Renames and exclusive links preserve each original inode and mode;
// encoded names let the next operation recover a hard-killed build.
export async function withoutLocalVariables(root, action, { nested = process.env.RER_LOCAL_OPERATION, report, settings = ['.dev.vars', '.dev.vars.previous'] } = {}) {
  const hidden = []
  let work, operation, restoration
  const restore = () => restoration ??= (async () => {
    const failures = []
    for (const item of hidden) {
      try { await restoreBuildFile(root, item) } catch {
        failures.push(`Could not restore ${item.file} without replacing a concurrent file. Original retained at ${item.path}.`)
      }
    }
    if (work && !failures.length) await rm(work, { recursive: true })
    await operation?.release()
    if (failures.length) {
      if (report) for (const message of failures) report(message)
      else throw new Error(failures.join('\n'))
    }

  })()
  try {
    operation = await localOperation(root, nested)
    if (!nested) await recoverInterrupted(root, operation)
    const files = []
    for (const file of new Set(['.dev.vars', '.dev.vars.previous', ...settings])) {
      const item = await inspectBuildFile(root, file)
      if (item.status) files.push({ ...item, file })
    }
    let secrets = []
    const vars = files.find(item => item.file === '.dev.vars')
    if (vars) secrets = secretValues(localVariables(await readFile(vars.path, 'utf8')))
    if (files.length) {
      const directory = join(root, '.wrangler/local-build')
      await privateDirectory(root, directory)
      work = await mkdtemp(join(directory, 'run-'))
      for (const item of files) hidden.push(await hideBuildFile(item, work, item.file))
    }
    return await action({ secrets, operation, restore })
  } finally { await restore() }
}
