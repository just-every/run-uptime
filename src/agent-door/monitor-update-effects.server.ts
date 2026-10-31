import type {ClassAndFacts} from '../base/modules/agent-door/index.ts'

// The saved native revision, rather than descriptive text in the request,
// determines whether an ordinary edit changes a running service.
export function monitorUpdateEffects(before:any,change:Record<string,unknown>):ClassAndFacts[]{
 const next={...before,...change},risks:ClassAndFacts[]=[]
 if(before.enabled!==false||next.enabled!==false)risks.push({class:'live',facts:{measure:1,service:next.service??'monitoring'}})
 if(next.type!=='heartbeat'&&next.enabled!==false&&(next.url!==before.url||JSON.stringify(next.probes)!==JSON.stringify(before.probes)||next.intervalMs!==before.intervalMs))risks.push({class:'external',facts:{measure:1,counterparty:'public'}})
 if((next.network&&next.network!=='public'&&next.network!==before.network)||next.privateGrantRef!==before.privateGrantRef||next.request?.credentialRef!==before.request?.credentialRef||JSON.stringify(next.tlsTrust)!==JSON.stringify(before.tlsTrust))risks.push({class:'security',facts:{measure:1,setting:'monitor-request-authority'}})
 return risks.length?risks:[{class:'standard',facts:{measure:1}}]
}
