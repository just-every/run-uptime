// Managed packaging uses public mail placeholders; the demo receives its own
// mail settings at runtime. Change only run-demo's disposable image checkout.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseJsonc } from '@runeditrun/rer/jsonc'
const file = 'wrangler.jsonc'
const config = parseJsonc(readFileSync(file, 'utf8'))
for (const { binding } of JSON.parse(readFileSync('deploy.json', 'utf8')).secrets ?? []) {
  if (!binding.startsWith('MAIL_') || !Object.hasOwn(config.vars ?? {}, binding)) continue
  const value = config.vars[binding]
  if (value !== '' && !(binding === 'MAIL_PROVIDER' && value === 'rer')) throw Error(`Unexpected demo image mail variable: ${binding}`)
  delete config.vars[binding]
}
writeFileSync(file, JSON.stringify(config, null, 2) + '\n')
