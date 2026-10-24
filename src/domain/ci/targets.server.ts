import type {Bindings} from '../control.server.ts'
import type {CredentialAuthority} from '../credentials/model.server.ts'
import {CredentialError} from '../credentials/model.server.ts'
import {businessTargets} from '../business-import/targets.server.ts'
import {ciDefinition,ciMonitorPredicate} from './scope.server.ts'
export function ciTargets(env:Bindings,a:CredentialAuthority){
 const native=businessTargets(env,a.issuerId),scope=ciMonitorPredicate(a)
 return {...native,
  async read(database:any,destination:string,kind:string,id:string){const row=await native.read(database,destination,kind,id);if(row&&!ciDefinition(a,row.value))throw new CredentialError(403,'Existing monitor is outside the credential selection');return row},
  write(row:any){if(!ciDefinition(a,row.value))throw new CredentialError(403,'Destination definition is outside the credential selection');return [{sql:`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM monitors m WHERE m.id=? AND NOT (${scope.sql})) THEN 1 ELSE json('CI_SCOPE_CHANGED') END`,params:[row.targetId,...scope.params]},...native.write(row)]},
  remove(){throw new CredentialError(403,'CI credentials cannot undo applied changes')},
  async list(database:any,destination:string){return (await native.list(database,destination)).filter(row=>ciDefinition(a,row.value))},
  matchesCount(count:number){return {sql:`(SELECT COUNT(*) FROM uptime_business_import_targets b JOIN monitors m ON m.id=b.monitor_id WHERE b.retired=0 AND ${scope.sql})=?`,params:[...scope.params,count]}},
 }
}
