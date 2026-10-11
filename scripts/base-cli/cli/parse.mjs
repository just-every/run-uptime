import { resolve } from 'node:path';
import { commonFlags, verbs } from './contract.mjs';
import { invalid, refuse } from './errors.mjs';
const booleans = new Set(['--help', '--json', '--non-interactive', '--yes', '--dry-run', '--open', '--stop', '--no-queue', '--login']);
export const mailbox = value => typeof value === 'string' && value.length <= 254 && /^[a-zA-Z0-9.!+_%\-]+@[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)+$/.test(value);
export const loopback = host => ['127.0.0.1', 'localhost', '::1'].includes(host);
export const origin = (host, port) => `http://${host === '::1' ? '[::1]' : host}:${port}`;

export function parse(argv, cwd = process.cwd(), { independent = false, deferTail = false } = {}) {
 const [verb, ...args] = argv;
 if (!verb || verb === '--help') return { help: true };
 if (verb === 'release') return { verb, releaseArgs: args };
 // Independent projects own verb names; only the common wrapper flags apply
 // to unknown names. Profile resolution rejects undeclared commands later.
 if (!/^[a-z][a-z0-9-]*$/.test(verb)) throw invalid('Unknown rer command. Run rer --help.');
 const allowed = new Set(independent ? [...commonFlags,...(['install','setup','build','verify','deploy','release','export','import','dev','preview'].includes(verb)?['--no-queue']:[])] : verbs[verb]?.flags ?? commonFlags), options = { verb, cwd: resolve(cwd), forwarded: [], supplied: new Set() };
 let separator = false;
 for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (flag === '--') { if (separator) throw invalid('Use only one -- separator.'); separator = true; if (independent || deferTail) { options.forwarded = args.slice(i + 1); break; } continue; }
  if (separator && !flag.startsWith('--')) { options.forwarded.push(...args.slice(i)); break; }
  // pnpm run VERB -- FLAGS forwards the separator before wrapper flags.
  if (separator && !allowed.has(flag) && !flag.startsWith('--')) { options.forwarded.push(...args.slice(i)); break; }
  if (!allowed.has(flag)) {
   if(flag==='--strictPort')throw invalid('Unsupported --strictPort. Use --port PORT; strict port binding is automatic.');
   const suggestion=[...allowed].sort((a,b)=>distance(flag,a)-distance(flag,b))[0];
   throw invalid(`Unsupported flag ${/^--[a-zA-Z-]{1,40}$/.test(flag)?flag:'(invalid)'} for ${verb}.${suggestion?` Did you mean ${suggestion}?`:''} Run rer ${verb} --help.`);
  }
  if (options.supplied.has(flag)) throw invalid(`Repeated flag ${flag} for ${verb}. Run rer ${verb} --help.`);
  options.supplied.add(flag);
  const key = flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (booleans.has(flag)) options[key] = true;
  else {
   const value = args[++i];
   if (value === undefined || value.startsWith('--') || !value.trim()) throw invalid(`A value is required for ${flag}.`);
   options[key] = value;
  }
 }
 if (options.help) return options;
 if (deferTail) { options.cwd=resolve(cwd,options.cwd);return options; }
 if(options.stop && ['--port','--host','--idle-timeout','--no-queue','--as','--login'].some(flag=>options.supplied.has(flag)))throw invalid('--stop cannot be combined with start-only flags.');
 if(options.as!==undefined && (options.login || !/^[a-z][a-z0-9-]{0,39}$/.test(options.as)))throw invalid(options.login?'--as and --login cannot be combined.':'--as takes a persona name such as owner, signed-out or admin.');
 if(['dev','preview'].includes(verb) && !options.stop){
  const value=options.idleTimeout??process.env.RER_SERVER_IDLE_SECONDS??'1800';
  if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(Number(value)))throw invalid('Idle timeout must be positive integer seconds.');
  options.idleTimeout=Number(value);
 }
 if (options.port !== undefined) {
  if (!/^\d+$/.test(options.port) || Number(options.port) < 1 || Number(options.port) > 65535) throw invalid('Port must be a decimal integer from 1 to 65535.');
  options.port = Number(options.port);
 }
 if (options.host !== undefined && !loopback(options.host)) throw refuse('Host must be exactly 127.0.0.1, localhost or ::1.');
 if (options.ownerEmail !== undefined) { if (!mailbox(options.ownerEmail)) throw invalid('Provide a valid plain owner mailbox.'); options.ownerEmail = options.ownerEmail.toLowerCase(); }
 if (options.ownerName !== undefined && (options.ownerName.length > 200 || /[\p{Cc}\p{Cf}]/u.test(options.ownerName))) throw invalid('Provide a valid owner name.');
 if (options.target !== undefined && !['local', 'remote'].includes(options.target)) throw invalid('Target must be local or remote.');
 if (options.profile !== undefined && options.profile !== 'first-party') throw invalid('The supported explicit profile is first-party.');
 if (options.environment !== undefined && !/^[a-z][a-z0-9-]{0,39}$/.test(options.environment)) throw invalid('Provide a valid deployment environment name.');
 if (options.origin !== undefined) {
  let url; try { url = new URL(options.origin); } catch { throw invalid('Provide a valid credential-free origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw invalid('Provide a credential-free HTTP origin without a path.');
 }
 if (options.cwd !== undefined) options.cwd = resolve(cwd, options.cwd);
 return options;
}

export function help(verb) {
 if (!verb) return `Usage: rer VERB [FLAGS]\nCommands: ${Object.keys(verbs).join(', ')}, release\nRun rer VERB --help for flags.\n`;
 return `Usage: rer ${verb} [FLAGS]\nFlags: ${(verbs[verb]?.flags ?? commonFlags).join(', ')}\n${verbs[verb]?.effects ?? 'Execute the declared OPERATIONS v2 argv with explicit arguments after --.'}\n`;
}

function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length];}
