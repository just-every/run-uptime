import {validateConfiguration as validateNative} from '../../src/domain/startup-config.mjs';
// The operations inspector checks the selected loop's required inputs. Keep the
// native guards here too, including refusal of credentials while mail is off.
export function validateConfiguration(env) {
 validateNative(env,{scope:'deploy',suppliedOnly:true});
}
