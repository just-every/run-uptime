import { assert, stable } from './validation.mjs';
import { collectFiles, moduleType } from './artifact.mjs';

/** The legacy output contract of the pinned Cloudflare Vite plugin (1.54.5).
 * Wrangler no_bundle discovers modules using these ESModule rules plus its
 * Text/Data/CompiledWasm defaults; it does not upload every file in dist/server.
 * Keep unknown build contracts explicit rather than dropping possible modules.
 */
export async function collectBuildModules(root, config, main) {
  const rules = [{type:'ESModule',globs:['**/*.js','**/*.mjs']}];
  assert(config.no_bundle === true && stable(config.rules) === stable(rules)
    && config.find_additional_modules !== false && config.base_dir === undefined,
  'unsupported-build-module-rules');
  assert(/\.(?:m?js)$/.test(main), 'unsupported-build-main');
  const files = await collectFiles(root);
  // Includes all emitted chunks (also lazy chunks) and supported additional
  // modules. JSON manifests and source maps do not match any upload rule.
  const modules = files.filter(file => moduleType(file.path) !== undefined);
  assert(modules.some(file => file.path === main), 'artifact-main-missing');
  return modules;
}
