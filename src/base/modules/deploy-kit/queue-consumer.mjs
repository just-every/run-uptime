import { resourceName } from './validation.mjs';

/** Decode the documented and observed Worker consumer identity wire variants. */
export function workerConsumerScript(consumer) {
  if (!consumer || typeof consumer !== 'object' || Array.isArray(consumer) || consumer.type !== 'worker') return null;
  const fields = ['script_name','script'].filter(key => Object.hasOwn(consumer,key));
  if (!fields.length || fields.some(key => !resourceName(consumer[key]) || consumer[key] !== consumer[key].trim())) return null;
  const script = consumer[fields[0]];
  return fields.every(key => consumer[key] === script) ? script : null;
}
