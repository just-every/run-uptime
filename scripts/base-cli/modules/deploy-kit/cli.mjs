import { writeFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, hash } from './validation.mjs';
import { readArtifact, regularBytes } from './artifact.mjs';
import { cloudflare } from './provider.mjs';
import { defaultStagePlan } from './default-stage.mjs';
import { deploy } from './deploy.mjs';
import { verifyHealth } from './health.mjs';
import { verifyTeardown } from './teardown.mjs';
import { writeHealthReceipt } from './receipt.mjs';

export async function main(args=process.argv.slice(2),env=process.env) {
  assert(args.length === 1 && ['deploy','health','verify-teardown'].includes(args[0]),'usage-deploy-health-or-verify-teardown');
  assert(!env.NODE_OPTIONS && !env.NODE_PATH && !env.EVIDENCE_WRITE_TOKEN,'unsafe-deploy-environment');
  const required = ['RER_DEPLOY_ARTIFACT','RER_DEPLOY_ARTIFACT_SHA256','RER_DEPLOY_SOURCE_SHA','RER_DEPLOY_RUN_ID','RER_DEPLOY_RUN_ATTEMPT','RER_DEPLOY_RECEIPT','CF_THROWAWAY_ACCOUNT_ID','CF_THROWAWAY_API_TOKEN'];
  const missing = required.filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) { const error = new Error('missing-input'); error.inputs = missing; throw error; }
  for (const key of ['RER_DEPLOY_ARTIFACT','RER_DEPLOY_RECEIPT']) assert(env[key] === resolve(env[key]),'input-path-must-be-absolute');
  const expected = {sha256:env.RER_DEPLOY_ARTIFACT_SHA256,sourceSha:env.RER_DEPLOY_SOURCE_SHA,runId:env.RER_DEPLOY_RUN_ID,runAttempt:env.RER_DEPLOY_RUN_ATTEMPT};
  const artifact = await readArtifact(env.RER_DEPLOY_ARTIFACT,expected);
  const plan = defaultStagePlan(artifact);
  const api = cloudflare({accountId:env.CF_THROWAWAY_ACCOUNT_ID,token:env.CF_THROWAWAY_API_TOKEN});
  let previousReceipt;
  try {
    const stat = await lstat(env.RER_DEPLOY_RECEIPT); assert((stat.mode & 0o077) === 0,'receipt-permissions');
    previousReceipt = JSON.parse(await regularBytes(env.RER_DEPLOY_RECEIPT,1024*1024));
    assert(previousReceipt.run?.id === artifact.run.id && previousReceipt.run?.attempt === artifact.run.attempt && previousReceipt.source?.sha === artifact.source.sha && previousReceipt.artifactSha256 === expected.sha256,'receipt-custody-mismatch');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (args[0] === 'verify-teardown') {
    const result = await verifyTeardown({api,plan,receipt:previousReceipt});
    console.log(JSON.stringify(result));
    return result;
  }
  if (args[0] === 'health') {
    assert(previousReceipt && hash(previousReceipt.config) === previousReceipt.configSha256,'missing-or-invalid-receipt');
    await verifyHealth({api,plan,receipt:previousReceipt,readiness:{single:true,totalMs:30000}});
  } else {
    const receipt = await deploy({api,plan,artifact,artifactSha256:expected.sha256,previousReceipt,repeatOnly:Boolean(previousReceipt),
      onHealth: async candidate => { if (!previousReceipt) await writeHealthReceipt(env.RER_DEPLOY_RECEIPT,candidate); },
      onReceipt: async candidate => {
        if (!previousReceipt) await writeFile(env.RER_DEPLOY_RECEIPT,JSON.stringify(candidate,null,2)+'\n',{flag:'wx',mode:0o600});
      }});
    // A true repeat retains the original receipt byte-for-byte. A changed build needs a new receipt path/run.
    if (previousReceipt) assert(receipt.changed === false,'existing-receipt-cannot-be-overwritten');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(); } catch (error) { console.error(JSON.stringify(error.message === 'missing-input' ? {ok:false,code:'missing-input',inputs:error.inputs} : {ok:false,code:/^(health-|malformed-response|response-too-large|teardown-)/.test(error.message) ? error.message : 'deploy-kit-command-failed',...(error.attempts ? {attempts:error.attempts} : {}),...(error.remaining ? {remaining:error.remaining} : {})})); process.exitCode=1; }
}
