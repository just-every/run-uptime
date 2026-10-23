/** Aliases are module-owned SQL, never request input. Consent binds a credential
 * version and the live Base / product assignment, so rotation and role changes
 * require an explicit new consent rather than resurrecting an old one. */
export function liveRecipientSql(consent='rc',monitor='m'){
 return `${consent}.enabled=1 AND EXISTS(SELECT 1 FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id
 WHERE o.id=${consent}.operator_id AND o.status='active' AND o.version=${consent}.base_version AND r.base_version=o.version AND r.base_role=o.role AND r.revision=${consent}.role_revision
 AND r.role IN('owner','admin','editor','responder','read-only') AND o.role=CASE WHEN r.role IN('owner','admin') THEN r.role ELSE 'member' END
 AND NOT EXISTS(SELECT 1 FROM uptime_member_scopes p WHERE p.operator_id=o.id GROUP BY p.kind HAVING MAX(CASE WHEN (p.kind='service' AND p.value=json_extract(${monitor}.definition,'$.service')) OR (p.kind='team' AND p.value=json_extract(${monitor}.definition,'$.group')) THEN 1 ELSE 0 END)=0))`
}
export function selectedTeamRecipientSql(teams:string,destination='d',monitor='m'){
 return `EXISTS(SELECT 1 FROM alert_recipient_consents rc JOIN alert_team_members tm ON tm.operator_id=rc.operator_id JOIN alert_teams team ON team.id=tm.team_id
 WHERE rc.destination_id=${destination}.id AND rc.credential_id=${destination}.credential_id AND team.enabled=1 AND team.id IN(SELECT value FROM json_each(${teams})) AND ${liveRecipientSql('rc',monitor)})`
}
/** Original incident recipient binding also gates its reminders and recovery.
 * It does not reselect from a changed route or send to replacement team members. */
export function teamDeliveryReady(job='j'){
 return `NOT EXISTS(SELECT 1 FROM alert_team_deliveries b JOIN notification_jobs original ON original.id=b.trigger_job_id
 WHERE original.destination_id=${job}.destination_id AND original.credential_id=${job}.credential_id AND json_extract(original.event,'$.monitorId')=json_extract(${job}.event,'$.monitorId') AND json_extract(original.event,'$.incidentKey')=json_extract(${job}.event,'$.incidentKey')
 AND NOT EXISTS(SELECT 1 FROM alert_recipient_consents rc JOIN notification_destinations d ON d.id=rc.destination_id JOIN monitors m ON m.id=json_extract(${job}.event,'$.monitorId')
 WHERE rc.operator_id=b.operator_id AND d.id=${job}.destination_id AND d.credential_id=${job}.credential_id AND rc.credential_id=d.credential_id AND d.enabled=1 AND d.deleted_at IS NULL AND ${liveRecipientSql()}
 AND EXISTS(SELECT 1 FROM alert_team_members tm JOIN alert_teams team ON team.id=tm.team_id WHERE tm.operator_id=rc.operator_id AND team.enabled=1 AND team.id IN(SELECT value FROM json_each(b.team_ids)))))`
}
