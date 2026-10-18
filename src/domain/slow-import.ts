// Saved Site24x7 threshold profile responses, API version 2.1:
// https://www.site24x7.com/help/api/#retrieve-threshold-profile
// Website response_time_threshold values are milliseconds; timeout/read_time_out are separate.
// https://www.site24x7.com/help/admin/configuration-profiles/threshold-and-availability/website.html
// @ts-ignore Shared pure policy validation.
import {normalizeSlow} from './slow-policy.mjs'

type Definition={type:string;probes:string[];timeoutMs?:number}
const object=(value:unknown):value is Record<string,any>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)

/** Convert one explicitly chosen source severity and location scope. This performs no writes. */
export function importSlowPolicy(input:unknown,definition:Definition){
 if(!object(input))throw Error('Choose a saved slow-response policy and its source')
 if(input.source==='betterstack')throw Error('Better Stack request_timeout is a transport failure timeout, not a separate slow-response threshold. Its documented Uptime API exposes no saved slow-policy field to import; configure a local slow policy explicitly.')
 if(input.source!=='site24x7')throw Error('Choose a Site24x7 saved Website threshold profile; Pingdom slow thresholds are imported with saved check details')
 if(Object.keys(input).some(key=>!['source','document','scope','locations','severity'].includes(key)))throw Error('Choose one primary or secondary scope, explicit local locations, and one Site24x7 severity')
 if(input.scope!=='primary'&&input.scope!=='secondary')throw Error('Choose Site24x7 primary or secondary scope; differing scope thresholds cannot be combined')
 if(input.severity!==2&&input.severity!==3)throw Error('Choose Site24x7 severity 2 (Trouble) or 3 (Critical) explicitly')
 if(!Array.isArray(input.locations)||!input.locations.length)throw Error('Map the selected Site24x7 scope to explicit configured local locations; external geography is not guessed')
 let document=input.document
 if(typeof document==='string'){
  try{document=JSON.parse(document)}catch{throw Error('Use a valid saved Site24x7 threshold profile JSON response')}
 }
 if(!object(document)||document.code!==0||!object(document.data)||document.data.type!=='URL')throw Error('Use a successful saved Site24x7 Website (URL) threshold profile response, not a monitor summary or request timeout')
 const profile=document.data
 if(profile.profile_type!==1)throw Error('Only an explicitly static Site24x7 threshold profile (profile_type 1) can be mapped; AI thresholds have no fixed millisecond equivalent')
 const rules=profile.response_time_threshold?.[input.scope]
 if(!Array.isArray(rules))throw Error('The saved profile needs response_time_threshold rules for the selected primary or secondary scope')
 const chosen=rules.filter(rule=>object(rule)&&rule.severity===input.severity)
 if(chosen.length!==1)throw Error('Select a scope with exactly one rule for the chosen severity; missing or multiple rules cannot be reduced to one slow policy')
 const rule=chosen[0]
 if(rule.comparison_operator!==1)throw Error('Only Site24x7 greater-than response-time rules (comparison_operator 1) match the local slow policy')
 if(rule.strategy!==1)throw Error('Only Site24x7 consecutive poll-count rules (strategy 1) can be imported; averages, time windows and percentile rules require an explicit local policy')
 if(!Number.isInteger(rule.polls_check)||rule.polls_check<1||rule.polls_check>100)throw Error('Site24x7 polls_check must be a whole number from 1 to 100 consecutive polls')
 if(!Number.isInteger(rule.value)||rule.value<1||rule.value>600000)throw Error('Site24x7 response-time value must be a whole number from 1 to 600000 milliseconds')
 const timeoutMs=definition.timeoutMs??10000
 if(rule.value>=timeoutMs)throw Error('The imported slow threshold must be below the monitor request timeout; review both values before saving')
 return normalizeSlow({thresholdMs:rule.value,mode:'consecutive',slots:rule.polls_check,percentile:95,locations:input.locations,destinationIds:null,contactSettings:{}},definition.probes,definition.type)
}
