import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { deploymentSpec } from './base/spec.mjs';
import { packagingConfig } from './base/package.mjs';
import { loadSetupManifest } from './base/setup-manifest.mjs';

// Run after rer build. Both the artifact and this publication use Base's reader
// and the same packaging policy, including exact migration bytes from the build.
const root = process.cwd(), check = process.argv.includes('--check');
const config = JSON.parse(await readFile(resolve(root, 'scripts/delivery/base/packaging.json'), 'utf8'));
const { project, setup } = packagingConfig(config);
const selected = await loadSetupManifest(root, setup);
const manifest = structuredClone(selected.manifest);
const provider = manifest.fields.find(field => field.name === 'MAIL_PROVIDER');
provider.default = 'development';
provider.options.unshift({ value: 'development', label: 'Local development outbox' });
delete provider.help;
manifest.fields.find(field => field.name === 'MAIL_FROM').default = 'auth@localhost.test';
const outputs = {
  'management/integration/deployment-spec.json': await deploymentSpec(root, config.artifact.specInputs),
  'rer-project.json': { ...project, setup: { path: selected.path, sha256: selected.sha256 } },
  'rer-local-setup.json': manifest,
};
for (const [path, value] of Object.entries(outputs)) {
  const bytes = JSON.stringify(value, null, 2) + '\n', file = resolve(root, path);
  if (check) {
    if (await readFile(file, 'utf8') !== bytes) throw Error(`${path} drifted; run pnpm run spec:generate after rer build`);
  } else {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
}
console.log(`Deployment spec, setup digest and local setup ${check ? 'match' : 'regenerated from'} the build`);
