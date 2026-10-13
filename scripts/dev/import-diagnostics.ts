import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// This runs only in the Vite browser. Native errors still reach browser gates;
// our additional diagnostic contains attribution, never the original error.
function installImportDiagnostics() {
 const installed = Symbol.for('uptime.dev.import-diagnostics')
 const state = window as unknown as Record<symbol, boolean>
 if (state[installed]) return
 state[installed] = true
 const report = (message: unknown) => {
  if (typeof message !== 'string') return
  const failed = message.match(/(?:Failed to fetch dynamically imported module|error loading dynamically imported module):\s*(\S+)/i)
  if (!failed) return
  let module = '[private or external module]'
  try {
   const url = new URL(failed[1], location.href)
   if (url.origin === location.origin) {
    let path = url.pathname
    // Vite's absolute transport is declared only for package dependencies.
    if (path.startsWith('/@fs/')) path = path.includes('/node_modules/') ? path.slice(path.indexOf('/node_modules/')) : ''
    if (/^\/(?:src|node_modules|assets)\/[A-Za-z0-9_@./+-]+\.(?:[cm]?[jt]sx?|css)$/.test(path) && !path.split('/').includes('..')) module = path.slice(1)
   }
  } catch { /* Malformed URLs have no safe module attribution. */ }
  console.error(`Vite dynamic import failed: ${module}`)
 }
 window.addEventListener('error', event => report(event.message))
 window.addEventListener('unhandledrejection', event => report(event.reason instanceof Error ? event.reason.message : event.reason))
}

export function developmentImportDiagnostics(): Plugin {
 const client = fileURLToPath(new URL('../client/client.mjs', import.meta.resolve('vite')))
 return {
  name: 'uptime:development-import-diagnostics',
  apply: 'serve',
  enforce: 'pre',
  transform(code, id) {
   if (id.split(/[?#]/, 1)[0] !== client || this.environment.config.consumer !== 'client') return
   return {code: `(${installImportDiagnostics.toString()})();\n${code}`, map: null}
  },
 }
}
