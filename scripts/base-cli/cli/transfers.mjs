import { contained } from './project.mjs';
import { missing, refuse } from './errors.mjs';
import { publicPath } from './server-proxy.mjs';
export async function transfer(project, options, signal, custody) {
 const direction = options.verb, file = direction === 'export' ? options.output : options.input;
 if (!file) throw missing(`Provide --${direction === 'export' ? 'output' : 'input'} FILE.`);
 if (direction === 'import' && !options.yes) throw refuse('Import requires explicit --yes confirmation.');
 const target = options.target ?? 'local', api = project.adapter.portability;
 if (!api || typeof api[direction] !== 'function' || (target === 'remote' && api.remote !== true)) throw refuse(`Complete ${target} ${direction} is unsupported: the reviewed portability API and binding policy must be adopted first.`);
 const path = await contained(project.root, file, { optional: direction === 'export', privateFile: direction === 'import' });
 // rer dev serves the checkout; an archive holds the whole installation's data.
 if (direction === 'export' && publicPath('/' + file)) throw refuse(`Save the archive under exports/ or give it a .rer name: rer dev would serve ${file} to anyone who reaches its port.`);
 const sessionFile = options.sessionFile ? await contained(project.root, options.sessionFile, { privateFile: true }) : undefined;
 await project.adapter.prepare?.(project.root, custody.store, signal);
 return api[direction]({ root: project.root, target, path, origin: options.origin, sessionFile, signal, ...custody });
}
