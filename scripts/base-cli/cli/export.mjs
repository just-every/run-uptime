import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { testSource } from '../composition/git-source.mjs';

// Copy whole maintained source/tooling directories. Python publication scans
// load sibling modules and data dynamically; they belong in the inventory too.
export const sourceRoots = ['bin/rer.mjs', 'cli', 'modules/job-queue', 'modules/release', 'modules/deploy-kit', 'modules/mail', 'modules/portability', 'operations', 'scripts/publish-check', 'scripts/publish-check.mjs', 'composition/git-source.mjs', 'edition-authoring/manifest.mjs', 'edition-authoring/files.mjs'];
export async function inventory(base, roots = sourceRoots) {
 const files = [];
 async function walk(path) {
  for (const entry of (await readdir(resolve(base, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
   if (['node_modules', '__pycache__', '.state', '.wrangler', '.rer', '.seed', '.cache'].includes(entry.name)) continue;
   const name = `${path}/${entry.name}`;
   if (testSource(name)) continue;
   if (entry.isDirectory()) await walk(name);
   else if (entry.isFile()) files.push(name);
   else throw Error('Non-file CLI export source');
  }
 }
 for (const source of roots) { if (source.endsWith('.mjs')) files.push(source); else await walk(source); }
 return files.sort();
}

export async function exportCLI(base, destination) {
 const target = resolve(destination, 'scripts/base-cli');
 await rm(target, { recursive: true, force: true });
 await mkdir(target, { recursive: true });
 const files = await inventory(base), record = {};
 for (const path of files) {
  const bytes = await readFile(resolve(base, path));
  await mkdir(dirname(resolve(target, path)), { recursive: true });
  await cp(resolve(base, path), resolve(target, path));
  record[path] = { source: path, sha256: createHash('sha256').update(bytes).digest('hex') };
 }
 const onboardingFiles=Object.fromEntries(await Promise.all((await inventory(base,['onboarding'])).map(async path=>[path.slice('onboarding/'.length),{source:path,sha256:createHash('sha256').update(await readFile(resolve(base,path))).digest('hex')}])));
 await writeFile(resolve(target, 'inventory.json'), JSON.stringify({ version: 1, onboarding: '../base-onboarding', onboardingFiles, files: record }, null, 2) + '\n');
 await writeFile(resolve(destination, 'scripts/rer.mjs'), "#!/usr/bin/env node\nimport { main } from './base-cli/cli/main.mjs';\nprocess.exitCode = await main();\n");
}
