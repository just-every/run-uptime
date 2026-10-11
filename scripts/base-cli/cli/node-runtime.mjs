import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { dirname, delimiter, resolve } from 'node:path';
import { projectNodePin, installedRuntime } from './node-runtime-discovery.mjs';
import { downloadRuntime } from './node-runtime-download.mjs';
import { missing, RerError } from './errors.mjs';

import { shellQuote } from './node-runtime-cache.mjs';
function repair(version, options) {
 return `npm exec --yes --package=node@${version} -- node ${[resolve(process.argv[1]), options.verb, '--cwd', options.cwd].map(shellQuote).join(' ')}`;
}

export async function selectNodeRuntime(options, argv, out) {
 // Inspection keeps its read-only contract, and stop works without tool setup.
 if (['describe', 'check', 'doctor'].includes(options.verb) || options.stop) return undefined;
 const version = await projectNodePin(options.cwd);
 if (!version || process.versions.node === version) return undefined;
 const command = repair(version, options);
 if (process.env.RER_NODE_AUTO === '0') throw missing(`Node ${version} is required; automatic selection is disabled by RER_NODE_AUTO=0. Run: ${command} (repeat any original options privately).`);
 const cancellation = new AbortController();
 let termination, child;
 const handlers = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, () => {
  termination = signal; cancellation.abort(); if (child) child.kill(signal);
 }]));
 for (const [signal, handler] of handlers) process.on(signal, handler);
 try {
  let binary = await installedRuntime(version);
  if (termination) return { exitCode: termination === 'SIGINT' ? 130 : 143 };
  if (!binary) {
   try { binary = await downloadRuntime(version, cancellation.signal); }
   catch (error) {
    if (termination) return { exitCode: termination === 'SIGINT' ? 130 : 143 };
    if (error instanceof RerError) throw error;
    const reason = /unavailable on this platform/.test(error.message) ? error.message : /checksum/.test(error.message) ? 'Official release checksum verification failed.' : 'The exact official release could not be acquired within 60 seconds; check the connection and available disk space.';
    throw missing(`Node ${version} is required. ${reason} With network access, run: ${command} (repeat any original options privately).`);
   }
  }
  const message = `Using project Node ${version} (current Node ${process.versions.node}).`;
  if (options.json) out.event('node-selection', { versionSelected: version, previousVersion: process.versions.node, message });
  else out.human(message);
  child = spawn(binary, [...process.execArgv, process.argv[1], ...argv], {
   cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, PATH: dirname(binary) + delimiter + (process.env.PATH ?? '') },
  });
  const result = await new Promise((resolve, reject) => {
   child.once('error', reject);
   child.once('exit', (code, signal) => resolve({ exitCode: code ?? (signal && constants.signals[signal] ? 128 + constants.signals[signal] : 1) }));
  });
  return result;
 } finally { for (const [signal, handler] of handlers) process.off(signal, handler); }
}
