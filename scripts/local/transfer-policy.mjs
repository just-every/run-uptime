import { archive, restore } from '../../src/domain/archive.server.ts';
import { TABLES, ARCHIVE_BYTES } from '../../src/domain/archive-schema.ts';
import { installationLocalTables } from '../../src/domain/archive-inventory.ts';
export function productPolicy(env, importJob) {
 return {
  product: 'just-every/uptime-monitor',
  // Product records travel in the named payload, preserving Uptime's versioned
  // history and inactive restore. These exclusions do not omit product data.
  excludeTables: [...TABLES, ...Object.keys(installationLocalTables)],
  requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'UPTIME_RUNNER_KEY', 'MAIL_FROM', 'SENDGRID_API_KEY'],
  extraPayloads: {
   uptime: {
    produce: async () => new TextEncoder().encode(JSON.stringify(await archive(env))),
    async consume(stream, descriptor) {
     const id = importJob();
     const prior = await env.DB.prepare('SELECT sha256 FROM rer_portability_product_restore WHERE id=?').bind(id).first();
     if (prior) { if (prior.sha256 !== descriptor.sha256) throw Error('Restore receipt mismatch'); await stream.cancel(); return; }
     if (descriptor.size > ARCHIVE_BYTES) throw Error('Archive exceeds product byte bound');
     const reader = stream.getReader(), chunks = []; let size = 0;
     try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > ARCHIVE_BYTES) throw Error('Archive exceeds product byte bound'); chunks.push(value); } }
     finally { await reader.cancel(); reader.releaseLock(); }
     const bytes = new Uint8Array(size); let offset = 0;
     for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
     const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
     await restore(env, value, { id, sha256: descriptor.sha256 });
    },
   },
  },
 };
}
