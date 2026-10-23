export const mentionColumns=['id','comment_id','incident_id','monitor_id','comment_version','recipient_id','created_at','submitted_at','finished_at','outcome']
export const mentionOutcomes=['pending','submitting','accepted','development','rejected','rate_limited','uncertain','cancelled','unavailable','imported-inactive']
export function validateMentionArchive(t:Record<string,any[]>){
 const seen=new Set<string>(),clock=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0
 for(const row of t.incident_mentions){
  const comment=t.incident_comments.find(c=>c.id===row.comment_id),key=`${row.comment_id}:${row.comment_version}:${row.recipient_id}`
  if(typeof row.id!=='string'||!row.id||row.id.length>512||!comment||comment.deleted_at!==null||comment.incident_id!==row.incident_id||comment.monitor_id!==row.monitor_id||!Number.isSafeInteger(row.comment_version)||row.comment_version<1||row.comment_version>comment.version||typeof row.recipient_id!=='string'||!row.recipient_id||row.recipient_id.length>512||seen.has(key)||!clock(row.created_at)||![row.submitted_at,row.finished_at].every(v=>v===null||clock(v))||!mentionOutcomes.includes(row.outcome))throw Error('Invalid incident mention archive')
  if(['pending','submitting'].includes(row.outcome)&&row.finished_at!==null||row.outcome==='pending'&&row.submitted_at!==null||['accepted','development','rejected','rate_limited'].includes(row.outcome)&&row.submitted_at===null)throw Error('Invalid incident mention lifecycle')
  seen.add(key)
 }
}
export function restoreMentions(t:Record<string,any[]>,now:number){
 for(const row of t.incident_mentions)if(['pending','submitting'].includes(row.outcome)){row.outcome=row.submitted_at===null?'imported-inactive':'uncertain';row.finished_at=now}
}
