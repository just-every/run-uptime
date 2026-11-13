import type {Bindings} from '../domain/control.server.ts'
// @ts-ignore Native debt policy is shared JavaScript, unchanged by the agent door.
import {CLEANUP_DEBT_LIMIT} from '../domain/cleanup-debt.mjs'

/** Saved API cleanup steps can each leave one debt at every selected probe. */
export async function manualCheckEffects(env:Bindings,monitor:{id:string;definition:any}){
 const definition=monitor.definition,steps=definition.api?.steps??[],possible=steps.filter((step:any)=>step.phase==='cleanup').length*definition.probes.length
 if(definition.type!=='api'||definition.retries!==0||
  !steps.some((step:any)=>step.phase==='setup')||possible===0)return null
 const debts=(await env.DB.prepare("SELECT id FROM cleanup_debt WHERE monitor_id=? AND state='open' ORDER BY id").bind(monitor.id).all<{id:string}>()).results
 const open=debts.length
 return {open,possible,limit:CLEANUP_DEBT_LIMIT,evidence:debts.map(debt=>debt.id),
  live:definition.enabled&&open<CLEANUP_DEBT_LIMIT&&open+possible>=CLEANUP_DEBT_LIMIT}
}

export function manualDebtSummary(effects:NonNullable<Awaited<ReturnType<typeof manualCheckEffects>>>){
 return [`Cleanup debt: ${effects.open} open + ${effects.possible} possible = ${effects.open+effects.possible}; setup refusal limit: ${effects.limit}.`,
  `Open cleanup debt evidence: ${effects.evidence.join(', ')||'none'}.`,
  effects.live?'This check can make the next scheduled run refuse setup.':'This check cannot newly reach the setup refusal limit.']
}
