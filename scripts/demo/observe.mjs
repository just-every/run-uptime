// Observe admissions on the test host. Persist only admission diagnostics, never
// request headers, cookies, bodies, visitor addresses or the private tail URL.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { demoPlan } from '@runeditrun/rer/internal/modules/demo-host/plan.mjs'
const account = process.env.CLOUDFLARE_ACCOUNT_ID
if (account !== 'b20c0ca9cab0c2b70e13d7cf724b89bd') throw Error('Wrong demo account')
const declaration = JSON.parse(readFileSync('deploy-demo.json', 'utf8'))
if (declaration.domain !== 'test.run-uptime.com') throw Error('Only observe the test host')
const app = JSON.parse(readFileSync('deploy.json', 'utf8'))
const plan = demoPlan({ project: app.project, environment: 'demo-test', compatibilityDate: app.compatibilityDate, originVar: app.originVar, declaration, turnstileSiteKey: '1x00000000000000000000AA' })
const url = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${plan.worker}/tails`
const headers = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }
const response = await fetch(url, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(30000) })
const created = await response.json()
if (!response.ok || !created.success) throw Error(`Tail creation failed (${response.status})`)
mkdirSync('.rer/demo-observation', { recursive: true })
const record = row => appendFileSync('.rer/demo-observation/admissions.jsonl', JSON.stringify(row) + '\n')
const socket = new WebSocket(created.result.url, 'trace-v1')
socket.binaryType = 'arraybuffer'
try {
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(Error('Tail connection failed')), { once: true })
  })
  record({ startedAt: new Date().toISOString() })
  console.log('Observing test-host admissions for 15 minutes')
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 15 * 60 * 1000)
    socket.addEventListener('close', () => { clearTimeout(timer); reject(Error('Tail closed before observation completed')) }, { once: true })
    socket.addEventListener('message', event => {
      const value = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data))
      for (const log of value.logs ?? []) for (const message of log.message ?? []) {
        if (typeof message !== 'string') continue
        let data; try { data = JSON.parse(message) } catch { continue }
        if (data.event === 'demo_admitted') record({ timestamp: log.timestamp, event: data.event, at: data.at, correlation: data.correlation, agent: data.agent, network: data.network })
      }
    })
  })
  record({ finishedAt: new Date().toISOString() })
} finally {
  socket.close()
  const removed = await fetch(url + '/' + created.result.id, { method: 'DELETE', headers, signal: AbortSignal.timeout(30000) })
  if (!removed.ok) throw Error(`Tail removal failed (${removed.status})`)
}
// Native WebSocket/fetch pools can retain the runner after the tail is deleted.
process.exit(0)
