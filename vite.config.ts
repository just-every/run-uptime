import { demoSockets } from './src/modules/demo/vite.mjs'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { docsSite } from './src/site/docs/build/plugin.ts'
import { archiveOutputGuard } from '@runeditrun/rer/archive-output'
import { developmentImportDiagnostics } from './scripts/dev/import-diagnostics.ts'

const origin = process.env.RER_DEV_ORIGIN
const local = origin ? {
 ...JSON.parse(readFileSync('data/local-secrets.json', 'utf8')),
 AUTH_ORIGIN: origin, UPTIME_ORIGIN: origin, UPTIME_LOCAL_REVIEW: 'true',
 MAIL_PROVIDER: 'development', UPTIME_SYNTHETIC_PORT: process.env.UPTIME_SYNTHETIC_PORT ?? '',
} : undefined
// Only `vite dev` loads the local-only entry and the checkout's dev key; a build keeps src/server.ts and never sees either
// (rer build checks its output for the dev layer).
const gate = (name: string) => process.env[name] ? { [name]: process.env[name] } : {}
// inspectorPort:false: the plugin otherwise serves /__debug (a devtools redirect for the workerd inspector) on the public dev port, before the Worker and unlimited.
// docsSite: the public /docs pages, rendered from docs/site.json and docs/*.md at build time, never in the Worker or the browser.
export default defineConfig(({ command, isPreview }) => ({ server: { fs: {
 // Runtime imports need the public manifest and maintained portability source.
 // Allow only those paths, never scripts or the checkout root; private settings
 // and archives remain outside the file allowlist and under the denies below.
 allow: ['src', 'public', 'node_modules', 'seed.json', 'node_modules/@runeditrun/rer/modules/portability'],
 deny: ['**/.rer/**', '**/.seed/**', '**/exports/**', '**/*.rer'],
} }, plugins: [
 demoSockets(),
 developmentImportDiagnostics(),
 cloudflare({ inspectorPort: false, viteEnvironment: { name: 'ssr' }, persistState: { path: process.env.RER_STATE_DIR ?? '.wrangler/state' }, config: command === 'serve' && !isPreview ? { main: './src/server.dev.ts', assets: { binding: 'ASSETS', run_worker_first: true }, ...(local ? { vars: { ...local, ...gate('RER_DEV_KEY'), ...gate('RER_DEV_IDENTITY'), ...gate('RER_DEMO'), ...gate('RER_DEMO_EXPIRES') } } : {}) } : local ? { vars: local } : {} }),
 docsSite(), tanstackStart(), react(),
 // Refuses a build whose output (public/ copies included) holds an installation archive.
 archiveOutputGuard(),
] }))
