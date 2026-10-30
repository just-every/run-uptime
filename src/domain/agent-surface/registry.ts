// Contract declarations for discovery only. Business calls stay unavailable until
// their native adapters and company-policy enforcement are implemented together.
export const protocolVersion='2025-06-18'
export const invocation=Object.freeze({available:false,reason:'Native adapters and company-policy enforcement are not implemented.'})
type Declaration=readonly [name:string,description:string,coreClauses:readonly string[],classes:string]
const declarations:readonly Declaration[]=[
 ["uptime.monitors.read", "Read monitors, current state, slots, evidence and history", ["HTTP-001", "EVIDENCE-001", "STATE-001", "PRESENCE-001", "PROBE-001", "AGENT-002"], "standard"],
 ["uptime.monitors.save", "Create or edit a monitor revision of any kind, with its schedule, locations, assertions and alert policy", ["HTTP-001", "API-001", "SLOW-001", "API-003", "TCP-001", "PING-001", "DNS-001", "TLS-001", "DOMAIN-001", "UDP-001", "MAIL-001", "NETWORK-002", "SCHEDULE-001", "SCHEDULE-002", "PERF-001", "FLOW-001", "FLOW-002", "FLOW-004", "MANAGE-001", "AGENT-001", "AGENT-003"], "standard or live (+ security) (+ external)"],
 ["uptime.monitors.pause", "Pause or resume monitors", ["MONITOR-001"], "live"],
 ["uptime.monitors.bulk", "Preview, apply and undo a URL or CSV batch, and clone, tag, search and filter monitors", ["MONITOR-001"], "standard or live (+ external) (+ security)"],
 ["uptime.monitors.check", "Run a manual check now", ["STATE-001", "SCHEDULE-001", "AGENT-002", "AGENT-005"], "standard (+ money) (+ destructive) (+ live)"],
 ["uptime.definitions.apply", "Preview, apply, export and undo definition files and code bundles, and destroy code-managed resources", ["IMPORT-001", "CODE-001", "CODE-002"], "standard or live (+ external) (+ security) (+ destructive)"],
 ["uptime.credentials.update", "Bind, rotate or revoke a monitor's request credential reference", ["API-002"], "security (+ live)"],
 ["uptime.grants.update", "Grant or revoke a live-effect, synthetic or private-network grant", ["API-004", "FLOW-001", "PRIVATE-001"], "security (+ money) (+ destructive) (+ live)"],
 ["uptime.cleanup.resolve", "Irreversibly close a cleanup debt with a note", ["API-004"], "destructive (+ live)"],
 ["uptime.heartbeats.issue", "Issue or rotate a heartbeat token or URL and generate scheduler snippets", ["HEARTBEAT-001", "HEARTBEAT-002", "HEARTBEAT-003"], "security (+ live)"],
 ["uptime.runners.update", "Enroll, label, upgrade or revoke a private runner", ["PRIVATE-001", "PROBE-001"], "access (+ security) (+ live)"],
 ["uptime.maintenance.update", "Schedule, preview, apply or cancel a maintenance window", ["MAINT-001"], "live"],
 ["uptime.routes.update", "Routes, teams, contacts, delays, repeats, quiet hours and fallback chains", ["ROUTING-001", "ROUTING-002", "DELIVERY-002", "AGENT-004"], "live (+ external)"],
 ["uptime.destinations.update", "Create, rotate, disable or remove a notification destination, including webhook templates and chat, phone and push destinations", ["NOTIFY-001", "WEBHOOK-001", "CHAT-001", "PHONE-001", "PHONE-002", "MANAGE-001"], "standard (+ security) (+ destructive) (+ external) (+ gated) (+ live)"],
 ["uptime.destinations.test", "Send a test or run an alert drill on one destination", ["NOTIFY-001", "DELIVERY-001", "DRILL-001", "AGENT-004"], "external (+ money)"],
 ["uptime.phones.verify", "Send a one-time verification code to a recipient's phone number", ["PHONE-002"], "external · money (+ gated)"],
 ["uptime.incidents.read", "Read incidents, timelines, next-due follow-up, snapshots, artifacts and diagnostics", ["FOLLOWUP-001", "EVIDENCE-002", "DIAG-001", "FLOW-003", "READAPI-003", "AGENT-002"], "standard"],
 ["uptime.incidents.work", "Take or reassign ownership, acknowledge, stop reminders or resolve an incident", ["FOLLOWUP-001"], "standard or destructive (+ live)"],
 ["uptime.incidents.comment", "Add, edit or delete a comment, mention a member or set a root cause", ["INCIDENT-001", "INCIDENT-002", "INCIDENT-003", "INCIDENT-005"], "standard (+ destructive)"],
 ["uptime.incidents.publish", "Publish a comment or correction to the mapped Lamp or Statuspage incident", ["INCIDENT-004", "LAMP-001", "AGENT-005"], "external"],
 ["uptime.handoffs.update", "Map Lamp or Statuspage components and Oncall, PagerDuty or Splunk On-Call services", ["LAMP-001", "ONCALL-001", "BOUNDARY-001", "AGENT-005"], "live (+ security) (+ external)"],
 ["uptime.reports.read", "Read and export uptime, SLA, response-time and slow-time figures and reports", ["REPORT-001", "READAPI-002", "METRICS-001"], "standard"],
 ["uptime.reports.schedule", "Schedule a recurring report to recipients", ["REPORT-001"], "standard (+ external)"],
 ["uptime.dependencies.follow", "Follow or unfollow a catalog provider or component and link it to monitors", ["DEPENDENCY-002"], "standard (+ live) (+ external)"],
 ["uptime.discovery.run", "Authorize a discovery source, run discovery and adopt or reject its proposals", ["DISCOVERY-001", "DEPENDENCY-001", "AGENT-001"], "standard (+ live) (+ security)"],
 ["uptime.archive.export", "Export the installation, a time range or a subset of monitors", ["ARCHIVE-001", "ARCHIVE-002", "OPS-001"], "standard"],
 ["uptime.archive.restore", "Restore an archive into empty product data", ["ARCHIVE-001", "ARCHIVE-002", "OPS-001"], "security"],
 ["uptime.erasure.run", "Erase a monitor, destination, import batch or operator", ["ERASURE-001"], "destructive (+ access) (+ live)"],
 ["uptime.audit.read", "Search and export the audit", ["AUDIT-001"], "standard"],
 ["uptime.members.update", "Invite, change the role of, reset the factors of or remove a member", ["ACCESS-001", "ACCESS-003"], "access (+ security) (+ live)"],
 ["uptime.keys.update", "Create, limit or revoke read API, metrics and CI keys", ["READAPI-001", "METRICS-001", "CODE-001"], "access · security"],
 ["uptime.security.update", "Change the MFA policy", ["ACCESS-003"], "security"],
 ["uptime.settings.update", "Notice time zone and preferences, snapshot retention and redaction settings, the external check URL, the phone budget and the plan", ["NOTICE-001", "COST-001", "RETENTION-001", "EVIDENCE-002"], "standard or live (+ money) (+ destructive) (+ security)"],
 ["uptime.automations.update", "Connect, test, pause or revoke a Zapier, Make or webhook automation", ["AUTOMATION-001"], "security (+ external) (+ gated) (+ live) (+ access)"],
]
export const tools=declarations.map(([name,description,coreClauses,classDeclaration])=>({
 name,description:description+'. Discovery only; invocation is unavailable.',
 inputSchema:{type:'object',properties:{},additionalProperties:false},
 _meta:{classes:[...new Set(classDeclaration.match(/standard|external|money|access|security|destructive|live|gated/g))],classDeclaration,coreClauses,invocation},
}))

export const notTools=[
 {"coreClauses": ["INTERFACE-001"], "reason": "The owner console and its accessibility are a person's screen"},
 {"coreClauses": ["MOBILE-001"], "reason": "native iOS and Android clients and their push permission run on a device"},
 {"coreClauses": ["HEARTBEAT-004", "MIGRATE-001", "MIGRATE-002", "MIGRATE-003", "MIGRATE-004", "MIGRATE-005", "HISTORY-001"], "reason": "migration from an incumbent and its sourced history go through the import door"},
 {"coreClauses": ["AUTHORITY-001", "NETWORK-001", "RETENTION-001", "BOUNDARY-001", "PUBLIC-001", "PUBLIC-002", "STARTUP-001", "PROBE-002"], "reason": "Scoped door authority, pinned transport, storage custody, send semantics and honest delivery claims, the app origin and its docs, declared public paths, configuration diagnostics and published probe addresses are installation facts"},
]
