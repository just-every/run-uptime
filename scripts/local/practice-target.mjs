// Read the running local fixture's address through `rer run practice-target`.
// rer supplies Node even when it is absent from the user's PATH.
import { readFile } from 'node:fs/promises';

try {
 const grant = JSON.parse(await readFile(new URL('../../.wrangler/state/synthetic-grant.json', import.meta.url), 'utf8'));
 if (!Number.isInteger(grant.port) || grant.port < 1 || grant.port > 65535 || !(grant.expiresAt > Date.now())) throw Error('No active practice target');
 process.kill(grant.pid, 0);
 console.log(`http://127.0.0.1:${grant.port}`);
} catch {
 console.error('Practice target unavailable. Keep rer dev running in this checkout, then run rer run practice-target again.');
 process.exitCode = 1;
}
