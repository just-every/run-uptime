import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { publicModulePaths } from './public-module-paths.ts'

// This runs only in the Vite browser. Native errors still reach browser gates;
// our additional diagnostic contains attribution, never the original error.
function installImportDiagnostics(paths: string[]) {
 const installed = Symbol.for('uptime.dev.import-diagnostics')
 const state = window as unknown as Record<symbol, boolean>
 if (state[installed]) return
 state[installed] = true
 const known = new Map(paths.map(path => ['/' + path, path]))
 const report = (message: unknown) => {
  if (typeof message !== 'string') return
  const failed = message.match(/(?:Failed to fetch dynamically imported module|error loading dynamically imported module):\s*(\S+)/i)
  if (!failed) return
  let module = '[private or external module]'
  try {
   const url = new URL(failed[1], location.href)
   if (url.origin === location.origin) {
    let path = url.pathname
    // Discard machine and package-store prefixes before looking up a label.
    // Even a plausible or existing module path has no authority by itself.
    if (path.startsWith('/@fs/') || path.startsWith('/node_modules/')) {
     const dependency = path.lastIndexOf('/node_modules/')
     path = dependency < 0 ? '' : path.slice(dependency)
    }
    module = known.get(path) ?? module
   }
  } catch { /* Malformed URLs have no safe module attribution. */ }
  console.error(`Vite dynamic import failed: ${module}`)
 }
 window.addEventListener('error', event => report(event.message))
 window.addEventListener('unhandledrejection', event => report(event.reason instanceof Error ? event.reason.message : event.reason))
}

export function developmentImportDiagnostics(): Plugin {
 const client = fileURLToPath(new URL('../client/client.mjs', import.meta.resolve('vite')))
 let paths: string[] = []
 return {
  name: 'uptime:development-import-diagnostics',
  apply: 'serve',
  enforce: 'pre',
  configResolved(config) { paths = publicModulePaths(config.root) },
  transform(code, id) {
   if (id.split(/[?#]/, 1)[0] !== client || this.environment.config.consumer !== 'client') return
   return {code: `(${installImportDiagnostics.toString()})(${JSON.stringify(paths)});\n${code}`, map: null}
  },
 }
}
