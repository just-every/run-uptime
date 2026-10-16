// Shared by the Node runner's pinned transport and the Worker's report transport, so discovery reads either one's failures.
// JSON and text first, then anything: servers that negotiate on Accept (406 to a narrow list) still answer a probe as they answer a browser.
export const PROBE_ACCEPT='application/json,text/plain,*/*;q=0.1';
export class ProbeError extends Error {constructor(category,reason){super(category);this.category=category;this.reason=reason}}
