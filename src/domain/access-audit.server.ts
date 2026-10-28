// Authority receipts describe committed product changes, not read-only previews,
// authentication counters, upload custody or repair work preceding validation.
const primary:Record<string,readonly string[]>={
 check_write:['monitors','revisions'],maintenance_write:['monitors','revisions'],
 route_write:['alert_routes'],respond:['slots','slow_acknowledgements','outbox','incident_comments','incident_comment_history','incident_work','incident_timeline','incident_mentions'],
 secret_write:['notification_destinations','runners','heartbeat_authority','effect_grants','failure_evidence_grants','failure_snapshot_settings','failure_snapshots','notification_preferences'],
 import:['monitors','revisions','uptime_business_import_targets','source_history_rows','source_history_batches','source_history_cutovers'],
 receive:['alert_recipient_consents'],
 members:['alert_teams','alert_team_members','oa_operators','oa_tokens','oa_sessions','uptime_member_roles','uptime_member_scopes'],
}
export function auditsMutation(action:string,statements:({sql:string;write:boolean}|undefined)[],additional:boolean){
 if(additional)return true
 return statements.some(statement=>{
  if(!statement)return action==='members'
  if(!statement.write)return false
  const changed=[...statement.sql.matchAll(/\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+["`]?([a-z_][a-z_0-9]*)/gi)].map(match=>match[1].toLowerCase())
  return changed.some(table=>primary[action]?primary[action].includes(table):!['oa_limits','uptime_audit','notification_credentials'].includes(table)&&!table.startsWith('ik_')&&!table.startsWith('rer_'))
 })
}
