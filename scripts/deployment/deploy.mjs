// Run this reviewed controller in a separate credential-bearing process after
// prepare has exited. Never install/build candidate code in this process.
import {lstat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readArtifact,regularBytes} from '../../src/base/modules/deploy-kit/artifact.mjs';
import {cloudflare} from '../../src/base/modules/deploy-kit/provider.mjs';
import {deploy} from '../../src/base/modules/deploy-kit/deploy.mjs';
import {verifyHealth} from '../../src/base/modules/deploy-kit/health.mjs';
import {assert,hash} from '../../src/base/modules/deploy-kit/validation.mjs';
import {deploymentPlan} from './plan.mjs';
import {deploymentFailureCode} from './diagnostics.mjs';
try{
 const env=process.env,action=process.argv[2];assert(['deploy','health'].includes(action),'usage-deploy-or-health');
 assert(!env.NODE_OPTIONS&&!env.NODE_PATH,'unsafe-node-environment');
 for(const key of ['RER_DEPLOY_ARTIFACT','RER_DEPLOY_ARTIFACT_SHA256','RER_DEPLOY_SOURCE_SHA','RER_DEPLOY_RUN_ID','RER_DEPLOY_RUN_ATTEMPT','RER_DEPLOY_RECEIPT','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN'])assert(env[key],`missing-${key}`);
 for(const key of ['RER_DEPLOY_ARTIFACT','RER_DEPLOY_RECEIPT'])assert(env[key]===resolve(env[key]),'absolute-path-required');
 const artifact=await readArtifact(env.RER_DEPLOY_ARTIFACT,{sha256:env.RER_DEPLOY_ARTIFACT_SHA256,sourceSha:env.RER_DEPLOY_SOURCE_SHA,runId:env.RER_DEPLOY_RUN_ID,runAttempt:env.RER_DEPLOY_RUN_ATTEMPT});
 const plan=deploymentPlan(artifact,env),api=cloudflare({accountId:env.CLOUDFLARE_ACCOUNT_ID,token:env.CLOUDFLARE_API_TOKEN});let previousReceipt;
 try{assert(((await lstat(env.RER_DEPLOY_RECEIPT)).mode&0o077)===0,'receipt-permissions');previousReceipt=JSON.parse(await regularBytes(env.RER_DEPLOY_RECEIPT,1024*1024));assert(previousReceipt.source.sha===artifact.source.sha&&previousReceipt.run.id===artifact.run.id&&previousReceipt.run.attempt===artifact.run.attempt&&previousReceipt.artifactSha256===env.RER_DEPLOY_ARTIFACT_SHA256,'receipt-custody-mismatch')}catch(error){if(error.code!=='ENOENT')throw error}
 if(action==='health'){assert(previousReceipt&&hash(previousReceipt.config)===previousReceipt.configSha256,'missing-or-invalid-receipt');await verifyHealth({api,plan,receipt:previousReceipt})}
 else await deploy({api,plan,artifact,artifactSha256:env.RER_DEPLOY_ARTIFACT_SHA256,previousReceipt,repeatOnly:Boolean(previousReceipt),env,onReceipt:async receipt=>{if(!previousReceipt)await writeFile(env.RER_DEPLOY_RECEIPT,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600})}});
 console.log(JSON.stringify({ok:true,action}));
}catch(error){console.error(JSON.stringify({ok:false,code:deploymentFailureCode(error)}));process.exitCode=1}
