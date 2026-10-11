import { readOperations, inspectOperations } from '../../operations/operations.mjs';
/** Only for reviewed project descriptors; operations v1's existing adapter contract remains unchanged. */
export async function check(root, env = {}) {
  const {descriptor} = await readOperations(root);
  if (descriptor.configuration?.module) throw new Error('deploy-check-refuses-executable-configuration');
  if (descriptor.version !== 2) throw new Error('deploy-check-requires-declarative-v2');
  return inspectOperations(root,env);
}
export async function mailPlan(options, dependencies) {
  // The mail module's portable interface. Imported only for an explicitly requested offline doctor plan.
  const { mailDoctor } = await import('../mail/index.mjs');
  return mailDoctor({...options,live:false},dependencies);
}
