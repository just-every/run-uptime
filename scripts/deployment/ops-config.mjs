import {lstat} from 'node:fs/promises';
import {validateConfiguration as validateNative} from '../../src/domain/startup-config.mjs';
import {defaultSettingsPath,readLocalSettings} from '../local-settings.mjs';
// The operations inspector checks deployment inputs from the shell. Local
// development uses its saved settings, with the same guards as setup and dev.
export async function validateConfiguration(env) {
 validateNative(env,{scope:'deploy',suppliedOnly:true});
 const saved=await lstat(defaultSettingsPath).catch(error=>{if(error.code!=='ENOENT')throw error});
 if(saved)await readLocalSettings();
}
