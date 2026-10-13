// Run with the runner stopped. Setup invokes the same local inventory migration.
import {readdir, realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {credentialInventory} from './credential-inventory.mjs';
import {bindCredential, atomicJson} from './bind-credential.mjs';
import {openCredential} from '../src/credential-file.mjs';
import {INVENTORY_FILE} from '../src/credential-diagnostic.mjs';
import {bindingCommand, validReference, validMonitorId} from '../../src/domain/credential-binding.mjs';
const args = process.argv.slice(2), options = {};
try {
  for (let i = 0; i < args.length; i += 2) {
    if (!['--directory','--reference','--monitor-id','--persist-to'].includes(args[i]) || !args[i+1] || options[args[i]]) throw Error();
    options[args[i]] = args[i+1];
  }
  const directory = options['--directory'] ?? process.env.UPTIME_CREDENTIAL_DIR;
  const reference = options['--reference'], monitorId = options['--monitor-id'];
  if (!directory) throw Error();
  if (reference !== undefined || monitorId !== undefined) {
    if (!validReference(reference) || !validMonitorId(monitorId) || options['--persist-to']) throw Error();
    await bindCredential(directory, reference, monitorId);
    console.log('Credential bound to the selected monitor. No credential value was printed.');
  } else {
    const root = await realpath(directory), inventory = await credentialInventory(options['--persist-to'] ?? '.wrangler/state');
    // Only diagnostics are retained here: authorization always comes from each credential's own monitorId.
    await atomicJson(root, join(root, INVENTORY_FILE), inventory);
    for (const name of (await readdir(root)).sort()) {
      if (!name.endsWith('.json') || !validReference(name.slice(0, -5))) continue;
      const ref = name.slice(0, -5), ids = Object.hasOwn(inventory, ref) ? inventory[ref] : [];
      let source;
      try { source = await openCredential(root, ref); }
      catch { console.log(`Credential ${ref}: invalid local file; review custody and format. No binding changed.`); continue; }
      const bound = source.input.monitorId; await source.file.close();
      if (bound !== undefined) continue;
      if (ids.length === 1) {
        await bindCredential(root, ref, ids[0]);
        console.log(`Credential ${ref}: bound to existing monitor ${ids[0]}.`);
      } else {
        console.log(`Credential ${ref}: unbound; ${ids.length ? 'shared by monitors ' + ids.join(', ') : 'no existing monitor references this file'}. Stop the runner and review the intended monitor before binding.`);
        for (const id of ids) console.log(bindingCommand(ref, id));
        if (!ids.length) console.log(`After selecting a monitor, use: ${bindingCommand(ref, 'MONITOR_ID')}`);
      }
    }
  }
} catch {
  console.error('Credential binding refused. Stop the runner; supply --directory and --persist-to for local inventory migration, or --directory, --reference and --monitor-id for an owner-only regular credential file. A file bound to another monitor must be reviewed and re-entered explicitly.');
  process.exitCode = 1;
}
