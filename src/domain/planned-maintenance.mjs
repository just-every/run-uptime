import {maintenanceOccurrences,mergeIntervals} from './planned-maintenance/calendar.mjs';
import {DAY_MS} from './planned-maintenance/schema.mjs';
export {validateMaintenanceWindows,timestamp} from './planned-maintenance/schema.mjs';
export {maintenanceOccurrences} from './planned-maintenance/calendar.mjs';

export function activeMaintenance(definition, now = Date.now()) {
  const active = (definition.maintenanceWindows ?? []).flatMap(window => maintenanceOccurrences(window,now,now+1))
    .filter(window => window.startsAt !== null && window.startsAt <= now && window.endsAt > now);
  if (definition.maintenanceUntil > now) active.push({windowId:'legacy-maintenance',mode:'suppress',startsAt:0,endsAt:definition.maintenanceUntil});
  if (!active.length) return null;
  return {mode:active.some(window => window.mode === 'pause')?'pause':'suppress',
    startsAt:Math.min(...active.map(window => window.startsAt)),endsAt:Math.max(...active.map(window => window.endsAt)),windowIds:active.map(window => window.windowId)};
}

/** Merged, clipped UTC intervals. The caller bounds them by the immutable
 * revision's lifetime. Existing maintenanceUntil remains a suppress window. */
export function intervals(definition, from, to) {
  if (to <= from) return [];
  const values = (definition.maintenanceWindows ?? []).flatMap(window => maintenanceOccurrences(window,from,to))
    .filter(window => window.startsAt !== null).map(window => ({startsAt:Math.max(from,window.startsAt),endsAt:Math.min(to,window.endsAt)}));
  if (definition.maintenanceUntil > from) values.push({startsAt:from,endsAt:Math.min(to,definition.maintenanceUntil)});
  return mergeIntervals(values);
}

export function previewRange(window) {
  return window.weekly ? {from:Math.max(0,Date.parse(`${window.weekly.fromDate}T00:00:00Z`)-DAY_MS),to:Date.parse(`${window.weekly.untilDate}T00:00:00Z`)+3*DAY_MS}
    : {from:window.startsAt,to:window.endsAt};
}
