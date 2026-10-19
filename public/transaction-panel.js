import {escape} from './console-format.js';
export function transactionSummary(definition){
 return `<ol class="attempt-checks">${definition.api.steps.map(step=>`<li><strong>${escape(step.name)}</strong> · ${escape(step.phase)} · ${escape(step.method)}</li>`).join('')}</ol><p>Extracted values stay on the runner. Cleanup results never replace an earlier failed requirement.</p>`;
}
export function transactionTrace(observation){
 const facts=observation.apiTransaction;if(!facts)return '';
 return `<section aria-label="API transaction steps"><ol class="attempt-checks">${facts.steps.map(step=>`<li><strong>${escape(step.name)}</strong> · ${escape(step.phase)} · ${escape(step.outcome)} · ${escape(step.durationMs)} ms${step.status?` · HTTP ${escape(step.status)}`:''}<ul>${step.checks.map(check=>`<li>${check.pass?'PASS':'FAIL'}: ${escape(check.reason)}</li>`).join('')}</ul></li>`).join('')}</ol><p>Cleanup: ${facts.cleanup.passed} passed; ${facts.cleanup.failed} failed; ${facts.cleanup.skipped} skipped.</p></section>`;
}
