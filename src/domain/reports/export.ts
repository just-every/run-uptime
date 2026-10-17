import type { MonitorReport } from './index.server.ts'

function cell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  // A saved monitor name or check identifier must not become a spreadsheet formula.
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function reportJson(report: MonitorReport): string { return `${JSON.stringify(report, null, 2)}\n` }

/** Every value comes from the same report object returned by the read API. */
export function reportCsv(report: MonitorReport): string {
  const headers = ['section', 'monitor_id', 'monitor_name', 'from', 'to', 'time_zone', 'metric', 'value', 'unit',
    'location', 'at', 'ended_at', 'incident_key']
  const rows: unknown[][] = [headers]
  const add = (section: string, metric: string, value: unknown, unit = '', location = '', at: unknown = '', end: unknown = '', key: unknown = '') =>
    rows.push([section, report.monitor.id, report.monitor.name, report.period.from, report.period.to, report.period.timeZone,
      metric, value, unit, location, at, end, key])
  add('policy','rootCauseFilter',report.rootCauseFilter)
  for(const group of report.rootCauseGroups){add('root_cause',group.categoryLabel+' incident count',group.count);add('root_cause',group.categoryLabel+' downtime',group.durationInPeriodMs,'ms')}
  add('policy', 'denominator', report.denominatorPolicy)
  add('policy', 'percentileMethod', report.latency.percentileMethod)
  add('policy', 'samplePolicy', report.latency.samplePolicy)
  add('policy', 'bucket', report.latency.bucket)
  add('policy', 'bucketAlignment', report.latency.bucketAlignment)
  for (const [metric, value] of Object.entries(report.availability)) add('availability', metric, value, metric.endsWith('Ms') ? 'ms' : 'percent')
  if (report.sla) for (const [metric, value] of Object.entries(report.sla)) add('sla', metric, value, metric.endsWith('Ms') ? 'ms' : metric.endsWith('Percent') ? 'percent' : '')
  for (const [metric, value] of Object.entries(report.latency.statistics)) add('latency', metric, value, metric === 'count' ? 'samples' : 'ms', report.latency.location)
  for (const point of report.latency.series) for (const [metric, value] of Object.entries(point)) {
    if (metric !== 'at' && metric !== 'to' && metric !== 'location') add('latency_series', metric, value, metric === 'count' ? 'samples' : 'ms', point.location, point.at, point.to)
  }
  for (const incident of report.incidents) {
    add('incident','rootCauseCategory',incident.rootCause.categoryLabel,'','',incident.startedAt,incident.endedAt,incident.key)
    add('incident','rootCauseAccount',incident.rootCause.text,'','',incident.startedAt,incident.endedAt,incident.key)
    for (const metric of ['durationMs', 'durationInPeriodMs', 'ongoingAtEnd', 'imported'] as const)
      add('incident', metric, incident[metric], metric.endsWith('Ms') ? 'ms' : '', '', incident.startedAt, incident.endedAt, incident.key)
  }
  return `${rows.map(row => row.map(cell).join(',')).join('\r\n')}\r\n`
}
