import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {inspectOperations} from '@runeditrun/rer/operations';
import {readFile,lstat} from 'node:fs/promises';
import {validateConfiguration as validateNative} from '../../src/domain/startup-config.mjs';
import {defaultSettingsPath,readLocalSettings} from '../local-settings.mjs';
// The operations inspector checks deployment inputs from the shell. Local
// development uses its saved settings, with the same guards as setup and dev.
export async function validateConfiguration(env) {
 validateNative(env,{scope:'deploy',suppliedOnly:true});
 const saved=await lstat(defaultSettingsPath).catch(error=>{if(error.code!=='ENOENT')throw error});
 if(saved)await readLocalSettings();
}

// Base's declarative whenUnset supports hosted providers only. Apply the seed's
// public source default before asking the unmodified inspector to check inputs.
// Keep the descriptor's hosted-only fallback for generic rer doctor compatibility;
// this deployment entry point always resolves the public selector first.
export async function inspectDeployment(root=process.cwd(),env=process.env) {
 const declaration=JSON.parse(await readFile(resolve(root,'deploy.json'),'utf8'));
 return inspectOperations(root,{...env,MAIL_PROVIDER:env.MAIL_PROVIDER ?? declaration.vars.MAIL_PROVIDER});
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 inspectDeployment().then(result=>{
  console.log(JSON.stringify(result,null,2));
  process.exitCode=result.ok?0:1;
 });
}
