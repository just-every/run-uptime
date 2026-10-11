import {readFile} from 'node:fs/promises';
import {produceSeedArtifact} from './delivery/base/package.mjs';
const config=JSON.parse(await readFile(new URL('./delivery/base/packaging.json',import.meta.url)));
console.log(await produceSeedArtifact({config}));
