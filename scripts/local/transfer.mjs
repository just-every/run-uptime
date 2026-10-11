import { open, mkdir, unlink, lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { constants } from 'node:fs';
import { Readable } from 'node:stream';
import { createPortability, readArchive, PortabilityError } from '../base-cli/modules/portability/index.mjs';
import { absent, privateFile, promote } from '../base-cli/modules/portability/cli-options.mjs';
import { readLocalSettings, prepareLocalSettings, defaultSettingsPath } from '../local-settings.mjs';
import { startLocalWorker } from '../local-worker.mjs';
import { productPolicy } from './transfer-policy.mjs';
async function* records(path) {
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
 try { yield* readArchive(Readable.toWeb(file.createReadStream({ autoClose: false }))); }
 finally { await file.close(); }
}
export async function transfer(direction, path) {
 if (direction === 'export') await absent(path);
 else for await (const record of records(path)) {}
 const present = await lstat(defaultSettingsPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
 const settings = !present && direction === 'import' ? (await prepareLocalSettings({ controlPort: 8787 })).vars : await readLocalSettings();
 const worker = await startLocalWorker({ bindings: settings, assets: false });
 let service, id, complete = false, manifest, closing;
 const temporary = path + '.partial';
 try {
  const env = { ...settings, DB: await worker.getD1Database('DB') };
  service = await createPortability({ db: env.DB, policy: productPolicy(env, () => id) });
  if (direction === 'export') {
   await mkdir(dirname(path), { recursive: true, mode: 0o700 });
   const file = await privateFile(temporary, false);
   try {
    id = await service.exports.create();
    while ((await service.exports.advance(id, { maxParts: 16 })).phase === 'building') {}
    const reader = (await service.exports.download(id)).getReader();
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; await file.writeFile(value); } }
    finally { await reader.cancel(); reader.releaseLock(); }
    await file.sync();
   } finally { await file.close(); }
   for await (const record of records(temporary)) { if (record.kind === 'manifest') manifest = record; if (record.kind === 'closing') closing = record; }
   await promote(temporary, path); complete = true;
  } else {
   for await (const record of records(path)) {
    if (record.kind === 'manifest') { manifest = record; id = await service.imports.create(manifest); }
    else if (record.kind === 'part') await service.imports.uploadPart(id, record.index, record);
    else closing = record;
   }
   await service.imports.finalize(id, { contentHash: closing.contentHash }); complete = true;
  }
  return { contentHash: closing.contentHash, payloads: manifest.payloads.map(({ name, size }) => ({ name, size })), exclusions: Object.values((await import('../../src/domain/archive-inventory.ts')).installationLocalTables), requiredConfiguration: manifest.requiredConfiguration };
 } finally {
  if (id) { if (direction === 'export') await service.exports.abort(id); else if (!complete) await service.imports.abort(id); }
  if (direction === 'export') await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await worker.dispose();
 }
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
 try { console.log(JSON.stringify({ ok: true, ...await transfer(process.argv[2], process.argv[3]) })); }
 catch (error) { console.log(JSON.stringify({ ok: false, refused: error instanceof PortabilityError || /Restore requires empty|EEXIST/.test(error.message), reason: error instanceof PortabilityError ? error.code.split(':')[0] : error.code ?? error.name })); process.exitCode = 1; }
}
