// A stored failure snapshot row holds one attempt's snapshot, or a set: the snapshots of
// several attempts of one check, under the first attempt's identity. Every reader sees one
// snapshot for each attempt, with that attempt's own identity and capture time. Uptime 0.5.37
// was the first version to read sets; it is the oldest version this writer may roll back to.
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

// D1 refuses a row over 2,000,000 bytes. A set stays at half that, counted in UTF-8 bytes.
const setBytes=1_000_000
const bytes=(text:string)=>new TextEncoder().encode(text).length
export type StoredSnapshot={observationId:string;probe:string;attempt:number;capturedAt:number;flow:boolean;stored:string}
/** Packs one check's stored snapshots, earliest capture first, into as few rows as fit. A row
 * of one snapshot is stored as that snapshot. A flow attempt keeps its own row: readers take a
 * row's flow evidence from its first attempt. */
export function packSnapshots(snapshots:StoredSnapshot[]){
 const rows:StoredSnapshot[][]=[];let open:StoredSnapshot[]=[],size=0
 for(const snapshot of [...snapshots].sort((a,b)=>a.capturedAt-b.capturedAt||(a.probe<b.probe?-1:a.probe>b.probe?1:a.attempt-b.attempt))){
  const member=bytes(memberText(snapshot))+1
  if(snapshot.flow){rows.push([snapshot]);continue}
  if(open.length&&size+member>setBytes){rows.push(open);open=[];size=0}
  open.push(snapshot);size+=member
 }
 if(open.length)rows.push(open)
 return rows.map(members=>({first:members[0],snapshot:members.length===1?members[0].stored:`{"set":[${members.map(memberText).join(',')}]}`}))
}
const memberText=({observationId,probe,attempt,capturedAt,stored}:StoredSnapshot)=>
 `{"observationId":${JSON.stringify(observationId)},"probe":${JSON.stringify(probe)},"attempt":${attempt},"capturedAt":${capturedAt},"snapshot":${stored}}`
