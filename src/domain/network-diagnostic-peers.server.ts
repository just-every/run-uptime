import {observationsAt} from './check-evidence-query.ts'
// Healthy evidence is read from the same immutable scheduled slot as a retained
// failure. Late peer completions can therefore be compared without rewriting
// the incident's original confirmation event or changing monitoring policy.
export async function withDiagnosticPeers(env:{DB:D1Database},items:any[]){
 const slots=[...new Set(items.filter(row=>row.snapshot?.diagnostics).map(row=>row.slot_id))];
 if(!slots.length)return items;
 const rows=await env.DB.prepare(`WITH ranked AS (
  SELECT selected.value AS slot_id, o.value AS evidence, json_extract(o.value,'$.id') AS id,
    json_extract(o.value,'$.probe') AS probe,
    ROW_NUMBER() OVER (PARTITION BY selected.value,json_extract(o.value,'$.probe') ORDER BY json_extract(o.value,'$.attempt') DESC) AS rank
  FROM json_each(?) selected CROSS JOIN json_each((
   SELECT json_group_array(json(evidence)) FROM (${observationsAt('selected.value')})
  )) o
 )
 SELECT id,slot_id,probe,evidence FROM ranked WHERE rank=1 AND json_extract(evidence,'$.outcome')='pass'
 ORDER BY slot_id,probe LIMIT 30001`).bind(JSON.stringify(slots)).all<any>();
 if(rows.results.length>30000)throw Error('Diagnostic comparison exceeds its bounded selection');
 const peers=new Map<string,any[]>();
 for(const row of rows.results){const o=JSON.parse(row.evidence),list=peers.get(row.slot_id)??[];
  list.push({observationId:row.id,probe:row.probe,outcome:o.outcome,durationMs:o.durationMs,checks:o.checks,...(o.protocol?{protocol:o.protocol}:{})});peers.set(row.slot_id,list)}
 return items.map(row=>row.snapshot?.diagnostics?{...row,healthyPeers:peers.get(row.slot_id)??[]}:row);
}
