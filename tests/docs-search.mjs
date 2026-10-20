import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import deployment from '../deploy.json' with { type: 'json' };
import { chromium } from 'playwright';
import { dimensions } from '../src/base/modules/site/docs-search/index-build.mjs';
import { buildSearchArtifacts } from '../src/base/modules/site/docs-search/artifacts.mjs';

// Only the paid inference edge is fake. Corpus generation, retrieval, client,
// Worker and native static assets all use the real site implementation.
function vectors(text) {
  return { shape: [text.length, dimensions], data: text.map(value => {
    const vector = Array(dimensions).fill(0);
    const heading = value.replace(/^Represent this sentence for searching relevant passages: /, '').split('\n')[0].split(' > ').at(-1);
    for (const word of heading.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      let hash = 0;
      for (const letter of word) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
      vector[hash % dimensions] += 1;
    }
    return vector;
  }) };
}

test('a reader searches docs, dismisses results and follows a heading by keyboard on desktop and mobile', { timeout: 120000 }, async () => {
  const require = createRequire(import.meta.resolve('wrangler'));
  const { Miniflare, convertV4MiniflareOptions } = await import(require.resolve('miniflare'));
  execFileSync('pnpm', ['exec', 'rer', 'build', '--site', '--no-queue'], { stdio: 'pipe', env: { ...process.env, CI: 'true' } });
  const output = await mkdtemp(resolve('.rer/docs-search-test-'));
  let mf;
  let browser;
  try {
    await buildSearchArtifacts({ corpus: '.rer/docs-search/corpus.json', assets: 'dist/site', output }, { embed: async (_model, { text }) => vectors(text) });
    mf = new Miniflare(convertV4MiniflareOptions({ workers: [
      { name: 'site', modules: true, scriptPath: resolve(output, 'worker.mjs'), compatibilityDate: deployment.compatibilityDate,
        assets: { directory: resolve('dist/site'), binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true }, assetConfig: { html_handling: 'auto-trailing-slash', not_found_handling: '404-page' } },
        serviceBindings: { AI: 'inference' } },
      { name: 'inference', modules: true, compatibilityDate: deployment.compatibilityDate,
        script: `import {WorkerEntrypoint} from 'cloudflare:workers';const dimensions=${dimensions};const vectors=${vectors.toString()};export default class extends WorkerEntrypoint {async run(_model,{text}){return vectors(text)}}` },
    ] }));
    const origin = (await mf.ready).origin;
    browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const page = await context.newPage();
        const opened = await page.goto(`${origin}/docs`);
        assert.equal(opened.status(), 200, await opened.text());
        await page.keyboard.press('/');
        const input = page.locator(width === 1440 ? '#docs-search-sidebar' : '#docs-search-menu');
        await input.waitFor({ state: 'visible' });
        assert.ok(await input.evaluate(element => element === document.activeElement), `${width}: slash focuses search`);
        const query = 'Start with a website';
        await input.fill(query);
        const list = page.locator(`#${await input.getAttribute('aria-controls')}`);
        const result = list.getByRole('option', { includeHidden: true }).filter({ hasText: query });
        await result.waitFor({ state: 'visible' });
        const href = await result.getAttribute('href');
        const target = new URL(href);
        assert.equal(target.origin, origin);
        assert.equal(target.pathname.replace(/\/$/, ''), '/docs/install');
        assert.ok(target.hash, `${width}: result links directly to a heading`);

        await input.press('ArrowDown');
        assert.equal(await input.getAttribute('aria-activedescendant'), await result.getAttribute('id'));
        assert.equal(await result.getAttribute('aria-selected'), 'true');
        await input.press('Escape');
        assert.equal(await input.getAttribute('aria-expanded'), 'false');
        assert.equal(await input.getAttribute('aria-activedescendant'), null);
        assert.equal(await result.getAttribute('aria-selected'), 'false');
        assert.equal(await list.isVisible(), false);
        assert.equal(await input.inputValue(), query);
        assert.ok(await input.evaluate(element => element === document.activeElement), `${width}: Escape retains focus`);

        await input.press('ArrowDown');
        assert.equal(await input.getAttribute('aria-expanded'), 'true');
        assert.equal(await input.getAttribute('aria-activedescendant'), await result.getAttribute('id'));
        await input.press('Enter');
        await page.waitForURL(href);
        const heading = page.locator(target.hash);
        await heading.waitFor({ state: 'visible' });
        assert.equal((await heading.textContent()).trim(), query);
        assert.ok(await page.getByRole('heading', { name: 'Install Uptime', exact: true }).isVisible());
      } finally {
        await context.close();
      }
    }
  } finally {
    try { await browser?.close(); }
    finally {
      try { await mf?.dispose(); }
      finally { await rm(output, { recursive: true, force: true }); }
    }
  }
});
