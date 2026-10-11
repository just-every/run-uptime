import { isAbsolute } from 'node:path';
import { inspectRequiredLoops } from '../operations/project-operations.mjs';
import { contained } from './project.mjs';
import { missing, refuse, RerError } from './errors.mjs';

export async function executeDeclared(project, options, store, signal) {
 if (project.descriptor.version !== 2) throw refuse('Execution requires explicit OPERATIONS v2 argv; version 1 remains inspection-only.');
 const command = project.descriptor.commands[options.verb];
 if (!command) throw refuse('No command declared for this verb. Add a real OPERATIONS v2 argv or use the project commands.');
 for (const input of command.inputs) await contained(project.root, input);
 const absent = project.descriptor.requiredEnvironment.filter(name => typeof process.env[name] !== 'string' || !process.env[name].trim());
 const loops = inspectRequiredLoops(project.descriptor, process.env);
 if (absent.length || loops.some(loop => !['ready', 'optional-disabled'].includes(loop.status))) throw missing(`Required declared inputs or loops are missing. See ${project.descriptor.documentation?.document ?? 'the project operating documentation'}.`);
 const [program, ...argv] = command.argv;
 if (!isAbsolute(program) && (program.includes('/') || program.includes('\\'))) await contained(project.root, program);
 if(['install','setup','build','verify','deploy','release','export','import'].includes(options.verb)) {
  try{await store.run('Running declared project command',program,[...argv,...options.forwarded],{cwd:project.root,signal});return {childExitCode:0,signal:null};}
  catch(error){const code=error.signal?({SIGINT:130,SIGTERM:143}[error.signal]??1):error.childExitCode??1;throw new RerError('child_failed','The declared command failed.',code,{childExitCode:error.childExitCode,signal:error.signal});}
 }
 const child = store.spawn('Running declared project command', program, [...argv, ...options.forwarded], { cwd: project.root, signal });
 const completion = new Promise(resolve => { child.once('error', () => resolve({ error: true })); child.once('close', (code, terminationSignal) => resolve({ code, signal: terminationSignal })); });
 await new Promise(resolve => { child.once('error', resolve); child.once('exit', resolve); });
 await store.stop(child);
 const result = await completion;
 if (result.error) throw missing('The declared command executable is unavailable. See the project runtime requirements.');
 const exitCode = result.signal ? ({ SIGINT: 130, SIGTERM: 143 }[result.signal] ?? 1) : result.code;
 if (exitCode !== 0) throw new RerError('child_failed', 'The declared command failed.', exitCode, { childExitCode: result.code, signal: result.signal });
 return { childExitCode: result.code, signal: result.signal };
}
