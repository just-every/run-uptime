import type {ClassAndFacts} from '../base/modules/agent-door/index.ts'

// Omission follows the native enabled-by-default rule. Only an explicitly
// paused ordinary public HTTP definition avoids starting checks; descriptive
// text grants no waiver. Other creation families retain their existing floor
// until their credential, TLS, route and lifecycle effects are qualified.
export function monitorCreateEffects(next:any):ClassAndFacts[]{
 const risks:ClassAndFacts[]=[]
 const ordinaryPaused=next.enabled===false&&next.type==='http'&&next.network==='public'&&next.privateGrantRef===undefined&&next.request?.credentialRef===undefined&&next.tlsTrust===undefined&&next.slow===undefined
 if(!ordinaryPaused)risks.push({class:'live',facts:{measure:1,service:next.service??'monitoring'}})
 if(next.type!=='heartbeat'&&next.enabled!==false)risks.push({class:'external',facts:{measure:1,counterparty:'public'}})
 if((next.network&&next.network!=='public')||next.privateGrantRef!==undefined||next.request?.credentialRef!==undefined||JSON.stringify(next.tlsTrust)!==undefined)risks.push({class:'security',facts:{measure:1,setting:'monitor-request-authority'}})
 return risks.length?risks:[{class:'standard',facts:{measure:1}}]
}
