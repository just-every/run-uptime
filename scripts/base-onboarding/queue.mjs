import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
const portable = basename(dirname(fileURLToPath(import.meta.url))) === 'base-onboarding';
const queueURL = new URL(portable ? '../base-cli/modules/job-queue/' : '../modules/job-queue/', import.meta.url);
export const heavyVerbs = new Set(['install', 'setup', 'build', 'verify', 'dev', 'preview', 'deploy', 'release', 'export', 'import', 'installer']);
export async function queueLabel(root, verb, phase) {
 root = await realpath(root);
 let project='project';
 for(const file of ['OPERATIONS.json','package.json']){
  try{const value=JSON.parse(await readFile(join(root,file),'utf8')),name=value.project??value.name;
   if(typeof name==='string'&&/^@?[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?$/.test(name)){project=name;break;}
  }catch{}
 }

 return `${project} ${verb}:${phase} [${createHash('sha256').update(root).digest('hex').slice(0, 12)}]`;
}

function shellQuote(value) {
 if (process.platform === 'win32') return `"${String(value).replaceAll('"', '""')}"`;
 return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function waitingText(wait) {
 return `Waiting for heavy-job admission: ${wait.reason} (queue position ${wait.position}/${wait.queued}; ${wait.running} running). Run from the project root. Inspect the queue with: ${wait.statusCommandText}`;
}

export async function queuedCommand(command, args, options) {
 const { createQueue } = await import(new URL('index.mjs', queueURL));
 const { liveMembership } = await import(new URL('membership.mjs', queueURL));
 const statusCommand = [process.execPath, fileURLToPath(new URL('cli.mjs', queueURL)), 'status', '--json'];
 // An inherited credential-shaped PWD can redact an absolute project prefix.
 // Keep the human recipe relative while retaining the executable argv for tools.
 const statusCommandText = [basename(process.execPath), relative(options.cwd ?? process.cwd(), statusCommand[1]), ...statusCommand.slice(2)].map(shellQuote).join(' ');
 // Read the original caller's decision before an install synthesizes CI=true.
 if (options.originalCI === true || await liveMembership()) return null;
 const queue = await createQueue();
 try {
  return await queue.run([command, ...args], { ...options, kind: 'heavy', maxWait: 1200,
   onWaiting: (reason, detail) => {
    const wait = { ...(detail ?? { reason }), statusCommand, statusCommandText };
    if (typeof options.onWaiting === 'function') return options.onWaiting(wait);
    return options.report?.(waitingText(wait));
   },
   onStarted: () => options.report(`Heavy job admitted: ${options.label}`) });
 } finally { await queue.close(); }
}

export async function commandPolicy(){const {callerPolicy}=await import(new URL('policy.mjs',queueURL));return callerPolicy();}
