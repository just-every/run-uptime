import type {Bindings} from '../domain/control.server.ts'
// @ts-ignore Native debt policy is shared JavaScript, unchanged by the agent door.
import {CLEANUP_DEBT_LIMIT} from '../domain/cleanup-debt.mjs'

/** Qualified native boundary: one API fixture sequence, one probe, no retry. */
export async function manualCheckEffects(env:Bindings,monitor:{id:string;definition:any}){
 const definition=monitor.definition,steps=definition.api?.steps??[]
 if(definition.type!=='api'||definition.probes.length!==1||definition.retries!==0||
  !steps.some((step:any)=>step.phase==='setup')||steps.filter((step:any)=>step.phase==='cleanup').length!==1)return null
 const debts=(await env.DB.prepare("SELECT id FROM cleanup_debt WHERE monitor_id=? AND state='open' ORDER BY id").bind(monitor.id).all<{id:string}>()).results
 const open=debts.length,possible=1
 return {open,possible,limit:CLEANUP_DEBT_LIMIT,evidence:debts.map(debt=>debt.id),
  live:definition.enabled&&open<CLEANUP_DEBT_LIMIT&&open+possible>=CLEANUP_DEBT_LIMIT}
}

export function manualDebtSummary(effects:NonNullable<Awaited<ReturnType<typeof manualCheckEffects>>>){
 return [`Cleanup debt: ${effects.open} open + ${effects.possible} possible = ${effects.open+effects.possible}; setup refusal limit: ${effects.limit}.`,
  `Open cleanup debt evidence: ${effects.evidence.join(', ')||'none'}.`,
  effects.live?'This check can make the next scheduled run refuse setup.':'This check cannot newly reach the setup refusal limit.']
}
