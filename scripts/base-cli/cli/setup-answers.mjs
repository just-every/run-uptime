import { join } from 'node:path';
import { contained } from './project.mjs';
import { shared } from './shared.mjs';
import { invalid } from './errors.mjs';

const path = '.seed/installer/setup-answers.json';

// Installer choices and local runtime bindings need not have the same meaning.
// Keep only declared nonsecret answers, after successful setup, in owned storage.
export async function savedSetupAnswers(project, model) {
 const file = await contained(project.root, path, { optional: true, privateFile: true });
 let saved;
 try { saved = JSON.parse(await (await shared('private-files.mjs')).readPrivateFile(file)); }
 catch (error) {
  if (error.code === 'ENOENT') return undefined;
  throw invalid('Saved setup answers are unreadable or invalid. Preserve private settings and repair the saved setup answers before retrying.');
 }
 if (!saved || typeof saved !== 'object' || Array.isArray(saved) || Object.values(saved).some(value => typeof value !== 'string'))
  throw invalid('Saved setup answers must be a JSON object of installer answers.');
 return Object.fromEntries(model.safeKeys.filter(key => Object.hasOwn(saved, key)).map(key => [key, saved[key]]));
}

export async function rememberSetupAnswers(project, input) {
 const answers = Object.fromEntries(project.setupSeed.model.safeKeys.filter(key => typeof input[key] === 'string').map(key => [key, input[key]]));
 const { privateDirectory, writePrivateFile } = await shared('private-files.mjs');
 await privateDirectory(project.root, ['.seed', 'installer']);
 await contained(project.root, path, { optional: true, privateFile: true });
 await writePrivateFile(join(project.root, path), JSON.stringify(answers) + '\n');
}
