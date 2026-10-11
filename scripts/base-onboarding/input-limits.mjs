// SETUP's shared validateSetupValue contract permits 16,384 UTF-16 units.
export const SETUP_VALUE_LIMIT = 16384;
// JSON can escape each unit as six ASCII bytes. Bound requests by declared
// fields, while accepting any valid combination, including secure envelopes.
export function setupInputLimit(model) {
 return 1024 + Object.keys(model.fields).reduce((size,key)=>size+6*(key.length+SETUP_VALUE_LIMIT)+16,0);
}
