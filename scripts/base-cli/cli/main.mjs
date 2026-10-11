import { parse, help } from './parse.mjs';
import { output } from './output.mjs';
import { invalid, RerError } from './errors.mjs';
import { resolveProject, parsingProfile } from './project.mjs';
import { check, describe } from './inspect.mjs';
import { selectNodeRuntime } from './node-runtime.mjs';

export async function main(argv = process.argv.slice(2)) {
 // Every runtime a seed's hooks start inherits this: Wrangler and the Cloudflare
 // Vite plugin otherwise serve the Local Explorer, which reads and writes the
 // store without the dev key.
 process.env.X_LOCAL_EXPLORER = 'false';
 let options = { verb: argv[0], json: argv.includes('--json') }, out = output(options);
 try {
  options = parse(argv,process.cwd(),{deferTail:true}); out = output(options);
  if (options.help) return showHelp(options,out);
  if (options.verb === 'release') return (await import('./release.mjs')).dispatchRelease(options.releaseArgs);
  const independent = await parsingProfile(options.cwd)==='independent'&&!['describe','check','doctor'].includes(options.verb);
  options=parse(argv,process.cwd(),{independent});out=output(options);
  if (options.help) return showHelp(options,out);
  if (!independent && options.forwarded.length) throw invalid('First-party commands accept only the documented flags, without forwarded arguments.');
  if(options.noQueue){const {shared}=await import('./shared.mjs');const {commandPolicy}=await shared('queue.mjs');const policy=await commandPolicy();try{if(!policy.ci)throw invalid('--no-queue requires the original caller CI=true.');}finally{await policy.close();}}
  const runtime = await selectNodeRuntime(options, argv, out);
  if (runtime) return runtime.exitCode;
  const project = await resolveProject(options.cwd);
  if (project.profile === 'independent' && !['describe', 'check', 'doctor'].includes(options.verb)) options = parse(argv, process.cwd(), { independent: true });
  else if (options.forwarded.length) throw invalid('First-party commands accept only the documented flags, without forwarded arguments.');
  out = output(options);
  if (options.verb === 'describe') { const result = await describe(project); out.human(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2)); return 0; }
  if (options.verb === 'check') {
   const result = await check(project, options.profile);
   if (!options.json) for (const clause of result.clauses.filter(c => !c.ok)) out.human(`${clause.id}: ${clause.message}`);
   out.result(result.ok, result.ok ? 0 : 1, { clauses: result.clauses }); return result.ok ? 0 : 1;
  }
  if (options.verb === 'doctor') {
   const result = await (await import('./lifecycle.mjs')).runCommand(project, options, out);
   if (!options.json) out.human(JSON.stringify(result, null, 2));
   out.result(result.ok, result.ok ? 0 : 3, { diagnostics: result }); return result.ok ? 0 : 3;
  }
  const bounded=await (await import('./bounded.mjs')).boundedCommand(project,options,argv,out);
  if(bounded)return bounded.exitCode;
  let result;
  if (options.verb === 'reset' && project.profile === 'first-party') result = await (await import('./local.mjs')).reset(project, options, out);
  else result = await (await import('./lifecycle.mjs')).runCommand(project, options, out);
  out.result(true, 0, result); return 0;
 } catch (error) {
  const failure = error instanceof RerError ? error : new RerError('command_failed', 'Command failed; inspect the project operating documentation.', 1);
  out.error(failure); out.result(false, failure.exitCode, failure.childExitCode === undefined ? {} : { childExitCode: failure.childExitCode, signal: failure.signal }); return failure.exitCode;
 }
}

function showHelp(options,out) {
 if(options.json){out.event('help',{usage:help(options.verb)});out.result(true,0);}else out.human(help(options.verb));
 return 0;
}
