import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Metadata = Record<string, unknown>
function metadata(file: string): Metadata {
 try {
  const value = JSON.parse(readFileSync(file, 'utf8'))
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
 } catch { /* Unavailable metadata cannot authorize diagnostic output. */ }
 return {}
}

const modulePath = (path: string) => /^[A-Za-z0-9_@./+$-]+\.(?:[cm]?[jt]sx?|css)$/.test(path) &&
 !path.split('/').some(part => !part || part === '.' || part === '..')

// Only reviewed source names and declared package entry points are diagnostic
// labels. A URL, a Vite module request, or an arbitrary file on disk is not
// authority. These manifests also ship in source artifacts without .git.
export function publicModulePaths(root: string): string[] {
 const paths = new Set<string>()
 const lock = metadata(join(root, 'sources.lock.json'))
 const seed = metadata(join(root, 'seed.json'))
 const declarations = (seed.deploy as { publicPaths?: {path: string, match: string, kind: string}[] } | undefined)?.publicPaths ?? []
 for (const name of Object.keys(lock.files ?? {})) {
  const path = name.startsWith('public/') ? name.slice(7) : name
  if (!modulePath(path) || (!name.startsWith('src/') && !name.startsWith('public/'))) continue
  if (declarations.some(item => ['asset', 'development-asset'].includes(item.kind) &&
   (item.match === 'exact' ? '/' + path === item.path : item.match === 'prefix' && item.path.endsWith('/') && ('/' + path).startsWith(item.path)))) paths.add(path)
 }
 const project = metadata(join(root, 'package.json'))
 for (const name of Object.keys({...project.dependencies as Metadata, ...project.devDependencies as Metadata})) {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)) continue
  const manifest = metadata(join(root, 'node_modules', name, 'package.json'))
  if (manifest.name !== name) continue
  const entry = (value: unknown) => {
   if (typeof value === 'string') {
    const path = value.replace(/^\.\//, '')
    if (modulePath(path)) paths.add('node_modules/' + name + '/' + path)
   } else if (value && typeof value === 'object') {
    for (const target of Object.values(value)) entry(target)
   }
  }
  entry(manifest.exports)
  entry(manifest.main)
  entry(manifest.module)
 }
 return [...paths].sort()
}
