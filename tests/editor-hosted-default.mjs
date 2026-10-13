import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

test('hosted new monitor starts with an empty required target and saves the operator URL', async () => {
  const browser = await chromium.launch({headless: true,args:['--disable-gpu'], ...(process.env.UPTIME_BROWSER_EXECUTABLE ? {executablePath: process.env.UPTIME_BROWSER_EXECUTABLE} : {})});
  try {
    const page = await browser.newPage();
    const markup = await readFile(new URL('../src/ui/editor.html', import.meta.url), 'utf8');
    let saved;
    await page.route('https://uptime.test/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      // The page's own scripts, served from public/ exactly as the console serves them.
      if (/^\/editor(?:\/[a-z-]+\.mjs|-[a-z]+\.mjs|\.js)$/.test(path)) return route.fulfill({contentType: 'text/javascript', body: await readFile(new URL(`../public${path}`, import.meta.url), 'utf8')});
      if (path === '/api/overview') return route.fulfill({json: {monitors: [], runner: {grants: [],runners:[{runnerId:'self-00000000-0000-4000-8000-000000000000',networkLabel:'owner-network',revokedAt:null}]}}});
      if (path === '/api/monitors' && request.method() === 'POST') {
        saved = request.postDataJSON();
        return route.fulfill({json: {id: 'hosted-monitor'}});
      }
      if (path === '/editor') return route.fulfill({contentType: 'text/html', body: `<!doctype html>${markup}<script src="/editor.js"></script>`});
      if (path === '/app') return route.fulfill({contentType: 'text/html', body: '<h1>Console</h1>'});
      throw new Error(`Unexpected test request: ${path}`);
    });
    await page.goto('https://uptime.test/editor');
    await page.waitForSelector('html.editor-ready');
    // A new monitor starts from a website address; the owner can skip it and fill in the form.
    await page.getByRole('button', {name: 'Fill in the form yourself', exact: true}).click();
    const urls = page.getByRole('textbox', {name: 'Target URL', exact: true});
    assert.equal(await urls.count(), 1, 'one responsive target control replaces duplicated hidden editor');
    for (const url of await urls.all()) {
      assert.equal(await url.inputValue(), '');
      assert.equal(await url.getAttribute('required'), '');
      assert.equal(await url.evaluate(input => input.validity.valueMissing), true);
    }
    await page.getByRole('textbox', {name: 'Monitor name', exact: true}).fill('Operator target');
    await urls.first().fill('https://status.example.org/check');
    assert.equal(await urls.first().inputValue(), 'https://status.example.org/check');
    await page.getByRole('button', {name: 'Save monitor'}).click();
    await page.waitForURL('https://uptime.test/app');
    assert.equal(saved.url, 'https://status.example.org/check');
    assert.equal(saved.name, 'Operator target');
    assert.deepEqual(saved.assertions, {status: 200});
  } finally { await browser.close(); }
});
