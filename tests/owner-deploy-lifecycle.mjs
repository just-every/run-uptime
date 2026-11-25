import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { readDeployEnvFile } from '@runeditrun/rer/internal/modules/deploy-kit/env-file.mjs';
import { parseJsonc } from '@runeditrun/rer/internal/modules/deploy-kit/jsonc.mjs';
import { providerBridge } from './owner-deploy-lifecycle/bridge.mjs';
import { checkout, deploy, git } from './owner-deploy-lifecycle/commands.mjs';

const state = async root => JSON.parse(await readFile(join(root, '.rer/deploy/production.json')));
const migrationRows = provider => provider.state.databases[0].db.prepare('SELECT name, sha256, state FROM d1_migrations ORDER BY name').all().map(row => ({ ...row }));

test('real rer deploy covers fresh custody, automatic legacy upgrade, conflicts, named keys, exact repeat, resume and foreign ownership refusal', { timeout: 20 * 60_000 }, async t => {
  const root = await checkout(t), provider = await providerBridge(t);
  assert.equal(provider.state.databases.length, 0);
  assert.equal(provider.uploads.length, 0);
  provider.delayCreatedDatabaseListing();
  // An enabled provider is selected explicitly; an omitted selector now means none.
  const first = await deploy(root, provider, t.signal, [], {inputs: {
    OWNER_EMAIL: 'owner@example.test', MAIL_PROVIDER: 'sendgrid', MAIL_FROM: 'sender@synthetic-uptime.dev', SENDGRID_API_KEY: 'test-only-sendgrid-key',
  }});
  assert.equal(first.code, 0, JSON.stringify(first));
  assert.equal(first.result?.ok, true);
  assert.equal(first.result.deployed, true);
  assert.equal(first.result.origin, 'https://uptime-monitor-production.fixture-account.workers.dev');
  await assert.rejects(stat(join(root, '.rer/deploy/production-secrets.json')), { code: 'ENOENT' });
  await assert.rejects(stat(join(root, '.rer/deploy/environments')), { code: 'ENOENT' });
  const receipt = await state(root);
  assert.equal(receipt.owned.worker.status, 'created');
  assert.equal(receipt.owned.d1['uptime-monitor-production-db'].status, 'created');
  assert.ok(receipt.receipt, 'successful provision persists deployment identity');
  assert.equal(provider.state.databases.length, 1);
  assert.ok(provider.state.omittedDatabaseListings > 0, 'the newly created D1 was absent from an inconsistent account listing');
  assert.ok(provider.state.settledDatabaseListings > 0, 'the same first deploy read a settled listing before proceeding');
  assert.equal(provider.state.writes.filter(row => row.path === '/d1/database').length, 1, 'eventual listing never creates another D1');
  assert.equal(provider.uploads.length, 1);
  const configuredLimits = parseJsonc(await readFile(join(root, 'wrangler.jsonc'), 'utf8')).limits;
  const settings = (fixture, worker) => fixture.fetch(`https://api.cloudflare.com/client/v4/accounts/${fixture.accountId}/workers/scripts/${worker}/settings`,
    { headers: { Authorization: `Bearer ${fixture.token}` } }).then(response => response.json()).then(({ result }) => result);
  assert.deepEqual((await settings(provider, first.result.worker)).limits, configuredLimits, 'Paid deployment reads back the configured Worker limits');
  assert.ok(provider.healthRequests > 0, 'successful deployment verifies the served deployment identity');
  assert.ok(provider.state.assetRequests.length > 0, 'the package verifies an uploaded static asset');
  assert.ok(provider.state.schedules.some(schedule=>schedule.cron),'deployed monitoring has a scheduled trigger');
  const uploaded = provider.state.secrets.find(item => item.name === 'SENDGRID_API_KEY');
  assert.equal(uploaded?.value, 'test-only-sendgrid-key', 'an explicit SendGrid credential reaches the Worker');
  assert.ok(!provider.state.secrets.some(item => item.name === 'MAIL_API_KEY'), 'the shared name is a deploy input, not a second Worker secret');
  assert.equal(provider.state.secrets.find(item => item.name === 'MAIL_PROVIDER')?.value, 'sendgrid');
  const migrations = migrationRows(provider);
  assert.ok(migrations.length > 0, 'the real controller records applied migrations');
  assert.ok(migrations.every(row => row.state === 'applied'));
  const writes = provider.state.writes.length;
  const receiptBytes = await readFile(join(root, '.rer/deploy/production.json'));
  // Recreate a 0.3.0 checkout after a successful hosted deploy. The only
  // retained inputs are the two legacy JSON files, never fresh shell answers.
  const production = await readDeployEnvFile(root, '.rer/deploy/production.secrets.env');
  const named = { SESSION_SECRET: randomBytes(32).toString('hex'), SETUP_TOKEN: randomBytes(32).toString('hex'), UPTIME_RUNNER_KEY: randomBytes(32).toString('hex'), CUSTOM_ENV_SETTING: '"literal # and = content"' };
  const legacyProduction = join(root, '.rer/deploy/production-secrets.json');
  const legacyNamed = join(root, '.rer/deploy/environments/staging/secrets.json');
  await mkdir(join(root, '.rer/deploy/environments/staging'), { recursive: true, mode: 0o700 });
  const productionBytes = JSON.stringify(production), namedBytes = JSON.stringify(named);
  await writeFile(legacyProduction, productionBytes, { mode: 0o600 });
  await writeFile(legacyNamed, namedBytes, { mode: 0o600 });
  await rm(join(root, '.rer/deploy/production.secrets.env'));
  await rm(join(root, '.rer/deploy/.legacy-secrets-migrated'));
  const conflictBytes = 'OWNER_EMAIL=different@example.test\n';
  await writeFile(join(root, '.rer/deploy/production.secrets.env'), conflictBytes, { mode: 0o600 });
  const conflict = await deploy(root, provider, t.signal, [], { inputs: false });
  assert.equal(conflict.code, 4);
  assert.ok(conflict.messages.some(message => /conflict.*production\.secrets\.env.*OWNER_EMAIL/.test(message)), 'conflict names the kept file and key plainly');
  assert.ok(conflict.messages.every(message => !Object.values(production).some(value => message.includes(value))), 'conflict never prints saved values');
  assert.ok((await readFile(legacyProduction, 'utf8')) === productionBytes, 'conflict keeps legacy production bytes');
  assert.ok((await readFile(legacyNamed, 'utf8')) === namedBytes, 'conflict keeps every legacy environment');
  assert.ok((await readFile(join(root, '.rer/deploy/production.secrets.env'), 'utf8')) === conflictBytes, 'conflict never overwrites rer custody');
  assert.equal(provider.state.writes.length, writes, 'conflict makes no provider writes');
  await rm(join(root, '.rer/deploy/production.secrets.env'));
  // rer also generated keys beside the legacy hook, which deployed its own named keys over them.
  await writeFile(join(root, '.rer/deploy/staging.secrets.env'), `SESSION_SECRET=${randomBytes(32).toString('hex')}\nUPTIME_RUNNER_KEY=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
  const repeated = await deploy(root, provider, t.signal, [], { inputs: false });
  assert.equal(repeated.code, 0, JSON.stringify({code:repeated.code,errorCodes:repeated.errorCodes}));
  assert.equal(repeated.result?.ok, true);
  assert.equal(repeated.result.deployed, true);
  assert.equal(provider.state.writes.length, writes, 'upgrade repeat performs zero provider writes: ' + JSON.stringify(provider.state.writes.slice(writes).map(({method,path}) => ({method,path}))));
  assert.deepEqual(await readFile(join(root, '.rer/deploy/production.json')), receiptBytes);
  const migrated = await readDeployEnvFile(root, '.rer/deploy/production.secrets.env');
  assert.ok(Object.entries(production).every(([name, value]) => migrated[name] === value), 'upgrade keeps every production key and owner/mail input');
  const staging = await readDeployEnvFile(root, '.rer/deploy/staging.secrets.env');
  assert.ok(Object.entries({ ...production, ...named }).every(([name, value]) => staging[name] === value), 'upgrade keeps every named key and shared owner/mail input');
  for (const path of [legacyProduction, legacyNamed]) await assert.rejects(stat(path), { code: 'ENOENT' });
  const keptBytes = await readFile(join(root, '.rer/deploy/production.secrets.env'));
  await writeFile(legacyProduction, 'old JSON is no longer an input', { mode: 0o600 });
  const afterMove = await deploy(root, provider, t.signal, [], { inputs: false });
  assert.equal(afterMove.code, 0);
  assert.ok((await readFile(legacyProduction, 'utf8')) === 'old JSON is no longer an input', 'completed handoff stops reading old JSON even if a backup is restored');
  await rm(legacyProduction);
  assert.ok((await readFile(join(root, '.rer/deploy/production.secrets.env'))).equals(keptBytes), 'rer-only repeat preserves secret bytes');
  assert.equal(provider.state.writes.length, writes, 'rer-only repeat performs zero provider writes');
  for (const path of [legacyProduction, legacyNamed]) await assert.rejects(stat(path), { code: 'ENOENT' });
  assert.deepEqual(migrationRows(provider), migrations);
  const namedProvider = await providerBridge(t, 'staging');
  const namedDeploy = await deploy(root, namedProvider, t.signal, ['--environment', 'staging'], { inputs: false });
  assert.equal(namedDeploy.code, 0, JSON.stringify({code:namedDeploy.code,errorCodes:namedDeploy.errorCodes}));
  assert.ok(Object.entries(named).filter(([name]) => name !== 'CUSTOM_ENV_SETTING' && name !== 'SETUP_TOKEN').every(([name, value]) => namedProvider.state.secrets.find(item => item.name === name)?.value === value), 'named deploy uses its original environment authority');
  assert.ok((await readDeployEnvFile(root, '.rer/deploy/staging.secrets.env')).CUSTOM_ENV_SETTING === named.CUSTOM_ENV_SETTING, 'undeclared per-environment inputs survive the real command');

  const interruptedRoot = await checkout(t), partialProvider = await providerBridge(t);
  partialProvider.interruptBeforeSecondMigration();
  const interrupted = await deploy(interruptedRoot, partialProvider, t.signal);
  assert.equal(interrupted.code, 1);
  assert.equal(partialProvider.interruptedMigration, true);
  const partial = await state(interruptedRoot);
  assert.equal(partial.owned.d1['uptime-monitor-production-db'].status, 'created');
  assert.equal(partial.owned.worker.status, 'pending');
  assert.equal(partial.receipt, null);
  assert.equal(partialProvider.uploads.length, 0);
  const firstMigration = migrationRows(partialProvider);
  assert.equal(firstMigration.length, 1);
  assert.equal(firstMigration[0].state, 'applied');
  const partialSecrets = await readFile(join(interruptedRoot, '.rer/deploy/production.secrets.env'));
  const resumed = await deploy(interruptedRoot, partialProvider, t.signal);
  assert.equal(resumed.code, 0, JSON.stringify(resumed));
  assert.equal(resumed.result?.ok, true);
  assert.equal(resumed.result.deployed, true);
  assert.equal(partialProvider.state.databases.length, 1);
  assert.equal(partialProvider.state.writes.filter(row => row.path === '/d1/database').length, 1);
  const finalMigrations = migrationRows(partialProvider);
  assert.deepEqual(finalMigrations, migrations);
  assert.deepEqual(finalMigrations[0], firstMigration[0]);
  for (const migration of finalMigrations) {
    assert.equal(partialProvider.state.writes.filter(row => row.body?.sql?.startsWith('INSERT INTO d1_migrations') && row.body.sql.includes(migration.name)).length, 1, 'each migration is claimed once');
  }
  assert.equal(partialProvider.uploads.length, 1);
  assert.equal(partialProvider.state.secrets.find(item => item.name === 'SENDGRID_API_KEY')?.value, 'test-only-sendgrid-key', 'explicit SendGrid maps the shared MAIL_API_KEY to its native Worker secret');
  assert.equal(partialProvider.state.secrets.find(item => item.name === 'MAIL_PROVIDER')?.value, 'sendgrid');
  assert.ok(!partialProvider.state.secrets.some(item => item.name === 'MAIL_API_KEY'), 'the shared input is not uploaded as a second Worker secret');
  assert.ok((await state(interruptedRoot)).receipt);
  assert.ok((await readFile(join(interruptedRoot, '.rer/deploy/production.secrets.env'))).equals(partialSecrets), 'resume preserves secret bytes');
  assert.ok(partialProvider.healthRequests > 0, 'resumed deployment verifies the served deployment identity');
  // Removing only our isolated local ownership proof makes the same provider
  // resource foreign; no controller may adopt it based on its name.
  await rm(join(root, '.rer/deploy/production.json'));
  const collision = await deploy(root, provider, t.signal);
  assert.equal(collision.code, 1);
  assert.equal(collision.result?.ok, false);
  assert.deepEqual(collision.errorCodes, ['owner_deploy_failed']);
  assert.equal(provider.state.writes.length, writes, 'foreign collision refuses before any mutation');
  assert.deepEqual(migrationRows(provider), migrations);
  assert.equal(provider.uploads.length, 1, 'repeat and foreign collision never upload another worker');
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '');
  await writeFile(join(root, '.rer/deploy/production.json'), receiptBytes, { mode: 0o600 });
  const uploadsBeforeRemoval = provider.uploads.length;
  const removed = await deploy(root, provider, t.signal, ['--remove', '--yes']);
  assert.deepEqual({
    code: removed.code, ok: removed.result?.ok, deployed: removed.result?.deployed,
    removed: removed.result?.removed?.toSorted(), worker: provider.state.settings,
    databases: provider.state.databases.length, uploads: provider.uploads.length,
  }, {
    code: 0, ok: true, deployed: false,
    removed: ['d1:uptime-monitor-production-db', 'worker:uptime-monitor-production'],
    worker: null, databases: 0, uploads: uploadsBeforeRemoval,
  }, 'remove uses shared removal without uploading a deployment');
  // A fresh mail-off deployment uses its ordinary owner bootstrap, then the
  // actual rer signin command against that exact recorded account and Worker.
  const offRoot=await checkout(t),offProvider=await providerBridge(t);
  offProvider.state.workersFree = true;
  const mailOffInputs={OWNER_EMAIL:'synthetic-uptime-620@example.test'};
  const incompletePlan=await deploy(offRoot,offProvider,t.signal,['--dry-run'],{inputs:mailOffInputs,ownerName:null});
  assert.notEqual(incompletePlan.code,0,'a fresh checkout cannot deploy without its owner name');
  assert.ok(incompletePlan.messages.some(message=>message.includes('--owner-name')),'the dry run explains how to supply the missing name');
  assert.equal(offProvider.state.calls.length,0,'an incomplete dry run never contacts the provider');
  const omittedWithKey=await deploy(offRoot,offProvider,t.signal,[],{inputs:{OWNER_EMAIL:'synthetic-uptime-620@example.test',SENDGRID_API_KEY:'synthetic-uptime-omitted-key'}});
  assert.notEqual(omittedWithKey.code,0,'a sending key without a selector cannot enable mail');
  assert.ok(omittedWithKey.messages.some(message=>message.includes('Remove it or choose a mail provider')),'the refusal explains the declared mail-off default');
  for(const selector of ['later','']) {
    const invalid=await deploy(offRoot,offProvider,t.signal,[],{inputs:{OWNER_EMAIL:'synthetic-uptime-620@example.test',MAIL_PROVIDER:selector}});
    assert.notEqual(invalid.code,0,'invalid explicit selectors refuse');
    assert.equal(offProvider.state.writes.length,0,'invalid explicit selectors never mutate the provider');
  }
  const callsBeforeDryRun=offProvider.state.calls.length;
  const offPlan=await deploy(offRoot,offProvider,t.signal,['--dry-run'],{inputs:mailOffInputs});
  assert.equal(offPlan.code,0,JSON.stringify(offPlan));
  assert.equal(offPlan.result?.dryRun,true);
  assert.deepEqual(offPlan.result.plan.workersPaidLimits, configuredLimits, 'offline dry run reads back the compiled Paid limits');
  assert.equal(offProvider.state.calls.length,callsBeforeDryRun,'mail-off dry run never contacts the provider');
  assert.equal(offProvider.state.writes.length,0,'mail-off dry run never mutates the provider');
  offProvider.state.workersPlanLookupFails = true;
  const refusedPlan = await deploy(offRoot, offProvider, t.signal, [], { inputs: mailOffInputs });
  assert.ok(refusedPlan.errorCodes.includes('workers_plan_lookup_failed'), 'a failed account plan lookup stops deployment');
  assert.equal(offProvider.state.writes.length, 0, 'a failed account plan lookup stops before provisioning');
  offProvider.state.workersPlanLookupFails = false;
  const off=await deploy(offRoot,offProvider,t.signal,[],{inputs:{OWNER_EMAIL:'synthetic-uptime-620@example.test'}});
  assert.equal(off.code,0,JSON.stringify(off));
  assert.equal((await settings(offProvider, off.result.worker)).limits, undefined, 'Free deployment reads back without custom limits');
  const mailProvider=()=>offProvider.state.secrets.find(s=>s.name==='MAIL_PROVIDER')?.value ?? offProvider.state.settings.bindings.find(s=>s.name==='MAIL_PROVIDER')?.text;
  assert.equal(mailProvider(),'none','an omitted selector without sending inputs uses the declared mail-off default');
  assert.ok(!offProvider.state.secrets.some(s=>s.name==='MAIL_FROM'||s.name.includes('API_KEY')));
  // Change the existing installation through the public CLI. Grouped changes
  // copy the active Worker and deploy one version, preserving owner/data/keys.
  const offIdentity=await state(offRoot), offDatabase=offProvider.state.databases[0];
  const ownerRows=()=>offDatabase.db.prepare('SELECT * FROM oa_bootstrap').all();
  const ownerBefore=ownerRows(), offMigrations=migrationRows(offProvider);
  const keysBefore=offProvider.state.secrets.filter(s=>['SESSION_SECRET','UPTIME_RUNNER_KEY'].includes(s.name));
  const scriptBefore=offProvider.state.version.resources.script.etag;
  const versionBefore=offProvider.state.version.id, uploadsBefore=offProvider.uploads.length;
  const mailFile='.rer/deploy/mail-switch.env';
  await writeFile(join(offRoot,mailFile),'MAIL_FROM=sender@synthetic-uptime.dev\nSENDGRID_API_KEY=synthetic-uptime-mail-switch-key\n',{mode:0o600});
  const enabled=await deploy(offRoot,offProvider,t.signal,[
    '--set-secret','MAIL_PROVIDER=sendgrid','--set-secret','MAIL_FROM','--set-secret','SENDGRID_API_KEY','--env-file',mailFile,
  ],{inputs:false});
  assert.equal(enabled.code,0,JSON.stringify(enabled));
  assert.equal(mailProvider(),'sendgrid');
  assert.equal(offProvider.uploads.length,uploadsBefore,'enable copies the existing Worker instead of re-uploading the product');
  assert.equal(offProvider.state.version.resources.script.etag,scriptBefore,'enable preserves the existing Worker code');
  assert.equal(offProvider.state.secrets.find(s=>s.name==='SENDGRID_API_KEY')?.value,'synthetic-uptime-mail-switch-key');
  assert.equal(offProvider.state.secrets.find(s=>s.name==='MAIL_FROM')?.value,'sender@synthetic-uptime.dev');
  assert.notEqual(offProvider.state.version.id,versionBefore,'enable changes the active version');
  const enabledVersion=offProvider.state.version.id;
  const held=await deploy(offRoot,offProvider,t.signal,[],{inputs:false});
  assert.equal(held.code,0,JSON.stringify(held));
  assert.equal(mailProvider(),'sendgrid','a plain deploy retains the selected provider');
  assert.equal(offProvider.state.secrets.find(s=>s.name==='SENDGRID_API_KEY')?.value,'synthetic-uptime-mail-switch-key','a plain deploy preserves the opaque sending credential');
  assert.equal(offProvider.state.secrets.find(s=>s.name==='MAIL_FROM')?.value,'sender@synthetic-uptime.dev','a plain deploy preserves the opaque sender');
  const uploadsBeforeDisable=offProvider.uploads.length, codeBeforeDisable=offProvider.state.version.resources.script.etag;
  const disabled=await deploy(offRoot,offProvider,t.signal,[
    '--unset-secret','MAIL_PROVIDER,MAIL_FROM,SENDGRID_API_KEY',
  ],{inputs:false});
  assert.equal(disabled.code,0,JSON.stringify(disabled));
  assert.equal(mailProvider(),'none','unsetting the selector restores its public default');
  assert.equal(offProvider.uploads.length,uploadsBeforeDisable,'disable copies the existing Worker instead of re-uploading the product');
  assert.equal(offProvider.state.version.resources.script.etag,codeBeforeDisable,'disable preserves the existing Worker code');
  assert.equal(offProvider.state.settings.bindings.find(s=>s.name==='MAIL_PROVIDER')?.type,'plain_text');
  assert.ok(!offProvider.state.secrets.some(s=>['MAIL_PROVIDER','MAIL_FROM','SENDGRID_API_KEY','MAIL_API_KEY'].includes(s.name)),'sending overrides are removed together');
  assert.notEqual(offProvider.state.version.id,enabledVersion,'disable changes the active version');
  const stillOff=await deploy(offRoot,offProvider,t.signal,[],{inputs:false});
  assert.equal(stillOff.code,0,JSON.stringify(stillOff));
  assert.equal(mailProvider(),'none','a plain deploy after unset remains off');
  assert.deepEqual((await state(offRoot)).owned,offIdentity.owned,'switches retain resource custody');
  assert.equal(offProvider.state.databases[0],offDatabase,'switches keep the same database');
  assert.deepEqual(ownerRows(),ownerBefore,'switches preserve the admitted owner');
  assert.deepEqual(migrationRows(offProvider),offMigrations,'switches preserve migration history');
  assert.deepEqual(offProvider.state.secrets.filter(s=>['SESSION_SECRET','UPTIME_RUNNER_KEY'].includes(s.name)),keysBefore,'switches preserve installation authority');
  assert.equal(offProvider.state.calls.filter(call=>call.path.endsWith('/content/v2')).length,2,'each grouped switch reads the active code');
  const signed=await deploy(offRoot,offProvider,t.signal,[],{inputs:false,verb:'signin'});
  assert.equal(signed.code,0);
  assert.ok(signed.result?.link,'guarded command returns its one-time link only to its caller');
  const grantRows=offProvider.state.databases[0].db.prepare('SELECT token_hash FROM oa_owner_signins').all();
  assert.equal(grantRows.length,1);
  assert.ok(!JSON.stringify(grantRows).includes(new URL(signed.result.link).searchParams.get('token')),'only the grant hash is stored');
  const preview=await offProvider.fetch(signed.result.link,{method:'GET',headers:{}});
  assert.equal(preview.status,200,'owner grant GET is a confirmation, not admission');
  const useGrant=()=>offProvider.fetch(new URL(signed.result.link).origin+'/auth/owner-signin',{method:'POST',headers:{origin:new URL(signed.result.link).origin},body:JSON.stringify({token:new URL(signed.result.link).searchParams.get('token')})});
  assert.equal((await useGrant()).status,303,'guarded owner grant opens one native session');
  const replay=await useGrant();
  assert.equal(replay.status,400,'used owner grant cannot be replayed');
  assert.equal(replay.headers.get('set-cookie'),null);
  const missingCredentials=await deploy(offRoot,offProvider,t.signal,[],{inputs:{CLOUDFLARE_API_TOKEN:''},verb:'signin'});
  assert.notEqual(missingCredentials.code,0);
  const wrongEnvironment=await deploy(offRoot,offProvider,t.signal,['--environment','staging'],{inputs:false,verb:'signin'});
  assert.notEqual(wrongEnvironment.code,0);
  const offReceipt=await readFile(join(offRoot,'.rer/deploy/production.json'));
  await rm(join(offRoot,'.rer/deploy/production.json'));
  const refused=await deploy(offRoot,offProvider,t.signal,[],{inputs:false,verb:'signin'});
  assert.notEqual(refused.code,0,'missing deployment receipt cannot sign in');
  assert.equal(offProvider.state.databases[0].db.prepare('SELECT count(*) AS n FROM oa_owner_signins').get().n,1);
  await writeFile(join(offRoot,'.rer/deploy/production.json'),offReceipt,{mode:0o600});
  if(process.env.UPTIME_OWNER_MAIL_SWITCH_RECEIPT)await writeFile(process.env.UPTIME_OWNER_MAIL_SWITCH_RECEIPT,JSON.stringify({journey:'real rer deploy lifecycle',omittedSelectorDefaultsToNone:true,omittedSelectorWithKeyRefused:true,ownedPrivateEnvFileEnable:true,explicitSendgridDeployment:true,noneToSendgrid:true,sendgridToUnsetDefaultNone:true,plainDeployPreservesSelection:true,workerSendingOverridesRemoved:true,workerAndDatabaseCustodyPreserved:true,admittedOwnerPreserved:true,installationKeysPreserved:true,workerCodePreserved:true,providerEdge:'fake Cloudflare; no real mail provider'},null,2)+'\n');
  if(process.env.UPTIME_OWNER_MAIL_OFF_RECEIPT)await writeFile(process.env.UPTIME_OWNER_MAIL_OFF_RECEIPT,JSON.stringify({journey:'real rer deploy lifecycle',provider:'none',freshDeployment:true,ownerAdmittedByNativeBootstrap:true,runtimeBindingOff:true,sendingInputsAbsent:true,guardedRerSignin:true,onlyGrantHashStored:true,confirmationRequired:true,replayRefused:true,missingCredentialsRefused:true,wrongEnvironmentRefused:true,missingReceiptRefused:true},null,2)+'\n');

});
