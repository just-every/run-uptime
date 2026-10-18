import type {D1Database,D1TargetAdapter} from '../../base/modules/import-kit/src/d1/types.ts'
import {lastScheduledStart,type Bindings} from '../control.server.ts'
import {revisionWrites,retirementWrites} from './targets/native-writes.ts'
import {assignmentGuard,assignmentPolicy} from './targets/policy.ts'
import {markerTable,markerPredicate,nativePredicate,publishedPredicate,readSnapshot,sameTarget,sql,target,together,type Snapshot} from './targets/snapshots.ts'

/** Request-local adapter. Tombstones retain native monitors after undo and make
 * reusing their IDs an explicit refusal, never a hidden overwrite. */
export function businessTargets(env:Bindings,ownerId:string):D1TargetAdapter{
 const snapshots=new Map<string,Snapshot>()
 let runners:Awaited<ReturnType<typeof assignmentPolicy>>|undefined
 const supported=(kind:string)=>{if(kind!=='monitor')throw Error('BUSINESS_IMPORT_TARGET_KIND')}
 const remember=async(database:D1Database,id:string)=>{
  const [snapshot,currentRunners]=await Promise.all([readSnapshot(database,id),runners?Promise.resolve(runners):assignmentPolicy(database)])
  runners=currentRunners
  if(snapshot.native&&!snapshot.marker?.retired)snapshot.started=await lastScheduledStart(env,id)
  snapshots.set(id,snapshot);return snapshot
 }
 const need=(id:string)=>{const snapshot=snapshots.get(id);if(!snapshot)throw Error('BUSINESS_IMPORT_NATIVE_READ_REQUIRED');return snapshot}
 const adapter:D1TargetAdapter={
  async read(database,destination,kind,id){supported(kind);return target(await remember(database,id),destination)},
  matches(row,destination,kind,id){
   supported(kind)
   if(row&&(row.destination!==destination||row.targetKind!==kind||row.targetId!==id||row.attachment))return sql('0')
   const snapshot=snapshots.get(id)
   if(row){
    // Before-images guard the complete raw native row, including values which
    // ordinary scheduling changes without a definition revision.
    if(snapshot&&sameTarget(target(snapshot,destination),row))return together(nativePredicate(snapshot.native,id),markerPredicate(snapshot.marker,id))
    return publishedPredicate(row)
   }
   if(snapshot?.native){
    // A retired binding is an absent import target, not an absent native row.
    // On undo this is also the exact intended post-state of retirementWrites.
    if(!snapshot.marker)return sql('0')
    return together(nativePredicate(snapshot.native,id),markerPredicate({...snapshot.marker,retired:1},id))
   }
   return together(nativePredicate(null,id),markerPredicate(null,id))
  },
  write(row){
   supported(row.targetKind)
   if(row.attachment)throw Error('BUSINESS_IMPORT_ATTACHMENTS_UNSUPPORTED')
   if(!runners)throw Error('BUSINESS_IMPORT_NATIVE_READ_REQUIRED')
   const policy=assignmentGuard(env,row.value,runners)
   return [{sql:`SELECT CASE WHEN (${policy.sql}) THEN 1 ELSE json('BUSINESS_IMPORT_RUNNER_CHANGED') END`,params:policy.params},...revisionWrites(row,need(row.targetId),ownerId)]
  },
  remove(_destination,kind,id){supported(kind);return retirementWrites(id,need(id),ownerId)},
  // One read for the whole imported set, however many monitors it holds. Each row's
  // exact native and marker state guards it, as read() does, so a monitor the owner
  // edited since its import is listed as edited rather than failing the guard. A
  // write still needs read() first: only read() fetches the last scheduled start.
  async list(database,destination){
   const {results}=await database.prepare(`SELECT b.monitor_id,b.kit_revision,b.native_revision,b.retired,m.id,m.revision,m.definition,m.next_due,m.state
    FROM ${markerTable} b LEFT JOIN monitors m ON m.id=b.monitor_id WHERE b.retired=0 ORDER BY b.monitor_id`).all<any>()
   return results.map(row=>{
    const marker={monitor_id:row.monitor_id,kit_revision:row.kit_revision,native_revision:row.native_revision,retired:row.retired}
    const native=row.id===null?null:{id:row.id,revision:row.revision,definition:row.definition,next_due:row.next_due,state:row.state}
    const snapshot:Snapshot={native,marker},listed=target(snapshot,destination)
    if(!listed)throw Error('BUSINESS_IMPORT_NATIVE_MONITOR_MISSING')
    if(!snapshots.has(row.monitor_id))snapshots.set(row.monitor_id,snapshot)
    return listed
   })
  },
  matchesCount(count){return sql(`(SELECT COUNT(*) FROM ${markerTable} WHERE retired=0)=?`,count)},
  // A preserving undo observes each imported monitor as read() does, fenced by the same exact native and marker guard.
  // The kit reverses a monitor still as its import left it and keeps (and reports) one edited or enabled since.
  async preparePreservedUndo(database,destination,effects){
   const observations=[],guards=[]
   for(const effect of effects){
    const {targetKind:kind,targetId:id}=effect.expected,current=await adapter.read(database,destination,kind,id)??null
    observations.push({effectId:effect.provenance.id,current,entity:{table:'monitors',recordId:id}})
    guards.push(adapter.matches(current,destination,kind,id))
   }
   return {observations,dependencies:[],guards:guards.length?guards:[sql(`(SELECT COUNT(*) FROM ${markerTable})>=0`)]}
  },
 }
 return adapter
}
