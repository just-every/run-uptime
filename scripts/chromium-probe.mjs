import assert from 'node:assert/strict';
import {chromium, firefox, webkit} from 'playwright';

const engines = {chromium, firefox, webkit};
const requested = [...new Set(['chromium', ...process.argv.slice(2)])];
for (const name of requested) {
  assert.ok(Object.hasOwn(engines, name), `Unsupported browser: ${name}`);
}

for (const name of requested) {
  let browser;
  try {
    browser = await engines[name].launch({
      headless: true,
      timeout: 20_000,
      ...(name === 'chromium' ? {args: ['--use-mock-keychain', '--password-store=basic']} : {}),
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setContent('<!doctype html><title>Browser probe</title><main>Ready</main>');
    const result = await page.evaluate(() => ({
      title: document.title,
      text: document.querySelector('main').textContent,
      width: document.querySelector('main').getBoundingClientRect().width,
    }));
    assert.equal(result.title, 'Browser probe');
    assert.equal(result.text, 'Ready');
    assert.ok(result.width > 0, 'The page must render');
    assert.deepEqual(errors, [], 'The page must run without errors');
    console.log(`${name}: headless page probe passed`);
  } finally {
    await browser?.close();
  }
}
