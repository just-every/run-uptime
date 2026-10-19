import type {Bindings} from './control.server.ts'
import {readContact} from './runner-contact.server.ts'
import {rerSignedRead,signedReadAnswer} from './rer-signed-read.server.ts'

// The console's contact states, as RER reads them: a contact time that cannot be verified reads stale, never fresh.
const state=(label:string)=>label==='Fresh contact'?'fresh':label==='Never seen'?'never':'stale'

/**
 * POST /api/rer/runner-status: Run Edit Run's signed read of this installation's private runner. It answers
 * `{state, lastContactAt}` from runner_contact, which only an authenticated private runner's request writes (hosted
 * Worker checks never do). `fresh` is the console's own runner-contact window (CONTACT_FRESHNESS_MS, 2 minutes). The
 * grant is an RER-signed `runner-status` grant for this installation under its owner-claim key ring; a key the owner
 * revoked in Business imports is refused. Nothing else is read or returned: never the runner key or runner ids.
 */
export function rerRunnerStatus(env:Bindings,request:Request){
 return rerSignedRead(env,request,'runner-status',async()=>{
  const contact=await readContact(env.DB)
  return signedReadAnswer({state:state(contact.state),lastContactAt:contact.lastContactAt===null?null:new Date(contact.lastContactAt).toISOString()})
 })
}
