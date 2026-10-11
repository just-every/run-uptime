import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { docsSite } from './src/site/docs/build/plugin.ts'

const origin = process.env.RER_DEV_ORIGIN
const local = origin ? {
 ...JSON.parse(readFileSync('data/local-secrets.json', 'utf8')),
 AUTH_ORIGIN: origin, UPTIME_ORIGIN: origin, UPTIME_LOCAL_REVIEW: 'true',
 MAIL_PROVIDER: 'development', UPTIME_SYNTHETIC_PORT: process.env.UPTIME_SYNTHETIC_PORT ?? '',
} : undefined
// Only `vite dev` loads the local-only entry and the checkout's dev key; a build keeps src/server.ts and never sees either
// (rer build checks its output for the dev layer).
const gate = (name: string) => process.env[name] ? { [name]: process.env[name] } : {}
// docsSite: the public /docs pages, rendered from docs/site.json and docs/*.md at build time, never in the Worker or the browser.
export default defineConfig(({ command, isPreview }) => ({ server: { fs: {
 allow: ['src', 'public', 'node_modules'],
 deny: ['**/.rer/**', '**/.seed/**', '**/exports/**', '**/*.rer'],
} }, plugins: [
 cloudflare({ viteEnvironment: { name: 'ssr' }, persistState: { path: '.wrangler/state' }, ...(local ? { config: command === 'serve' && !isPreview ? { main: './src/server.dev.ts', vars: { ...local, ...gate('RER_DEV_KEY'), ...gate('RER_DEV_IDENTITY') } } : { vars: local } } : {}) }),
 docsSite(), tanstackStart(), react(),
] }))
