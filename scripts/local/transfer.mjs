import { open, mkdir, unlink, lstat, readFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { constants } from 'node:fs';
import { Readable } from 'node:stream';
import { createPortability, readArchive, PortabilityError, canonicalJson } from '@runeditrun/rer/modules/portability';
import { readLegacyArchive } from '@runeditrun/rer/modules/portability/format';
import { absent, privateFile, promote } from '@runeditrun/rer/modules/portability/cli-options';
import { readLocalSettings } from '../local-settings.mjs';
import { startLocalWorker } from '../local-worker.mjs';
import { productPolicy } from './transfer-policy.mjs';
import { migrationReplay } from '@runeditrun/rer/modules/portability/migration-history';
import { catalogue, policy as archivePolicy } from '@runeditrun/rer/modules/portability/catalogue';
import { appliedMigrations, sameSchemaMigrations, additiveBridge } from '@runeditrun/rer/internal/modules/portability/bridge.mjs';
import { migrationHistory } from './migration-history.mjs';
import { fileURLToPath } from 'node:url';
import {permission,AccessError} from '../../src/domain/access.server.ts';
import {authorizedDatabase,auditAccess} from '../../src/domain/access-database.server.ts';
import {MfaError} from '../../src/domain/mfa/policy.server.ts';
import {validateJournal} from '../../src/domain/archive-fence.server.ts';
async function* records(path, reader = readArchive) {
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
 try { yield* reader(Readable.toWeb(file.createReadStream({ autoClose: false }))); }
 finally { await file.close(); }
}
export async function transfer(direction, path) {
 let laterJournal, validatedManifest;
 if(direction==='import'&&process.env.UPTIME_LATER_JOURNAL){const journalPath=process.env.UPTIME_LATER_JOURNAL;if(!isAbsolute(journalPath))throw Error('UPTIME_LATER_JOURNAL must be an absolute file path');const stat=await lstat(journalPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)throw Error('Invalid erasure journal file');laterJournal=validateJournal(JSON.parse(await readFile(journalPath,'utf8')))}
 if (direction === 'export') await absent(path);
 else try { for await (const record of records(path)) if (record.kind === 'manifest') validatedManifest = record; } catch (error) {
  // Archives from Uptime 0.1.2 and earlier predate Base's metadata binding. Base reads them only through an
  // acknowledged recovery into an installation without an owner, which Uptime's setup-first import cannot offer.
  if (!(error instanceof PortabilityError)) throw error;
  let legacy = false; try { for await (const record of records(path, readLegacyArchive)) {} legacy = true; } catch {}
  throw legacy ? new PortabilityError('legacy_archive_unbound', 409) : error;
 }
 const cookie=process.env.UPTIME_ACCESS_COOKIE;
 if(!cookie||/[\r\n]/.test(cookie))throw new MfaError(401,'session_required');
 const settings = await readLocalSettings();
 const worker = await startLocalWorker({ bindings: settings, assets: false });
 let service, id, complete = false, manifest, closing;
 const temporary = path + '.partial';
 try {
  const env = { ...settings, DB: await worker.getD1Database('DB') };
  const request=new Request(new URL(direction==='export'?'/api/archive':'/api/restore',settings.UPTIME_ORIGIN),{method:direction==='export'?'GET':'POST',headers:{cookie,origin:settings.UPTIME_ORIGIN}});
  // A local filesystem command holds the same live Base session and five-minute
  // factor proof as HTTP. Re-read authority at every progress boundary. Product
  // writes also carry the session/version/factor fence in their D1 transaction.
  const authorize=()=>permission(env,request);
  const access=await authorize();
  await auditAccess(env,access);
  const policy = productPolicy({...env,DB:authorizedDatabase(env,access)}, () => id, () => ({manifest,laterJournal,actor:{kind:'operator',ref:access.session.operator.id}}));
  // The migrations this installation applied, in Wrangler's applied order, so an archive made before later additive migrations
  // (new tables, columns with defaults, indexes) restores into it instead of being refused for a ledger it has outgrown.
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const history = await migrationHistory(env.DB, root);
  const migrations = async () => migrationReplay(history.plan, policy);
  if (direction === 'import') {
   // The package creates its local identity before checking compatibility. The
   // setup-first seed refuses product/schema/migration incompatibility before
   // that write, using the same read-only checks and keeping its final checks.
   const config = archivePolicy(policy);
   if (validatedManifest.product !== config.product) throw new PortabilityError('wrong_product');
   await appliedMigrations(env.DB);
   const cat = await catalogue(env.DB, config);
   if (!config.acceptedSchemas[validatedManifest.schema]) {
    if (validatedManifest.schema === cat.identity) await sameSchemaMigrations(env.DB, validatedManifest, cat, migrations);
    else await additiveBridge(env.DB, validatedManifest, cat, migrations);
   }
  }
  service = await createPortability({ db: env.DB, policy, migrations });
  if (direction === 'export') {
   await mkdir(dirname(path), { recursive: true, mode: 0o700 });
   const file = await privateFile(temporary, false);
   try {
    await authorize();id = await service.exports.create();
    for(;;){await authorize();if((await service.exports.advance(id, { maxParts: 16 })).phase!=='building')break}
    await authorize();const reader = (await service.exports.download(id)).getReader();
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; await authorize();await file.writeFile(value); } }
    finally { await reader.cancel(); reader.releaseLock(); }
    await file.sync();
   } finally { await file.close(); }
   for await (const record of records(temporary)) { if (record.kind === 'manifest') manifest = record; if (record.kind === 'closing') closing = record; }
   await authorize();await promote(temporary, path); complete = true;
  } else {
   for await (const record of records(path)) {
    await authorize();
    if (record.kind === 'manifest') {
     if (canonicalJson(record) !== canonicalJson(validatedManifest)) throw new PortabilityError('archive_changed');
     manifest = record; id = await service.imports.create(manifest);
    }
    else if (record.kind === 'part') await service.imports.uploadPart(id, record.index, record);
    else closing = record;
   }
   await authorize();await service.imports.finalize(id, { contentHash: closing.contentHash, archiveHash: closing.archiveHash, laterJournal }); complete = true;
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
 catch (error) { console.log(JSON.stringify({ ok: false, refused: error instanceof PortabilityError || error instanceof MfaError || error instanceof AccessError || /Restore requires empty|EEXIST/.test(error.message), reason: error instanceof PortabilityError ? error.code.split(':')[0] : error instanceof AccessError ? (error.status===401?'session_required':'permission_required') : error.code ?? error.name })); process.exitCode = 1; }
}
