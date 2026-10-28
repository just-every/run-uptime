import type {ReportPeriod} from '../reports/period.ts'
/** Read only; these samples are never candidates for native latency or health. */
export async function sourceResponseTimes(db:D1Database,id:string,period:ReportPeriod){
 const rows=(await db.prepare("SELECT source,source_row_id,batch_id,started_at,response_ms FROM source_history_rows WHERE monitor_id=? AND kind='response' AND started_at>=? AND started_at<? ORDER BY started_at,source_row_id LIMIT 10001").bind(id,period.from,period.to).all<{source:string;source_row_id:string;batch_id:string;started_at:number;response_ms:number}>()).results
 if(rows.length>10000)throw Object.assign(Error('Source response times exceed 10,000 samples; choose a shorter period'),{status:400})
 return rows.map(row=>({source:row.source,label:`source: ${row.source}`,sourceRowId:row.source_row_id,batchId:row.batch_id,at:row.started_at,responseMs:row.response_ms}))
}
