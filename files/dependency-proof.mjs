import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root = path.resolve(process.argv[2]);
const packet = path.dirname(new URL(import.meta.url).pathname);
const rootRequire = createRequire(path.join(root, 'package.json'));
const yaml = rootRequire('js-yaml');
const isAffected = version => {
  const [major, minor, patch] = version.split('.').map(Number);
  return major === 7 && (minor < 30 || minor === 30 && patch < 1);
};
const evidence = {schema: 1, author: 'Run Edit Run fleet', date: '2026-11-16',
  repository: 'just-every/run-uptime', node: process.version,
  head: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  fixedBy: '8529deda750510402236ece09a9ab91f934a3231', trees: []};
execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', evidence.fixedBy, 'HEAD']);
for (const relative of ['.', 'src/base/modules/mail']) {
  const directory = path.join(root, relative);
  const lock = yaml.load(await readFile(path.join(directory, 'pnpm-lock.yaml'), 'utf8'));
  const packages = Object.keys(lock.packages).filter(key => key.startsWith('undici@'));
  const snapshots = Object.keys(lock.snapshots).filter(key => key.startsWith('undici@'));
  const resolutions = [...new Set([...packages, ...snapshots].map(key => key.slice('undici@'.length).split('(')[0]))];
  assert.ok(resolutions.length > 0, 'dependency graph includes undici');
  assert.ok(resolutions.every(version => !isAffected(version)), 'no affected undici 7.x resolution');
  const parentRequire = createRequire(path.join(directory, 'package.json'));
  const miniflareEntry = parentRequire.resolve('miniflare');
  const mfRequire = createRequire(miniflareEntry);
  const installed = JSON.parse(await readFile(mfRequire.resolve('undici/package.json'), 'utf8'));
  assert.ok(!isAffected(installed.version), 'installed Miniflare uses unaffected undici');
  assert.ok(resolutions.includes(installed.version), 'installed version agrees with lock');
  const {Miniflare, convertV4MiniflareOptions} = parentRequire('miniflare');
  const worker = new Miniflare(convertV4MiniflareOptions({modules: true, compatibilityDate: '2026-09-01', cf: {}, unsafeLocalExplorer: false, unsafeObservability: false,
    script: 'export default {async fetch(request) {return Response.json({method: request.method, body: await request.text()});}}'}));
  try {
    const response = await worker.dispatchFetch('https://synthetic-uptime.example/check', {method: 'POST', body: 'synthetic-uptime-1'});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {method: 'POST', body: 'synthetic-uptime-1'});
  } finally {await worker.dispose();}
  evidence.trees.push({path: relative, lockfile: path.posix.join(relative, 'pnpm-lock.yaml'),
    override: lock.overrides.undici, versions: resolutions, installed: installed.version,
    vulnerableResolutions: resolutions.filter(isAffected).length,
    packageEntries: packages.length, snapshotEntries: snapshots.length,
    miniflareRequestBodyRoundtrip: 'pass'});
}
await writeFile(path.join(packet, 'dependency-proof.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
