// Five numeric cron fields. Local gaps are skipped; a repeated wall minute
// belongs only to its first UTC instant. No compiled state is serialized.
const MINUTE = 60000;
const compiled = new Map();
const formatters = new Map();
const dayOffsets = new Map();

function boundedCache(cache, key, value, limit) {
  if (cache.size >= limit) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

function field(source, minimum, maximum, label, sunday = false) {
  const values = new Set();
  const normalized = [];
  for (const item of source.split(',')) {
    const match = /^(\*|\d{1,2}(?:-\d{1,2})?)(?:\/(\d{1,2}))?$/.exec(item);
    if (!match) throw Error(`Invalid heartbeat cron ${label}`);
    const step = match[2] === undefined ? 1 : Number(match[2]);
    if (step < 1 || step > maximum - minimum + 1) throw Error(`Invalid heartbeat cron ${label} step`);
    const wildcard = match[1] === '*';
    const range = wildcard ? [minimum, maximum] : match[1].split('-').map(Number);
    const start = range[0];
    const end = range[1] ?? (match[2] === undefined ? start : maximum);
    if (start < minimum || start > maximum || end < start || end > maximum) throw Error(`Invalid heartbeat cron ${label} range`);
    for (let value = start; value <= end; value += step) values.add(sunday && value === 7 ? 0 : value);
    normalized.push((wildcard ? '*' : range.join('-')) + (match[2] === undefined ? '' : `/${step}`));
  }
  // Vixie cron treats a field beginning with '*' (including */n) as a
  // wildcard for the DOM/DOW rule. Two restricted day fields are ORed.
  return {values: [...values].sort((a, b) => a - b), wildcard: source.startsWith('*'), source: normalized.join(',')};
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function compile(settings) {
  if (!settings || typeof settings.cron !== 'string' || settings.cron.length > 256 || typeof settings.timeZone !== 'string' || settings.timeZone.length > 100) throw Error('Invalid heartbeat cron configuration');
  const source = settings.cron.trim().split(/\s+/);
  if (source.length !== 5) throw Error('Heartbeat cron requires five numeric fields');
  const cacheKey = `${source.join(' ')}|${settings.timeZone}`;
  if (compiled.has(cacheKey)) return compiled.get(cacheKey);
  // Intl also accepts fixed numeric offsets in some runtimes; require a named
  // IANA zone instead. Aliases are normalized by the runtime's IANA database.
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(settings.timeZone)) throw Error('Invalid heartbeat IANA time zone');
  let timeZone;
  try { timeZone = new Intl.DateTimeFormat('en-US', {timeZone: settings.timeZone}).resolvedOptions().timeZone; }
  catch { throw Error('Invalid heartbeat IANA time zone'); }
  const [minute, hour, day, month, weekday] = source.map((value, index) => field(value, [0, 0, 1, 1, 0][index], [59, 23, 31, 12, 7][index], ['minute', 'hour', 'day of month', 'month', 'day of week'][index], index === 4));
  // A restricted weekday makes an OR rule possible even when the DOM is
  // impossible (e.g. February 31 OR Monday). Otherwise a leap year contains
  // every possible month/day pair, and each weekday occurs in a 400y cycle.
  if ((day.wildcard || weekday.wildcard) && !month.values.some(m => day.values.some(d => d <= daysInMonth(2000, m)))) throw Error('Heartbeat cron has no possible calendar date');
  return boundedCache(compiled, cacheKey, {cron: [minute, hour, day, month, weekday].map(f => f.source).join(' '), timeZone, minute, hour, day, month, weekday}, 128);
}

export function validateHeartbeatCron(settings) {
  const {cron, timeZone} = compile(settings);
  return {cron, timeZone};
}

function wallParts(at, timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) formatter = boundedCache(formatters, timeZone, new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}), 64);
  const parts = formatter.formatToParts(at);
  return ['year', 'month', 'day', 'hour', 'minute', 'second'].map(type => Number(parts.find(part => part.type === type).value));
}

function offsetsForDate(date, timeZone) {
  const key = `${timeZone}:${date}`;
  if (dayOffsets.has(key)) return dayOffsets.get(key);
  const offsets = new Set();
  // Probe either side of date-line and DST transitions, then round-trip the
  // candidate below. This is the same offset-discovery pattern as maintenance.
  for (let hour = -36; hour <= 36; hour += 12) {
    const anchor = date + hour * 3600000;
    const [y, m, d, h, min, second] = wallParts(anchor, timeZone);
    offsets.add(Date.UTC(y, m - 1, d, h, min, second) - anchor);
  }
  return boundedCache(dayOffsets, key, [...offsets].sort((a, b) => b - a), 256);
}

function firstWallInstant(date, hour, minute, timeZone, offsets) {
  const desired = date + hour * 3600000 + minute * MINUTE;
  for (const offset of offsets) {
    const candidate = desired - offset;
    const [y, m, d, h, min, second] = wallParts(candidate, timeZone);
    if (Date.UTC(y, m - 1, d, h, min, second) === desired) return candidate;
  }
  return null; // A nonexistent local minute is never shifted to a later time.
}

function matchesDay(rule, year, month, day) {
  const dom = rule.day.values.includes(day);
  const dow = rule.weekday.values.includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
  return rule.day.wildcard || rule.weekday.wildcard ? dom && dow : dom || dow;
}

function occurrence(settings, boundary, direction) {
  if (!Number.isSafeInteger(boundary) || Math.abs(boundary) > 253402214400000) throw Error('Invalid heartbeat occurrence time');
  const rule = compile(settings);
  const [startYear, startMonth, startDay] = wallParts(boundary, rule.timeZone);
  const ordered = values => direction > 0 ? values : [...values].reverse();
  const hours = ordered(rule.hour.values), minutes = ordered(rule.minute.values);
  // Gregorian weekday/date patterns repeat in 400 years. Search matching
  // calendar days, not every elapsed minute, so leap-day jobs remain cheap.
  for (let delta = 0; delta <= 400; delta++) {
    const year = startYear + direction * delta;
    if (year < 100 || year > 9999) break;
    for (const month of ordered(rule.month.values)) {
      if (delta === 0 && direction * (month - startMonth) < 0) continue;
      const count = daysInMonth(year, month);
      for (let day = direction > 0 ? 1 : count; day >= 1 && day <= count; day += direction) {
        if (delta === 0 && month === startMonth && direction * (day - startDay) < 0) continue;
        if (!matchesDay(rule, year, month, day)) continue;
        const date = Date.UTC(year, month - 1, day), offsets = offsetsForDate(date, rule.timeZone);
        for (const hour of hours) for (const minute of minutes) {
          const desired = date + hour * 3600000 + minute * MINUTE;
          // Skip wall minutes whose every possible offset is on the wrong
          // side of the boundary, without any Intl calls. In a repeated hour
          // both offsets remain eligible for the first-instant round trip.
          if (direction > 0 && desired - offsets.at(-1) <= boundary) continue;
          if (direction < 0 && desired - offsets[0] >= boundary) continue;
          const at = firstWallInstant(date, hour, minute, rule.timeZone, offsets);
          if (at !== null && direction * (at - boundary) > 0) return at;
        }
      }
    }
  }
  throw Error('Heartbeat cron has no occurrence within the supported 400-year calendar horizon');
}

/** UTC milliseconds strictly after `after`; skipped gaps and first repeats. */
export function nextHeartbeatOccurrence(settings, after) { return occurrence(settings, after, 1); }

/** UTC milliseconds strictly before `before`; useful for schedule previews. */
export function previousHeartbeatOccurrence(settings, before) { return occurrence(settings, before, -1); }
