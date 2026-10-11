import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseJsonc } from './jsonc.mjs';

// `rer dev` runs the project's declared Cron Triggers (wrangler `triggers.crons`)
// on their schedule by calling the local runtime's scheduled test endpoint, so
// alerts, retries and checks behave on the owner's computer as they do deployed.

const fields = [[0, 59], [0, 23], [1, 31], [1, 12], [1, 7]];

function field(text, [low, high]) {
 const values = new Set();
 for (const part of text.split(',')) {
  const match = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
  if (!match) throw new Error(`Unsupported cron field "${text}"`);
  const step = match[4] === undefined ? 1 : Number(match[4]);
  const start = match[1] ? low : Number(match[2]), end = match[1] ? high : match[3] === undefined ? (match[4] === undefined ? start : high) : Number(match[3]);
  if (!step || start < low || end > high || start > end) throw new Error(`Cron field "${text}" is out of range`);
  for (let value = start; value <= end; value += step) values.add(value);
 }
 return values;
}

// Same grammar the deploy kit accepts: five numeric fields with lists, ranges and
// steps, in UTC. Day of week counts 1 (Sunday) to 7 (Saturday), as Cloudflare does.
export function parseCron(expression) {
 const parts = expression.trim().split(/\s+/);
 if (parts.length !== 5) throw new Error(`Cron "${expression}" needs five fields`);
 const [minute, hour, day, month, weekday] = parts.map((part, index) => field(part, fields[index]));
 return { minute, hour, day, month, weekday, dayRestricted: parts[2] !== '*', weekdayRestricted: parts[4] !== '*' };
}

export function cronMatches(cron, date) {
 const parsed = typeof cron === 'string' ? parseCron(cron) : cron;
 const day = parsed.day.has(date.getUTCDate()), weekday = parsed.weekday.has(date.getUTCDay() + 1);
 const days = parsed.dayRestricted && parsed.weekdayRestricted ? day || weekday : day && weekday;
 return parsed.minute.has(date.getUTCMinutes()) && parsed.hour.has(date.getUTCHours()) && parsed.month.has(date.getUTCMonth() + 1) && days;
}

// The Cron Triggers a project declares in wrangler.jsonc or wrangler.json.
export async function declaredCrons(root) {
 for (const name of ['wrangler.jsonc', 'wrangler.json']) {
  let text;
  try { text = await readFile(join(root, name), 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  let config;
  try { config = parseJsonc(text); }
  catch (error) {
   throw new Error(`${name}: ${error.message}`, { cause: error });
  }
  const crons = config.triggers?.crons ?? [];
  if (!Array.isArray(crons) || crons.some(cron => typeof cron !== 'string')) throw new Error(`${name} triggers.crons must be a list of cron expressions.`);
  for (const cron of crons) parseCron(cron);
  return crons;
 }
 return [];
}

// Fire each matching cron at the start of its minute until `signal` aborts.
// `report` receives one record per run: { cron, ok, status?, ms, error? }.
export function runScheduled({ crons, url, signal, report, now = () => new Date(), fetchImpl = fetch, runTimeout = 300000 }) {
 const parsed = crons.map(cron => [cron, parseCron(cron)]), running = new Set();
 let timer;
 const settled = new Promise(resolve => {
  const finish = () => { clearTimeout(timer); resolve(); };
  if (signal.aborted) return finish();
  signal.addEventListener('abort', finish, { once: true });
  const wait = () => { timer = setTimeout(tick, 60000 - (now().getTime() % 60000) + 250); };
  const tick = () => {
   const minute = now();
   for (const [cron, expression] of parsed) if (cronMatches(expression, minute)) void run(cron);
   wait();
  };
  async function run(cron) {
   if (running.has(cron)) { report({ cron, ok: false, skipped: true, error: 'previous run still in progress' }); return; }
   running.add(cron);
   const started = Date.now();
   try {
    const response = await fetchImpl(`${url}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent(cron)}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(runTimeout)]) });
    await response.body?.cancel();
    report({ cron, ok: response.ok, status: response.status, ms: Date.now() - started });
   } catch (error) {
    if (!signal.aborted) report({ cron, ok: false, ms: Date.now() - started, error: error.name === 'TimeoutError' ? 'timed out' : 'the runtime did not answer' });
   } finally { running.delete(cron); }
  }
  wait();
 });
 return settled;
}
