#!/usr/bin/env node
import { createQueue } from './index.mjs';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const usage = 'job-queue run --kind heavy [--label TEXT] [--priority owner|normal|background] [--max-wait SECONDS] [--json] -- <command> [args]\njob-queue status|drain [--json] [--max-wait SECONDS]';
export function parse(args) {
  const verb = args.shift(), options = {};
  while (args.length && args[0] !== '--') {
    const flag = args.shift();
    if (flag === '--json') options.json = true;
    else if (['--kind', '--label', '--priority', '--max-wait'].includes(flag)) {
      if (!args.length || args[0].startsWith('--')) throw Error(`Missing value for ${flag}`);
      options[{ '--kind': 'kind', '--label': 'label', '--priority': 'priority', '--max-wait': 'maxWait' }[flag]] = args.shift();
    } else throw Error(`Unknown option ${flag}`);
  }
  if (options.maxWait !== undefined) {
    options.maxWait = Number(options.maxWait);
    if (!Number.isFinite(options.maxWait) || options.maxWait < 0) throw Error('max-wait must be nonnegative seconds');
  }
  if (!['run', 'status', 'drain'].includes(verb)) throw Error(usage);
  if (verb === 'run' && (args.shift() !== '--' || !args.length || options.kind !== 'heavy')) throw Error(usage);
  if (verb !== 'run' && args.length) throw Error(usage);
  return { verb, options, command: args };
}

function render(view) {
  const elapsed = job => Math.floor((Date.now() - (job.startedAt ?? job.enqueuedAt)) / 1000);
  return [`Load ${view.resources.load.toFixed(2)}; free memory ${(view.resources.freeMemoryBytes / 1024 ** 3).toFixed(2)} GiB; slots ${view.running.length}/${view.config.slots}`,
    ...view.running.map(job => `Running: ${job.label} | ${job.repository} | ${elapsed(job)}s`),
    ...view.queued.map((job, index) => `Queued ${index + 1}: ${job.label} (${job.priority}) | ${job.repository} | ${elapsed(job)}s`),
    `Admission: ${view.admissionReason}`].join('\n');
}

function shellQuote(value) {
  if (process.platform === 'win32') return `"${String(value).replaceAll('"', '""')}"`;
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function main() {
  const { verb, options, command } = parse(process.argv.slice(2));
  const queue = await createQueue();
  try {
    let result;
    if (verb === 'run') {
      const statusCommand = [process.execPath, fileURLToPath(import.meta.url), 'status', '--json'].map(shellQuote).join(' ');
      result = await queue.run(command, { ...options, onWaiting: (reason, details) => {
        if (!options.json) console.error(`Queued (${details.position}/${details.queued}): ${reason}. Inspect the queue with: ${statusCommand}`);
      } });
      if (result.timedOut) console.error(`Job queue max-wait expired: ${result.reason} (exit ${result.code})`);
      if (result.error) console.error(result.error);
      // Command stdout is preserved; JSON control output goes to stderr for run.
      if (options.json) console.error(JSON.stringify(result));
    } else {
      result = verb === 'status' ? await queue.status() : await queue.drain(options);
      console.log(options.json ? JSON.stringify(result) : render(result));
      if (result.timedOut) console.error('Job queue drain max-wait expired (exit 75)');
    }
    process.exitCode = result.code ?? 0;
  } finally { await queue.close(); }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error(error.message); process.exitCode = 64; });
