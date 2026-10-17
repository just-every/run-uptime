export const DAY_MS = 86400000;
export const DST_POLICY = 'skip-gap-first-repeat';
const MAX_AT = 253402300799999;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed, label) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw Error(`Invalid ${label} fields`);
}
function text(value, limit, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) throw Error(`Invalid maintenance ${label}`);
  return value.trim();
}
export function timestamp(value, label = 'timestamp') {
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) throw Error(`Maintenance ${label} requires an ISO time with UTC offset or epoch milliseconds`);
    const offset = match[5] === 'Z' ? 0 : (Number(match[5].slice(1, 3)) * 60 + Number(match[5].slice(4))) * (match[5][0] === '-' ? -1 : 1);
    if (match[5] !== 'Z' && (Number(match[5].slice(1, 3)) > 23 || Number(match[5].slice(4)) > 59)) throw Error(`Invalid maintenance ${label} offset`);
    const at = Date.parse(value), local = new Date(at + offset * 60000);
    const expected = `${match[1]}T${match[2]}:${match[3] ?? '00'}.${(match[4] ?? '').padEnd(3, '0')}Z`;
    if (!Number.isFinite(at) || local.toISOString() !== expected) throw Error(`Invalid maintenance ${label}`);
    value = at;
  }
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_AT) throw Error(`Invalid maintenance ${label}`);
  return value;
}
export function calendarDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error(`Invalid maintenance ${label}`);
  const at = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(at) || at < 0 || new Date(at).toISOString().slice(0, 10) !== value) throw Error(`Invalid maintenance ${label}`);
  return at;
}
function timeZone(value) {
  if (typeof value !== 'string' || value.length > 80 || !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/.test(value)) throw Error('Maintenance timeZone must be an IANA time zone, such as America/Chicago');
  try { return new Intl.DateTimeFormat('en-US', {timeZone:value}).resolvedOptions().timeZone; }
  catch { throw Error('Maintenance timeZone must be an IANA time zone, such as America/Chicago'); }
}
export function validateMaintenanceWindows(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw Error('A monitor supports at most 10 maintenance windows');
  const ids = new Set();
  return value.map(input => {
    keys(input, ['id','name','timeZone','mode','startsAt','endsAt','weekly','dstPolicy'], 'maintenance window');
    if (typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(input.id) || ids.has(input.id)) throw Error('Maintenance window IDs must be unique (letters, numbers, underscore or hyphen; 80 characters max)');
    ids.add(input.id);
    if (!['suppress','pause'].includes(input.mode)) throw Error('Maintenance mode must be suppress (notifications) or pause (execution and notifications)');
    const window = {id:input.id, name:text(input.name, 100, 'name'), timeZone:timeZone(input.timeZone), mode:input.mode};
    if (input.weekly !== undefined) {
      if (input.startsAt !== undefined || input.endsAt !== undefined) throw Error('Choose one-time or weekly maintenance');
      if (input.dstPolicy !== undefined && input.dstPolicy !== DST_POLICY) throw Error(`Maintenance dstPolicy must be ${DST_POLICY}`);
      keys(input.weekly, ['weekdays','localTime','durationMinutes','fromDate','untilDate'], 'weekly maintenance');
      const {weekdays,localTime,durationMinutes,fromDate,untilDate} = input.weekly;
      if (!Array.isArray(weekdays) || !weekdays.length || weekdays.length > 7 || new Set(weekdays).size !== weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw Error('Maintenance weekdays must be unique numbers from Sunday 0 to Saturday 6');
      if (typeof localTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw Error('Maintenance localTime must be HH:mm');
      if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) throw Error('Weekly maintenance duration must be 1 to 1440 elapsed minutes');
      const first = calendarDate(fromDate, 'fromDate'), last = calendarDate(untilDate, 'untilDate');
      if (last < first || last - first >= 366 * DAY_MS) throw Error('Weekly maintenance needs an inclusive date range of at most 366 days');
      return {...window, weekly:{weekdays:[...weekdays].sort((a,b) => a-b),localTime,durationMinutes,fromDate,untilDate},dstPolicy:DST_POLICY};
    }
    if (input.dstPolicy !== undefined) throw Error('dstPolicy applies to weekly maintenance');
    const startsAt = timestamp(input.startsAt, 'startsAt'), endsAt = timestamp(input.endsAt, 'endsAt');
    if (endsAt <= startsAt || endsAt - startsAt > 366 * DAY_MS) throw Error('One-time maintenance must end after it starts and last at most 366 days');
    return {...window,startsAt,endsAt};
  });
}
