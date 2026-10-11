import type {Bindings} from './control.server.ts'
export const legacyWarning='This monitor uses its historical failure quorum. Add a second independent network or an external canary and save its settings to enable independent failure agreement.';
/** Counts only: owner mail must never include private monitor or target data. */
export async function legacyMonitoringWarning(env:Bindings):Promise<string>{
 const row=await env.DB.prepare("SELECT COUNT(*) count FROM monitors WHERE json_extract(definition,'$.enabled')=1 AND json_type(definition,'$.assignments') IS NULL").first<{count:number}>();
 return row?.count?`${row.count} enabled monitor${row.count===1?' uses':'s use'} the historical failure quorum. Add a second independent network or an external canary and save the settings to enable independent failure agreement.`:''
}
