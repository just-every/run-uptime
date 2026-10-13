import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { assert, hexId } from './validation.mjs';
import { regularBytes } from './artifact.mjs';
import { packageBuild } from './prepare.mjs';
import { cloudflare } from './provider.mjs';
import { ownerTarget, ownerPlan, ownerDeploy, ownerHealth } from './owner.mjs';
import { refuseLocalModels } from './local-only.mjs';

export const cronNotice = 'This Worker has a Cron Trigger. Cloudflare may take up to about two hours to start its first scheduled run on some accounts.';
const usage = 'usage: owner-cli.mjs deploy|health --declaration <file> --environment <name> [--product <dir>] [--state <file>]';

/** The owner's committed source and existing local build. Run the seed's build first. */
async function ownerArtifact(root, product) {
  const git = (...args) => { try { return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); } catch { throw new Error('owner-source-not-a-git-checkout'); } };
  const source = {sha:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')};
  assert(!git('status','--porcelain','--untracked-files=no'),'owner-source-not-committed');
  return packageBuild({root,source,runIdentity:{id:'0',attempt:'1'},productDirectory:product});
}

/** Inputs: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, plus the secrets the declaration names on first deploy. */
export async function main(argv = process.argv.slice(2), env = process.env, {fetch = globalThis.fetch, cwd = process.cwd(), healthOptions, localOnlyKeys = [], notice = line => console.error(line)} = {}) {
  let parsed;
  try { parsed = parseArgs({args:argv,allowPositionals:true,strict:true,options:{declaration:{type:'string'},environment:{type:'string'},product:{type:'string',default:''},state:{type:'string'}}}); }
  catch { throw new Error('usage'); }
  const {positionals:[command,...rest],values} = parsed;
  if (!['deploy','health'].includes(command) || rest.length || !values.declaration || !values.environment) throw new Error('usage');
  await refuseLocalModels(resolve(cwd));
  const missing = ['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN'].filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) { const error = new Error('missing-input'); error.inputs = missing; throw error; }
  assert(hexId(env.CLOUDFLARE_ACCOUNT_ID) && !/[\r\n]/.test(env.CLOUDFLARE_API_TOKEN),'invalid-cloudflare-input');
  const root = resolve(cwd);
  let declaration;
  try { declaration = JSON.parse(await regularBytes(resolve(root,values.declaration),256 * 1024)); }
  catch (error) { throw new Error(error.code === 'ENOENT' ? 'missing-owner-declaration' : 'invalid-owner-declaration'); }
  assert(typeof declaration?.project === 'string','missing-owner-project');
  const api = cloudflare({accountId:env.CLOUDFLARE_ACCOUNT_ID,token:env.CLOUDFLARE_API_TOKEN,fetch});
  const target = await ownerTarget(api,{project:declaration.project,environment:values.environment});
  const statePath = values.state ? resolve(root,values.state) : join(root,'.rer','deploy',`${target.environment}.json`);
  const artifact = await ownerArtifact(root,values.product);
  const plan = ownerPlan(target,declaration,artifact,{localOnlyKeys});
  if (command === 'health') {
    await ownerHealth({api,target,plan,statePath,fetch,healthOptions:{...healthOptions,readiness:{single:true,totalMs:30000}}});
    return {ok:true,worker:target.worker,origin:target.origin};
  }
  // Dispatch is the provider's: on some accounts a new Cron starts only at the account scheduler's next refresh.
  if (plan.crons.length) notice(cronNotice);
  const {receipt,created} = await ownerDeploy({api,target,plan,artifact,statePath,env,fetch,healthOptions});
  return {ok:true,changed:receipt.changed,worker:target.worker,origin:receipt.origin,versionId:receipt.provider.versionId,created,state:statePath};
}

/** Prints refusal codes and resource names only; never inputs, tokens or provider bodies. */
export function report(error) {
  if (error.message === 'missing-input') return {ok:false,code:'missing-input',inputs:error.inputs};
  if (error.message === 'usage') return {ok:false,code:'usage',usage};
  return {ok:false,code:/^[a-zA-Z0-9_-]{1,120}$/.test(error.message) ? error.message : 'owner-deploy-failed',...(error.resource ? {resource:error.resource} : {})};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await main())); }
  catch (error) { console.error(JSON.stringify(report(error))); process.exitCode = error.message === 'local-only-binding' ? 4 : 1; }
}
