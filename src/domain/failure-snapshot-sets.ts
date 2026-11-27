// A stored failure snapshot row holds one attempt's snapshot, or a set: the snapshots of
// every attempt of one check, under the first attempt's identity. Every reader sees one
// snapshot for each attempt, with that attempt's own identity and capture time. Nothing
// writes a set yet: a version that reads only single rows must never meet one, so the
// reader ships a release ahead of the writer.
export type SnapshotRow={observation_id:string;monitor_id:string;captured_at:number;expires_at:number;snapshot:string;[column:string]:any}
type Member={observationId:string;probe:string;attempt:number;capturedAt:number;snapshot:unknown}
const isSet=(snapshot:string)=>snapshot.startsWith('{"set":[')
/** SQL for how many snapshots the stored row `alias` holds. */
export const snapshotCount=(alias:string)=>`CASE WHEN json_type(${alias}.snapshot,'$.set')='array' THEN json_array_length(${alias}.snapshot,'$.set') ELSE 1 END`

/** The snapshots a stored row holds, in attempt order. Retention counts from each attempt's own capture. */
export function snapshotMembers<T extends SnapshotRow>(row:T):T[]{
 if(!isSet(row.snapshot))return [row];
 const retention=row.expires_at-row.captured_at;
 return (JSON.parse(row.snapshot).set as Member[]).map(member=>({...row,observation_id:member.observationId,probe:member.probe,attempt:member.attempt,
  captured_at:member.capturedAt,expires_at:member.capturedAt+retention,snapshot:JSON.stringify(member.snapshot)}));
}

/** Rewrites each snapshot a stored row holds and returns the row's new stored text. */
export async function rewriteSnapshots<T extends SnapshotRow>(row:T,rewrite:(member:T)=>Promise<string>){
 if(!isSet(row.snapshot))return rewrite(row);
 const set=JSON.parse(row.snapshot).set as Member[],members=snapshotMembers(row);
 return JSON.stringify({set:await Promise.all(members.map(async(member,index)=>({...set[index],snapshot:JSON.parse(await rewrite(member))})))});
}
