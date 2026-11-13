import {escape,humaneDuration} from './console-format.js';

// All heartbeat summaries describe the saved schedule, never the unused period
// retained on a cron definition. The server owns calendar and DST evaluation.
export function heartbeatRules(h={}){
 return [{key:'deadline',label:h.cron?'Success deadline':'Success period + grace',value:h.cron?`Next scheduled time (${h.cron}, ${h.timeZone}) plus ${humaneDuration(h.graceMs??0)} grace`:humaneDuration((h.maxAgeMs??0)+(h.graceMs??0))},
  {key:'run',label:'Maximum run duration',value:h.maxRunDurationMs?humaneDuration(h.maxRunDurationMs):'No limit set'}];
}
export const heartbeatRuleDetails=h=>heartbeatRules(h).map(({label,value})=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('');
