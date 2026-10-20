// API-004 cleanup debt: one retained record for each cleanup step a run could not complete. A debt holds no extracted value,
// credential or response body. It is separate from monitor health: it never makes a failing target Healthy or a healthy one
// Failed, and a later passing run never closes it; only the owner's explicit resolution does. At the limit, the monitor's
// next run refuses new setup and reads Unknown with the named reason.
import {failureCategory,incompleteCleanup} from './api-transaction-evidence.mjs';
export const CLEANUP_DEBT_LIMIT = 3;
export const RESOLUTION_NOTE_CHARS = 300;
export const hasFixtures = definition => definition.type === 'api' ? definition.api?.steps?.some(step => step.phase === 'cleanup') === true : definition.type === 'flow' && Boolean(definition.flow?.fixtures);
export const debtRefusal = () => ({assertion: 'debt', pass: false, reason: `Setup refused: ${CLEANUP_DEBT_LIMIT} cleanup debts are open for this monitor. Resolve one before setup runs again.`});
/** The debts an accepted observation leaves: its cleanup steps that ended in a failure. */
export function observationDebts(slot, observation) {
  const steps = observation.apiTransaction?.steps ?? observation.fixtures?.steps ?? [];
  return incompleteCleanup(steps).map(({step, index}) => ({
    id: `${slot.id}:${observation.probe}:${observation.attempt}:${index}`, monitor_id: slot.monitor_id, revision: slot.revision, slot_id: slot.id,
    probe: observation.probe, attempt: observation.attempt, observation_id: observation.id, step_name: step.name, attempts: step.attempts ?? 1,
    category: failureCategory(step),
  }));
}
export function resolutionNote(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'note')) throw Error('A resolution takes one short note');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!note || note.length > RESOLUTION_NOTE_CHARS || /[\x00-\x1f\x7f]/.test(note)) throw Error(`A resolution note is 1 to ${RESOLUTION_NOTE_CHARS} plain characters`);
  return note;
}
