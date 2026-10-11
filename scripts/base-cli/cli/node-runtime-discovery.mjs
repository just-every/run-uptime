import { readFile, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, join, resolve, sep } from 'node:path';
import { invalid, missing } from './errors.mjs';
import { cachedRuntime, nodeCache } from './node-runtime-cache.mjs';

const exact = value => typeof value === 'string' && /^v?\d+\.\d+\.\d+$/.test(value);
// Read project-owned declarations, never import an adapter under the wrong Node.
// Independent projects without an exact pin keep their chosen runtime.
export async function projectNodePin(root) {
 let descriptor;
 try { descriptor = JSON.parse(await readFile(resolve(root, 'OPERATIONS.json'), 'utf8')); }
 catch { return undefined; } // Normal project validation owns descriptor errors.
 const firstParty = Boolean(descriptor.seedContract);
 let file, nvm, pkg = {};
 try { file = (await readFile(resolve(root, '.node-version'), 'utf8')).trim(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
 try { nvm = (await readFile(resolve(root, '.nvmrc'), 'utf8')).trim(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
 try { pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')); } catch {}
 if (file && !exact(file)) throw invalid('Use an exact Node release (major.minor.patch) in .node-version.');
 const declarations = [file, nvm, pkg.engines?.node, pkg.volta?.node].filter(exact).map(value => value.replace(/^v/, ''));
 if (new Set(declarations).size > 1) throw invalid('The exact Node pins in .node-version, .nvmrc, package.json engines.node or volta.node disagree. Make the project pins agree before running rer.');
 const pin = declarations[0];
 if (!pin && firstParty) throw missing('Declare the project Node release in .node-version and package.json engines.node before running rer.');
 return pin?.replace(/^v/, '');
}

export function matchesRuntime(binary, version) {
 const result = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 1500, maxBuffer: 1024, windowsHide: true });
 return result.status === 0 && result.stdout.trim() === `v${version}`;
}

export async function installedRuntime(version) {
 const home = homedir(), name = process.platform === 'win32' ? 'node.exe' : 'node';
 let cached, cacheError;
 try { cached = await cachedRuntime(version); } catch (error) { cacheError = error; }
 if (cached && matchesRuntime(cached, version)) return cached;
 const candidates = [
  join(home, '.nvm', 'versions', 'node', `v${version}`, 'bin', name),
  ...(process.env.NVM_DIR ? [join(process.env.NVM_DIR, 'versions', 'node', `v${version}`, 'bin', name)] : []),
  join(home, '.volta', 'tools', 'image', 'node', version, 'bin', name),
  ...['.fnm', '.local/share/fnm', 'Library/Application Support/fnm'].map(path => join(home, path, 'node-versions', `v${version}`, 'installation', 'bin', name)),
  ...(process.env.PATH ?? '').split(delimiter).filter(Boolean).map(path => join(path, name)),
  ...['/opt/homebrew/opt', '/usr/local/opt', '/usr/local/homebrew/opt'].map(path => join(path, `node@${version.split('.')[0]}`, 'bin', name)),
 ];
 let cacheRoot; try { cacheRoot = await realpath(nodeCache()); } catch {}
 const seen = new Set(), deadline = Date.now() + 10000;
 for (const candidate of candidates) {
  if (Date.now() > deadline) break;
  let canonical; try { canonical = await realpath(candidate); } catch { continue; }
  if (cacheRoot && canonical.startsWith(cacheRoot + sep)) continue; // Cache binaries require their verified receipt.
  if (seen.has(canonical)) continue; seen.add(canonical);
  if (matchesRuntime(canonical, version)) return canonical;
 }
 if (cacheError) throw cacheError;
}
