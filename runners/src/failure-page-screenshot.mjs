// Render only the HTTP response already received; this never navigates to its target.
import {spawn} from 'node:child_process';
import {chmod, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir, userInfo} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {killTree, killFolderHolders} from './flow/processes.mjs';

const childFile = fileURLToPath(new URL('./failure-page-child.mjs', import.meta.url));
const BODY_LIMIT = 16384, PNG_LIMIT = 65536, WALL_MS = 10000;
const OUTPUT_LIMIT = Math.ceil(PNG_LIMIT / 3) * 4 + 512;
const codes = new Set(['capture_limit', 'browser_unavailable', 'capture_timeout', 'capture_aborted', 'capture_failed', 'capture_invalid']);
const unavailable = code => ({unavailable: code});

function validJob(body, requestSecrets, masks, allowEmail) {
  return typeof body === 'string' && Buffer.byteLength(body) <= BODY_LIMIT && typeof allowEmail === 'boolean'
    && Array.isArray(requestSecrets) && requestSecrets.length <= 128
    && requestSecrets.every(value => typeof value === 'string' && value.length <= BODY_LIMIT)
    && Array.isArray(masks) && masks.length <= 20
    && masks.every(value => typeof value === 'string' && value.length > 0 && value.length <= 128);
}

function resultFrom(output) {
  try {
    const value = JSON.parse(output);
    if (Object.keys(value).length === 1 && codes.has(value.unavailable)) return value;
    if (Object.keys(value).sort().join(',') !== 'data,format,height,width' || value.format !== 'png'
      || value.width !== 1000 || value.height !== 700 || typeof value.data !== 'string'
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)) return unavailable('capture_invalid');
    const png = Buffer.from(value.data, 'base64');
    if (png.length > PNG_LIMIT) return unavailable('capture_limit');
    if (png.length < 33 || png.toString('base64') !== value.data
      || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || png.readUInt32BE(8) !== 13 || png.toString('ascii', 12, 16) !== 'IHDR'
      || png.readUInt32BE(16) !== 1000 || png.readUInt32BE(20) !== 700) return unavailable('capture_invalid');
    return value;
  } catch { return unavailable('capture_invalid'); }
}

export async function captureFailurePage({body, requestSecrets = [], masks = [], allowEmail = false, signal} = {}) {
  const started = Date.now();
  if (signal?.aborted) return unavailable('capture_aborted');
  if (!validJob(body, requestSecrets, masks, allowEmail)) return unavailable('capture_limit');
  // Chromium must use the signed-in account HOME on macOS, never a replacement home.
  if (!process.env.HOME || (process.platform === 'darwin' && process.env.HOME !== userInfo().homedir)) return unavailable('browser_unavailable');
  let base, child, timer, abortTimer, output = '', reason;
  const hardStop = () => { if (child?.pid) void killTree(child.pid); };
  const abort = () => {
    reason = 'capture_aborted';
    try { child?.kill('SIGTERM'); } catch {}
    abortTimer ??= setTimeout(hardStop, 500);
  };
  try {
    base = await mkdtemp(join(tmpdir(), 'uptime-failure-page-'));
    await chmod(base, 0o700);
    if (signal?.aborted) return unavailable('capture_aborted');
    const remaining = WALL_MS - (Date.now() - started);
    if (remaining <= 0) return unavailable('capture_timeout');
    child = spawn(process.execPath, [childFile, base], {
      cwd: base, detached: true, stdio: ['pipe', 'pipe', 'ignore', 'pipe'],
      env: {HOME: process.env.HOME, TMPDIR: base, LANG: 'C.UTF-8',
        ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? {PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH} : {})},
    });
    const exited = new Promise(resolve => { child.once('close', resolve); child.once('error', () => { reason = 'capture_failed'; resolve(); }); });
    child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => {
      if (reason) return;
      if (Buffer.byteLength(output) + chunk.length > OUTPUT_LIMIT) { reason = 'capture_limit'; hardStop(); return; }
      output += chunk.toString('utf8');
    });
    timer = setTimeout(() => { reason = 'capture_timeout'; hardStop(); }, remaining);
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
    child.stdin.end(JSON.stringify({body, requestSecrets, masks, allowEmail, deadlineMs: Math.max(1, remaining - 750)}));
    await exited;
    return reason ? unavailable(reason) : resultFrom(output);
  } catch { return unavailable(signal?.aborted ? 'capture_aborted' : 'capture_failed'); }
  finally {
    clearTimeout(timer); clearTimeout(abortTimer);
    signal?.removeEventListener('abort', abort);
    if (child?.pid) await killTree(child.pid);
    child?.stdio[3]?.destroy();
    if (base) {
      await killFolderHolders(base);
      await rm(base, {recursive: true, force: true, maxRetries: 3, retryDelay: 50}).catch(() => {});
    }
  }
}
