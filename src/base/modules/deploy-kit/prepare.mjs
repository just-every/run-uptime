import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, hash, localPath } from './validation.mjs';
import { collectFiles, regularBytes, validateArtifact, MAX_ARTIFACT } from './artifact.mjs';
import { collectBuildModules } from './build-modules.mjs';
import { refuseLocalModels } from './local-only.mjs';

export function assertCredentialFree(env) {
  for (const [key,value] of Object.entries(env)) if (value && /(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|AUTHORIZATION|COOKIE|CREDENTIAL)/i.test(key)) throw new Error('prepare-credential-environment-forbidden');
  assert(!env.NODE_OPTIONS && !env.NODE_PATH,'prepare-node-injection-forbidden');
}
function run(argv, cwd, env) {
  try { return execFileSync(argv[0],argv.slice(1),{cwd,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15*60*1000,maxBuffer:1024*1024}); }
  catch { throw new Error('prepare-command-failed'); }
}
export async function packageBuild({root,source,runIdentity,productDirectory = 'default-seed'}) {
  assert(productDirectory === '' || localPath(productDirectory), 'invalid-product-directory');
  const product = join(root,productDirectory);
  await refuseLocalModels(root);
  if (product !== root) await refuseLocalModels(product);
  const build = join(product,'dist/server');
  const config = JSON.parse(await regularBytes(join(build,'wrangler.json'),1024*1024));
  const main = localPath(relative(build,resolve(build,config.main)));
  const modules = await collectBuildModules(build,config,main);
  const assets = await collectFiles(join(product,'dist/client'));
  const migrations = [];
  for (const name of (await readdir(join(product,'migrations/core'))).sort()) {
    assert(/^[0-9]+_[a-zA-Z0-9_-]+\.sql$/.test(name),'unexpected-migration-file');
    const sql = (await regularBytes(join(product,'migrations/core',name),512000)).toString('utf8'); migrations.push({binding:'DB',name,sql,sha256:hash(sql)});
  }
  const artifact = {version:1,source,run:runIdentity,main,modules,assets,migrations}; validateArtifact(artifact);
  return artifact;
}
export async function prepare(env = process.env) {
  assertCredentialFree(env);
  assert(process.platform === 'linux' && env.RER_PREPARE_ISOLATION === 'ephemeral-credential-free-job','prepare-requires-isolated-linux-job');
  assert(/^[a-f0-9]{40}$/.test(env.RER_DEPLOY_SOURCE_SHA ?? '') && /^\d+$/.test(env.RER_DEPLOY_RUN_ID ?? '') && /^\d+$/.test(env.RER_DEPLOY_RUN_ATTEMPT ?? ''),'missing-prepare-identity');
  const root = process.cwd();
  assert(env.RER_DEPLOY_ARTIFACT && resolve(env.RER_DEPLOY_ARTIFACT) !== root && !resolve(env.RER_DEPLOY_ARTIFACT).startsWith(root+'/'),'artifact-must-be-outside-checkout');
  const home = resolve(env.RER_PREPARE_HOME ?? ''); assert(home !== root && !home.startsWith(root+'/') && env.RER_PREPARE_HOME,'missing-isolated-home');
  await mkdir(home,{recursive:false,mode:0o700});
  try {
  const cleanEnv = {PATH:env.PATH,HOME:home,CI:'true',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false'};
  const git = (...args) => run(['git',...args],root,cleanEnv).trim();
  const source = {sha:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')};
  assert(source.sha === env.RER_DEPLOY_SOURCE_SHA && !git('status','--porcelain','--untracked-files=no'),'prepare-source-mismatch');
  run(['pnpm','install','--frozen-lockfile'],root,cleanEnv);
  run(['pnpm','--dir','default-seed','build'],root,cleanEnv);
  assert(git('rev-parse','HEAD') === source.sha && !git('status','--porcelain','--untracked-files=no'),'source-changed-during-build');
  const artifact = await packageBuild({root,source,runIdentity:{id:env.RER_DEPLOY_RUN_ID,attempt:env.RER_DEPLOY_RUN_ATTEMPT}});
  const bytes = JSON.stringify(artifact); assert(Buffer.byteLength(bytes) <= MAX_ARTIFACT,'artifact-too-large');
  await writeFile(env.RER_DEPLOY_ARTIFACT,bytes,{flag:'wx',mode:0o600});
  // Public digest only. The trusted artifact service binds it to the run/source; stdout alone is not custody.
  return {sha256:hash(bytes),source,run:artifact.run};
  } finally { await rm(home,{recursive:true,force:true}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { assert(process.argv.length === 2,'prepare-no-arguments'); console.log(JSON.stringify(await prepare())); }
  catch { console.error('deploy-kit-prepare-failed'); process.exitCode=1; }
}
