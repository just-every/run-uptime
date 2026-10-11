// Validate inert committed JSON with the maintained recipe implementation.
// Never import or execute a tool from the repository being inspected.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {manifest, VERSION} from '../../edition-authoring/manifest.mjs';
import {hash, json} from '../../edition-authoring/files.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) && !/\s/.test(value);
function optionalArray(value, key) {
  if (key in value && !Array.isArray(value[key])) throw Error('Invalid array');
}
function origin(value) {
  if (!object(value) || typeof value.repository !== 'string' || typeof value.revision !== 'string' || value.revision.length !== 40) throw Error('Invalid origin');
  optionalArray(value, 'paths');
}
function shape(recipe) {
  if (!object(recipe) || recipe.identityKind !== 'project' || !identity(recipe.id) || !object(recipe.toolchain)) throw Error('Invalid identity');
  if (recipe.parent !== undefined && recipe.parent !== null) origin(recipe.parent);
  if (!Array.isArray(recipe.components)) throw Error('Invalid components');
  for (const component of recipe.components) {
    if (!object(component) || !identity(component.id) || !object(component.source)) throw Error('Invalid component');
    for (const key of ['requires', 'conflicts']) {
      optionalArray(component, key);
      if (component[key]?.some(value => typeof value !== 'string')) throw Error('Invalid dependency');
    }
    const selected = component.source;
    if (selected.kind === 'git') origin(selected);
    else if (selected.kind === 'local') {
      if (selected.origin !== undefined) origin(selected.origin);
      optionalArray(selected, 'mappings');
      if (selected.mappings?.some(value => !object(value))) throw Error('Invalid mapping');
    }
  }
}

let directory;
try {
  const data = fs.readFileSync(0, 'utf8');
  const recipe = JSON.parse(data);
  shape(recipe);
  if (VERSION !== '1.1.0') throw Error('Unsupported recipe validator');
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-identity-'));
  fs.writeFileSync(path.join(directory, 'edition.json'), data);
  // manifest currently returns the complete parsed recipe, including metadata.
  // Use its exact JSON.stringify(..., null, 2) + newline hash, as cli lock does.
  process.stdout.write(hash(json(manifest(directory))));
} catch {
  // Input, paths and diagnostics are intentionally absent from the report.
  process.exitCode = 1;
} finally {
  if (directory) fs.rmSync(directory, {recursive: true, force: true});
}
