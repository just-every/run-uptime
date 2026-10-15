import assert from 'node:assert/strict';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { scratchInstallation, repository, machineAvailable } from './scratch-installation.mjs';
import { openGate, readCheckoutKey } from './auth-test-support.mjs';
import { assertPortFree, signInThroughOutbox, smokeDocuments, descendantGroups, assertGroupsGone } from './installer-support.mjs';

// Execute the local README shell blocks verbatim. Git redirects only the clone
// transport to a snapshot of this candidate; all application commands are real.
const readme = await readFile(join(repository, 'README.md'), 'utf8');
const section = readme.match(/^## Run it on your computer\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1];
assert.ok(section, 'README must provide local onboarding');
const blocks = [...section.matchAll(/^\s*```(?:sh|bash)\s*\n([\s\S]*?)^\s*```/gm)].map(match => match[1].trim());
const cloneUrl = blocks.join('\n').match(/\bgit clone\s+(https:\/\/[^\s]+|git@[^\s]+)/)?.[1];
assert.ok(cloneUrl, 'README must clone a fresh checkout');
const scratch = await scratchInstallation({ mirror: true });
const ports = new Set(), groups = new Set();
let browser, dev, appRoot, caseError, stopApp;
let cwd = scratch.directory;
try {
 // The README names `rer VERB`. The installed rer is the @runeditrun/rer package's own entry, which runs each verb with the clone's pinned rer; this stand-in is that entry, from the version this checkout pins. Keep its real non-interactive behavior: the command returns when the background app is ready.
 const bin = join(scratch.directory, 'bin');
 await mkdir(bin, { mode: 0o700 });
 await writeFile(join(bin, 'rer'), `#!/bin/sh\nexec node "${fileURLToPath(new URL('../node_modules/@runeditrun/rer/global/rer.mjs', import.meta.url))}" "$@"\n`, { mode: 0o700 });
 const environment = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${scratch.root}.insteadOf`, GIT_CONFIG_VALUE_0: cloneUrl, PATH: `${bin}:${process.env.PATH}` };
 for (const block of blocks) {
  if (/(?:^|\n)\s*(?:rer|node\s+scripts\/rer\.mjs)\s+dev(?:\s|$)/.test(block)) {
   assert.ok(!dev, 'only one application may own the journey');
   appRoot = cwd;
   stopApp = () => scratch.run('bash', ['-e', '-c', 'rer dev --stop'], { cwd: appRoot, environment });
   await machineAvailable();
   dev = scratch.start('bash', ['-e', '-c', block], { cwd, environment });
  } else {
   const cwdFile = join(scratch.directory, 'command-cwd');
   const handle = await open(cwdFile, 'w', 0o600);
   try { await scratch.run('bash', ['-e', '-c', block + '\npwd >&3'], { cwd, environment, stdio: ['ignore', 'pipe', 'pipe', handle.fd] }); }
   finally { await handle.close(); }
   cwd = resolve((await readFile(cwdFile, 'utf8')).trim());
   assert.ok(cwd.startsWith(scratch.directory + '/'), 'README commands escaped their scratch checkout');
  }
 }
 assert.ok(dev && appRoot, 'README did not start the application');
 assert.equal((await dev.done).code, 0, 'README dev command succeeds');
 const origin = dev.output.match(/RER_READY (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
 assert.ok(origin, 'README dev prints its ready address');
 const serverPid = Number(dev.output.match(/background \(PID (\d+)\)/)?.[1]);
 assert.ok(Number.isSafeInteger(serverPid) && serverPid > 0, 'ready output identifies the owned background server');
 for (const group of await descendantGroups(serverPid)) groups.add(group);
 const site = dev.output.match(/RER_SITE (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
 if (site) ports.add(Number(new URL(site).port));
 ports.add(Number(new URL(origin).port));
 const settings = JSON.parse(await readFile(join(appRoot, 'data/local-secrets.json'), 'utf8'));
 browser = await chromium.launch({ headless: true });
 const page = await browser.newPage();
 const devKey = await readCheckoutKey(appRoot);
 await openGate(page.context(), origin, devKey);
 await signInThroughOutbox(page, origin + '/__dev/outbox', { OWNER_EMAIL: settings.OWNER_EMAIL, displayName: 'Owner' }, { key: devKey });
 const health = await page.request.get(origin + '/health');
 assert.equal(health.status(), 200); assert.equal((await health.json()).status, 'ok');
 await smokeDocuments(page, origin);
 for (const key of ['SESSION_SECRET', 'SETUP_TOKEN', 'UPTIME_RUNNER_KEY']) assert.ok(!dev.output.includes(settings[key]), 'command output exposed generated credentials');
 for (const group of await descendantGroups(serverPid)) groups.add(group);
 const grant = JSON.parse(await readFile(join(appRoot, '.wrangler/state/synthetic-grant.json'), 'utf8'));
 ports.add(grant.port);
 await stopApp(); stopApp = undefined;
 await scratch.stop(dev); dev = undefined;
 await assertGroupsGone(groups);
 await scratch.run('node', ['node_modules/@runeditrun/rer/bin/rer.mjs', 'reset', '--yes', '--non-interactive'], { cwd: appRoot });
 assert.equal((await scratch.run('git', ['status', '--porcelain'], { cwd: appRoot })).trim(), '', 'documented journey changed tracked source');
 console.log('README-JOURNEY passed: literal fresh clone and automatic rer dev setup, background start/stop, health, owner outbox sign-in, private documents, reset and clean tracked tree.');
} catch (error) { caseError = error; throw error; }
finally {
 const failures = [];
 for (const action of [() => browser?.close(), () => stopApp?.(), () => scratch.stop(dev)]) try { await action(); } catch (error) { failures.push(error); }
 for (const port of ports) try { await assertPortFree(port); } catch (error) { failures.push(error); }
 try { await assertGroupsGone(groups); } catch (error) { failures.push(error); }
 try { await scratch.close(); } catch (error) { failures.push(error); }
 if (failures.length) throw new AggregateError([caseError, ...failures].filter(Boolean), 'README journey teardown failed');
}
