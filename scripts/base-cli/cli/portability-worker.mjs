import { open, mkdir, link, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createPortability, readArchive, PortabilityError } from '../modules/portability/index.mjs';

async function* records(path) {
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
 try { yield* readArchive(Readable.toWeb(file.createReadStream({ autoClose: false }))); }
 finally { await file.close(); }
}
function receipt(manifest, closing, transient) {
 return {
  contentHash: closing.contentHash,
  tables: manifest.tables.map(({ name, count }) => ({ name, count })),
  objects: manifest.objects.length, payloads: manifest.payloads.length,
  exclusions: { tables: manifest.excludedTables, columns: manifest.excludedColumns, configuration: true, transient },
  requiredConfiguration: manifest.requiredConfiguration,
 };
}
async function exportArchive(service, path, transient) {
 let id, temporary, file;
 try {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  temporary = path + '.' + randomUUID() + '.partial';
  file = await open(temporary, 'wx', 0o600);
  id = await service.exports.create();
  while ((await service.exports.advance(id, { maxParts: 16 })).phase === 'building') {}
  const reader = (await service.exports.download(id)).getReader();
  try {
   for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    let offset = 0;
    while (offset < value.length) offset += (await file.write(value, offset)).bytesWritten;
   }
  } finally { await reader.cancel(); reader.releaseLock(); }
  await file.sync(); await file.close(); file = undefined;
  let manifest, closing;
  for await (const record of records(temporary)) { if (record.kind === 'manifest') manifest = record; if (record.kind === 'closing') closing = record; }
  await link(temporary, path);
  return receipt(manifest, closing, transient);
 } finally {
  await file?.close();
  if (temporary) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (id) await service.exports.abort(id);
 }
}
async function importArchive(service, path, transient) {
 let id, manifest, closing, complete = false;
 try {
  for await (const record of records(path)) {
   if (record.kind === 'manifest') { manifest = record; id = await service.imports.create(manifest); }
   else if (record.kind === 'part') await service.imports.uploadPart(id, record.index, record);
   else closing = record;
  }
  await service.imports.finalize(id, { contentHash: closing.contentHash }); complete = true;
  return receipt(manifest, closing, transient);
 } finally { if (id && !complete) await service.imports.abort(id); }
}
async function run(direction, { root, path, binding, buckets, policy, transient }) {
 // Verify the entire input before opening bindings or acquiring an import lock.
 if (direction === 'import') for await (const record of records(path)) {}
 const { getPlatformProxy } = createRequire(join(root, 'package.json'))('wrangler');
 // Unlike Wrangler's --persist-to base, the API takes the versioned directory.
 const proxy = await getPlatformProxy({ configPath: join(root, 'wrangler.jsonc'), persist: { path: join(root, '.wrangler/state/v3') }, remoteBindings: false });
 try {
  const service = await createPortability({ db: proxy.env[binding], buckets: Object.fromEntries(Object.entries(buckets).map(([name, binding]) => [name, proxy.env[binding]])), policy });
  return await (direction === 'export' ? exportArchive : importArchive)(service, path, transient);
 } finally { await proxy.dispose(); }
}

try { console.log(JSON.stringify({ ok: true, ...await run(process.argv[2], JSON.parse(process.argv[3])) })); }
catch (error) {
 const refusal = error instanceof PortabilityError && (error.status === 409 || ['wrong_product', 'schema_mismatch', 'table_inventory', 'configuration_inventory'].includes(error.code));
 const exitCode = error.message === 'archive_json' ? 2 : refusal || error.code === 'EEXIST' ? 4 : 1;
 // Report only symbolic codes; native database errors can contain private data.
 const reason = error instanceof PortabilityError ? error.code.split(':')[0] : /^[A-Z_]+$/.test(error.code ?? '') ? error.code : error.message === 'archive_json' ? 'archive_json' : 'native_error';
 console.log(JSON.stringify({ ok: false, code: exitCode === 2 ? 'invalid_archive' : exitCode === 4 ? 'restore_refused' : 'transfer_failed', reason, exitCode })); process.exitCode = exitCode;
}
