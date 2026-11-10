// The audit actor of work an agent does for a person is the agent, never the person's name.
// Base labels an agent's work "<agent> for <person>"; that label names the sponsor, so it is kept only in the saved
// principal and the incident timeline (both redacted when the person is erased), not as a native actor reference.
export const agentActorRef=(agentId:string)=>`agent:${agentId}`
// Agent identifiers are the agent's own opaque id: printable, no whitespace, bounded.
export const agentRefPattern=/^agent:[^\s\u0000-\u001f\u007f]{1,512}$/u
// Rows written before the reference was non-personal carry the label; they are rewritten to this stand-in.
export const LEGACY_AGENT_REF='agent:legacy'
// The label shape "<agent> for <person>"; the fixed feature names never contain " for ".
export const legacyLabelShape=(ref:string)=>ref.includes(' for ')&&!agentRefPattern.test(ref)
