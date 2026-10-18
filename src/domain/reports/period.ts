const DAY_MS = 86400000
const periods = { '24h': DAY_MS, '7d': 7 * DAY_MS, '30d': 30 * DAY_MS, '90d': 90 * DAY_MS }
const calendarPeriods = ['mtd', 'qtd', 'ytd', 'last-month'] as const
type NamedPeriod = keyof typeof periods | typeof calendarPeriods[number]
const isCalendarPeriod = (value: string) => calendarPeriods.some(period => period === value)

export class ReportInputError extends Error {
  status = 400
  code: string
  constructor(message: string, code = 'invalid_report') {
    super(message)
    this.name = 'ReportInputError'
    this.code = code
  }
}

export type ReportPeriod = {
  period: NamedPeriod | 'custom'
  from: number
  to: number
  timeZone: string
  slaTargetPercent: number | null
}

function zone(value: string): string {
  if (/^[+-]/.test(value)) throw new ReportInputError('timeZone must be an IANA time zone, such as America/Chicago')
  try { return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone }
  catch { throw new ReportInputError('timeZone must be an IANA time zone, such as America/Chicago') }
}

function clock(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000
}

function wallParts(at: number, timeZone: string): number[] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)
  return ['year', 'month', 'day', 'hour', 'minute', 'second'].map(type => Number(parts.find(part => part.type === type)?.value))
}

// Local wall times are interpreted in the requested zone. DST gaps and repeats
// require an explicit offset rather than silently choosing another instant.
function instant(value: string, timeZone: string, field: string): number {
  if (/^\d+$/.test(value)) {
    const at = Number(value)
    if (clock(at)) return at
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value)
  if (!match) throw new ReportInputError(`${field} must be an ISO date/time or epoch milliseconds`)
  const parts = match.slice(1, 7).map(part => Number(part ?? 0))
  const ms = Number((match[7] ?? '').padEnd(3, '0'))
  const wall = new Date(0)
  wall.setUTCFullYear(parts[0], parts[1] - 1, parts[2])
  wall.setUTCHours(parts[3], parts[4], parts[5], ms)
  const desired = wall.getTime()
  if ([wall.getUTCFullYear(), wall.getUTCMonth() + 1, wall.getUTCDate(), wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds()]
    .some((part, index) => part !== parts[index])) throw new ReportInputError(`${field} is not a valid calendar date/time`)
  if (match[8]) {
    const offset = match[8] === 'Z' ? 0 : (Number(match[8].slice(1, 3)) * 60 + Number(match[8].slice(4))) * (match[8][0] === '-' ? -1 : 1)
    if (match[8] !== 'Z' && (Number(match[8].slice(1, 3)) > 23 || Number(match[8].slice(4)) > 59))
      throw new ReportInputError(`${field} has an invalid UTC offset`)
    const at = desired - offset * 60000
    if (clock(at)) return at
  } else {
    const candidates = new Set<number>()
    for (let hour = -36; hour <= 36; hour += 6) {
      const anchor = Math.floor((desired + hour * 3600000) / 1000) * 1000
      const local = wallParts(anchor, timeZone)
      const localDate = new Date(0)
      localDate.setUTCFullYear(local[0], local[1] - 1, local[2])
      localDate.setUTCHours(local[3], local[4], local[5], 0)
      const at = desired - (localDate.getTime() - anchor)
      if (clock(at) && wallParts(at, timeZone).every((part, index) => part === parts[index])) candidates.add(at)
    }
    if (candidates.size === 1) return [...candidates][0]
    throw new ReportInputError(`${field} is ${candidates.size ? 'ambiguous' : 'nonexistent'} in ${timeZone}; use an explicit UTC offset`)
  }
  throw new ReportInputError(`${field} is outside the supported timestamp range`)
}

