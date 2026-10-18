// Private one-shot renderer. Raw response markup is parsed inertly and never rendered.
import net from 'node:net';
import {rm} from 'node:fs/promises';
import {descendants, killFolderHolders} from './flow/processes.mjs';

const base = process.argv[2];
let browser, context, finishing = false, timer;
const lifeline = new net.Socket({fd: 3, readable: true, writable: false});
lifeline.on('error', () => {});
process.stdout.on('error', () => {});

async function finish(result) {
  if (finishing) return;
  finishing = true;
  clearTimeout(timer);
  // Cleanup also runs when launch is in progress or the runner is killed outright.
  const forceExit = setTimeout(() => process.exit(1), 1500);
  await Promise.race([browser?.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 250))]);
  for (const pid of (await descendants(process.pid)).reverse()) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  await killFolderHolders(base);
  await rm(base, {recursive: true, force: true, maxRetries: 3, retryDelay: 50}).catch(() => {});
  if (result) await new Promise(resolve => process.stdout.write(JSON.stringify(result), resolve));
  clearTimeout(forceExit);
  process.exit(0);
}

lifeline.once('close', () => { void finish(); });
lifeline.resume();
process.once('SIGTERM', () => { void finish({unavailable: 'capture_aborted'}); });
process.once('SIGINT', () => { void finish({unavailable: 'capture_aborted'}); });
process.on('uncaughtException', () => { void finish({unavailable: 'capture_failed'}); });
process.on('unhandledRejection', () => { void finish({unavailable: 'capture_failed'}); });
timer = setTimeout(() => { void finish({unavailable: 'capture_timeout'}); }, 8500);

async function readJob() {
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    // Request secrets can be as large as the bounded body, with JSON escaping.
    if (bytes > 14 * 1024 * 1024) throw Error();
    chunks.push(chunk);
  }
  const job = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (typeof job.body !== 'string' || Buffer.byteLength(job.body) > 16384) throw Error();
  return job;
}

// Runs in an empty page. DOMParser documents are inert; no returned source node is
// attached to the live document. Network and script execution are blocked first.
function inertTree(body) {
  const document = new DOMParser().parseFromString(body, 'text/html');
  const safe = new Set('h1 h2 h3 h4 h5 h6 p div section article main header footer aside blockquote pre code strong b em i u s small sub sup span br hr ul ol li dl dt dd table caption thead tbody tfoot tr th td'.split(' '));
  const drop = new Set('script style noscript template iframe frame frameset object embed applet img picture source audio video track canvas svg math form input textarea select option button link meta base head'.split(' '));
  let count = 0;
  const walk = (node, depth) => {
    if (++count > 12000 || depth > 100) throw Error();
    if (node.nodeType === 3) return {text: node.nodeValue};
    if (node.nodeType !== 1 && node.nodeType !== 9) return null;
    const tag = node.localName;
    if (drop.has(tag)) return null;
    return {tag: safe.has(tag) ? tag : 'div', children: [...node.childNodes].map(child => walk(child, depth + 1)).filter(Boolean)};
  };
  return walk(document.body, 0);
}

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Children are scrubbed first. Aggregate text then catches a mask split across
// arbitrary markup boundaries; replace that parent's contents if it changes.
function scrubTree(node, redact) {
  if (Object.hasOwn(node, 'text')) return {text: redact(node.text)};
  const children = node.children.map(child => scrubTree(child, redact));
  const textOf = value => Object.hasOwn(value, 'text') ? value.text : value.children.map(textOf).join('')+(/^(?:h[1-6]|p|div|section|pre|li|tr)$/.test(value.tag)?'\n':'');
  const aggregate = children.map(textOf).join('');
  const redacted = redact(aggregate);
  return {tag: node.tag, children: redacted === aggregate ? children : [{text: redacted}]};
}

function htmlOf(node) {
  if (Object.hasOwn(node, 'text')) return escape(node.text);
  if (node.tag === 'br' || node.tag === 'hr') return `<${node.tag}>`;
  return `<${node.tag}>${node.children.map(htmlOf).join('')}</${node.tag}>`;
}

async function capture() {
  const job = await readJob();
  if (finishing) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void finish({unavailable: 'capture_timeout'}); }, Math.min(8500, job.deadlineMs));
  let chromium, redactSnapshotText;
  try {
    ({chromium} = await import('playwright'));
    ({redactSnapshotText} = await import('../../src/domain/failure-snapshot.mjs'));
    if (typeof redactSnapshotText !== 'function') throw Error();
    browser = await chromium.launch({headless: true, timeout: 6500,
      args: ['--use-mock-keychain', '--password-store=basic'],
      env: {HOME: process.env.HOME, TMPDIR: base, LANG: 'C.UTF-8',
        ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? {PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH} : {})}});
  } catch { return finish({unavailable: 'browser_unavailable'}); }
  if (finishing) return;
  context = await browser.newContext({viewport: {width: 1000, height: 700}, deviceScaleFactor: 1,
    javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false, locale: 'en-US', timezoneId: 'UTC'});
  await context.route('**/*', route => route.abort('blockedbyclient'));
  await context.routeWebSocket('**/*', socket => socket.close());
  const page = await context.newPage();
  page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
  page.on('download', download => { void download.cancel().catch(() => {}); });
  context.on('page', popup => { if (popup !== page) void popup.close().catch(() => {}); });
  const tree = await page.evaluate(inertTree, job.body);
  const redacted = scrubTree(tree, text => redactSnapshotText(text, {
    requestSecrets: job.requestSecrets, masks: job.masks, allowEmail: job.allowEmail,
  }));
  // Only fixed local CSS and escaped, already-redacted semantic HTML reach pixels.
  const html = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'
    + '<style>html{background:#fff;color:#17202a;font:16px/1.5 sans-serif}body{margin:28px;overflow-wrap:anywhere}*{box-sizing:border-box;max-width:100%}pre,code{white-space:pre-wrap}pre{padding:12px;background:#f4f5f6}table{border-collapse:collapse}td,th{border:1px solid #d5d9dd;padding:6px 10px;text-align:left}h1,h2,h3{line-height:1.2}hr{border:0;border-top:1px solid #d5d9dd}</style></head><body>'
    + htmlOf(redacted) + '</body></html>';
  await page.setContent(html, {waitUntil: 'domcontentloaded', timeout: 3000});
  const png = await page.screenshot({type: 'png', fullPage: false, animations: 'disabled', timeout: 3000});
  if (png.length > 65536) return finish({unavailable: 'capture_limit'});
  return finish({format: 'png', width: 1000, height: 700, data: png.toString('base64')});
}

capture().catch(() => { void finish({unavailable: 'capture_failed'}); });
