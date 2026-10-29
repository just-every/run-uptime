// Healthy evidence is read from the same immutable scheduled slot as a retained
// failure. Late peer completions can therefore be compared without rewriting
// the incident's original confirmation event or changing monitoring policy.
export async function withDiagnosticPeers(env:{DB:D1Database},items:any[]){
 const slots=[...new Set(items.filter(row=>row.snapshot?.diagnostics).map(row=>row.slot_id))];
 if(!slots.length)return items;
 const rows=await env.DB.prepare(`SELECT o.id,o.slot_id,o.probe,o.evidence FROM observations o
 JOIN json_each(?) s ON s.value=o.slot_id WHERE json_extract(o.evidence,'$.outcome')='pass'
 AND NOT EXISTS(SELECT 1 FROM observations n WHERE n.slot_id=o.slot_id AND n.probe=o.probe AND n.attempt>o.attempt)
 ORDER BY o.slot_id,o.probe LIMIT 30001`).bind(JSON.stringify(slots)).all<any>();
 if(rows.results.length>30000)throw Error('Diagnostic comparison exceeds its bounded selection');
 const peers=new Map<string,any[]>();
 for(const row of rows.results){const o=JSON.parse(row.evidence),list=peers.get(row.slot_id)??[];
  list.push({observationId:row.id,probe:row.probe,outcome:o.outcome,durationMs:o.durationMs,checks:o.checks,...(o.protocol?{protocol:o.protocol}:{})});peers.set(row.slot_id,list)}
 return items.map(row=>row.snapshot?.diagnostics?{...row,healthyPeers:peers.get(row.slot_id)??[]}:row);
}
