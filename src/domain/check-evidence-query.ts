// Anchor both storage formats to the caller's slot before joining. SQLite
// can otherwise materialize the union view before applying a correlated key.
export function observationsAt(slotId:string,observationId?:string){
 const nativeId=observationId?`AND native.id=${observationId}`:'';
 const packedId=observationId?`AND json_extract(attempt.value,'$.id')=${observationId}`:'';
 return `SELECT native.id,native.slot_id,native.probe,native.attempt,native.evidence
  FROM observations native WHERE native.slot_id=${slotId} ${nativeId}
  UNION ALL
  SELECT json_extract(attempt.value,'$.id'),packed.id,json_extract(attempt.value,'$.probe'),
   json_extract(attempt.value,'$.attempt'),attempt.value
  FROM slots packed CROSS JOIN json_each(packed.hosted,'$.attempts') attempt
  WHERE packed.id=${slotId} ${packedId}`;
}
export function assignmentsAt(slotId:string){
 return `SELECT native.probe,native.delivered_at,native.external_check_url
  FROM runner_assignments native WHERE native.slot_id=${slotId}
  UNION ALL
  SELECT assignment.key,json_extract(packed.hosted,'$.deliveredAt'),json_extract(assignment.value,'$.canaryUrl')
  FROM slots packed CROSS JOIN json_each(packed.hosted,'$.assignments') assignment WHERE packed.id=${slotId}`;
}