function calendarStart(year: number, month: number, timeZone: string): number {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, 1)
  const target = year * 10000 + month * 100 + 1
  const formatter = new Intl.DateTimeFormat('en-US', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'})
  const localDate = (at: number) => {
    const parts = formatter.formatToParts(at)
    return Number(parts.find(part => part.type === 'year')!.value) * 10000
      + Number(parts.find(part => part.type === 'month')!.value) * 100
      + Number(parts.find(part => part.type === 'day')!.value)
  }
  // First instant of the local calendar date. This also covers zones whose
  // midnight is repeated or skipped: use the earliest instant in that date.
  let low = date.getTime() - 2 * DAY_MS, high = date.getTime() + 2 * DAY_MS
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (localDate(middle) < target) low = middle
    else high = middle
  }
  return high
}

function namedRange(period: NamedPeriod, timeZone: string, now: number): {from: number; to: number} {
  if (Object.hasOwn(periods, period)) return {from: now - periods[period as keyof typeof periods], to: now}
  const [year, month] = wallParts(now, timeZone)
  const monthStart = (year: number, month: number) => calendarStart(year, month, timeZone)
  if (period === 'last-month') return {from: monthStart(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1), to: monthStart(year, month)}
  return {from: monthStart(year, period === 'ytd' ? 1 : period === 'qtd' ? Math.floor((month - 1) / 3) * 3 + 1 : month), to: now}
}

export function reportPeriod(params: URLSearchParams, now = Date.now()): ReportPeriod {
  if (!clock(now)) throw new ReportInputError('Report clock must be a nonnegative timestamp')
  for (const key of ['period', 'from', 'to', 'timeZone', 'zone', 'sla', 'slaTarget']) {
    if (params.getAll(key).length > 1) throw new ReportInputError(`Specify ${key} only once`)
  }
  if (params.has('zone') && params.has('timeZone')) throw new ReportInputError('Specify timeZone only once')
  if (params.has('sla') && params.has('slaTarget')) throw new ReportInputError('Specify sla only once')
  const timeZone = zone(params.get('timeZone') ?? params.get('zone') ?? 'America/Chicago')
  const period = params.get('period') ?? (params.has('from') || params.has('to') ? 'custom' : '24h')
  if (period !== 'custom' && !Object.hasOwn(periods, period) && !isCalendarPeriod(period)) throw new ReportInputError('period must be 24h, 7d, 30d, 90d, mtd, qtd, ytd, last-month or custom')
  let from: number, to: number
  if (period === 'custom') {
    if (!params.get('from') || !params.get('to')) throw new ReportInputError('Custom periods require from and to')
    from = instant(params.get('from')!, timeZone, 'from')
    to = instant(params.get('to')!, timeZone, 'to')
  } else {
    if (params.has('from') || params.has('to')) throw new ReportInputError('Use period=custom with from and to')
    ;({from, to} = namedRange(period as NamedPeriod, timeZone, now))
  }
  if (!clock(from) || !clock(to) || from >= to || to > now)
    throw new ReportInputError('Report range must satisfy 0 <= from < to <= now')
  const target = params.get('sla') ?? params.get('slaTarget')
  const slaTargetPercent = target === null ? null : Number(target)
  if (target !== null && (!target.trim() || !Number.isFinite(slaTargetPercent) || slaTargetPercent! <= 0 || slaTargetPercent! > 100))
    throw new ReportInputError('sla must be a percentage greater than 0 and at most 100')
  return { period: period as ReportPeriod['period'], from, to, timeZone, slaTargetPercent }
}

export function normalizePeriod(value: URLSearchParams | ReportPeriod, now: number): ReportPeriod {
  if (value instanceof URLSearchParams) return reportPeriod(value, now)
  const normalized = reportPeriod(new URLSearchParams({
    period: 'custom', from: String(value.from), to: String(value.to), timeZone: value.timeZone,
    ...(value.slaTargetPercent === null ? {} : { sla: String(value.slaTargetPercent) }),
  }), now)
  if (value.period !== 'custom') {
    if (!Object.hasOwn(periods, value.period) && !isCalendarPeriod(value.period)) throw new ReportInputError('Named report period does not match its range')
    // A named to-date report may be reused later, retaining its original clock.
    // Last month's complete range instead depends on the current local month.
    const expected = namedRange(value.period, normalized.timeZone, value.period === 'last-month' ? now : value.to)
    if (value.from !== expected.from || value.to !== expected.to) throw new ReportInputError('Named report period does not match its range')
  }
  return { ...normalized, period: value.period }
}
