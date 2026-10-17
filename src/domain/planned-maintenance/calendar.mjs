import {DAY_MS} from './schema.mjs';

const formatters = new Map();
const resolvedTimes = new Map();
function wallParts(at, timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    if (formatters.size >= 64) formatters.clear();
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(at);
  return ['year','month','day','hour','minute','second'].map(type => Number(parts.find(part => part.type === type)?.value));
}
// Try both offsets on either side of a transition, then round-trip each
// candidate. A gap has none; a repeated wall time chooses its first instant.
function localInstants(date, localTime, timeZone) {
  const key = `${timeZone}:${date}:${localTime}`;
  if (resolvedTimes.has(key)) return resolvedTimes.get(key);
  const desired = Date.parse(`${date}T${localTime}:00Z`), offsets = new Set();
  for (let hour = -36; hour <= 36; hour += 12) {
    const anchor = desired + hour * 3600000, [y,m,d,h,min,s] = wallParts(anchor, timeZone);
    offsets.add(Date.UTC(y,m-1,d,h,min,s) - anchor);
  }
  const candidates = [...offsets].map(offset => desired-offset).filter(at => {
    const [y,m,d,h,min] = wallParts(at, timeZone);
    return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}` === `${date}T${localTime}`;
  }).sort((a,b) => a-b);
  if (resolvedTimes.size >= 1024) resolvedTimes.clear();
  resolvedTimes.set(key,candidates);
  return candidates;
}
/** Preview includes skipped gap dates and both instants of a repeat. Duration
 * is elapsed minutes, so a window can end at a different local clock hour. */
export function maintenanceOccurrences(window, from, to) {
  if (!window.weekly) return window.endsAt > from && window.startsAt < to
    ? [{windowId:window.id,mode:window.mode,timeZone:window.timeZone,status:'scheduled',startsAt:window.startsAt,endsAt:window.endsAt}] : [];
  const rule = window.weekly, occurrences = [];
  const first = Math.max(Date.parse(`${rule.fromDate}T00:00:00Z`), Math.floor((from-rule.durationMinutes*60000)/DAY_MS)*DAY_MS-2*DAY_MS);
  const last = Math.min(Date.parse(`${rule.untilDate}T00:00:00Z`), Math.floor(to/DAY_MS)*DAY_MS+2*DAY_MS);
  for (let day = first; day <= last; day += DAY_MS) {
    if (!rule.weekdays.includes(new Date(day).getUTCDay())) continue;
    const localDate = new Date(day).toISOString().slice(0,10), candidates = localInstants(localDate,rule.localTime,window.timeZone);
    const common = {windowId:window.id,mode:window.mode,timeZone:window.timeZone,localDate,localTime:rule.localTime,durationMinutes:rule.durationMinutes};
    if (!candidates.length) {
      // A gap has no UTC instant: its local calendar day determines whether
      // it belongs in this preview, with a day of offset margin either side.
      if (day+DAY_MS > from-DAY_MS && day < to+DAY_MS) occurrences.push({...common,status:'skipped-gap',startsAt:null,endsAt:null});
    } else {
      const startsAt = candidates[0], endsAt = startsAt+rule.durationMinutes*60000;
      if (endsAt > from && startsAt < to) occurrences.push({...common,status:candidates.length>1?'first-repeat':'scheduled',startsAt,endsAt,...(candidates.length>1?{repeatedStartsAt:candidates[1]}:{})});
    }
  }
  return occurrences;
}

export function mergeIntervals(values) {
  const merged = [];
  for (const value of values.filter(value => value.endsAt > value.startsAt).sort((a,b) => a.startsAt-b.startsAt || a.endsAt-b.endsAt)) {
    const last = merged.at(-1);
    if (last && value.startsAt <= last.endsAt) last.endsAt = Math.max(last.endsAt,value.endsAt);
    else merged.push({startsAt:value.startsAt,endsAt:value.endsAt});
  }
  return merged;
}
