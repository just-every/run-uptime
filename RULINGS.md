# Uptime rulings

Each ruling below shaped a clause of CONTRACT.md. The clause states the outcome; the ruling states why. RL-1 to RL-12 were moved word for word out of the contract text in the 28 October 2026 contract cleanup; ct's own ruling pass numbers its entries from RL-101, and those are copied verbatim from ct's ruling file. An id is never reused.

### RL-1 — Archive installation-authority and endpoint-credential policy

*Date:* 13 October 2026 · *Ruled by:* owner · *Governs:* ARCHIVE-001

The owner accepted this installation-authority and endpoint-credential archive policy on 2026-10-13; it is an intentional replacement, not BASE-DATA-001 equivalence.

The BASE-DATA-001 installation-authority and endpoint-credential exclusion is the owner-accepted policy dated 2026-10-13; available email addresses remain portable destination definitions. This is the recorded replacement for this edition, not full BASE-DATA-001 equivalence.

ARCHIVE-001 records this as a supersession of `BASE-DATA-001` for installation authority and endpoint credentials only.

### RL-2 — Three-second readiness response budget

*Date:* 16 October 2026 · *Ruled by:* owner · *Governs:* STARTUP-001

One owner-authorized 3 s global response deadline (BASE-OPS-001 replacement, 2026-10-16) bounds configuration, public admission and those checks and returns 503 on unavailable dependencies.

STARTUP-001 records this as a supersession of `BASE-OPS-001`'s one-second health budget.

### RL-3 — DELIVERY-002 completion and its inherited channels

*Date:* 20 October 2026 · *Ruled by:* ct · *Governs:* DELIVERY-002, PHONE-001, PHONE-002, ONCALL-001

Completion is judged on email and signed-webhook escalation chains; the SMS fallback is inherited by PHONE-001 and PHONE-002, and the PagerDuty destination kind by ONCALL-001 (ct ruling, 20 October 2026).

### RL-4 — Default delivery escalation

*Date:* 25 October 2026 · *Ruled by:* ct · *Governs:* DELIVERY-002, FOLLOWUP-001, ONCALL-001

**ct scope ruling, 25 October 2026:** Default Uptime delivery escalation is the configured DELIVERY-002 fallback contact chain. It does not assign incident ownership or establish human receipt, acknowledgment or response. FOLLOWUP-001 retains acceptance for the incident’s next-due kind/time and timeline; ONCALL-001 retains native connector and responder-policy behavior.

### RL-5 — Follow-up scheduling sources

*Date:* 25 October 2026 · *Ruled by:* ct · *Governs:* FOLLOWUP-001

**ct scope ruling, 25 October 2026:** ROUTING-002 supplies current contact notification and reminder scheduling, DELIVERY-002 supplies current fallback escalation scheduling, and ONCALL-001 will supply native handoff-check and responder-policy scheduling. FOLLOWUP-001 retains named ownership, next-due kind/time and every attempt/outcome in the incident timeline through the existing console, API/CLI and READAPI-001 doors, including restart and inactive archive behavior.

### RL-6 — Responder handoff scheduling

*Date:* 25 October 2026 · *Ruled by:* ct · *Governs:* ONCALL-001

**ct scope ruling, 25 October 2026:** ONCALL-001 receives connector-native handoff-check and configured responder-escalation policy, including handoff attempts/outcomes and the existing PagerDuty destination-kind inheritance. Its scheduling and outcomes must feed FOLLOWUP-001’s incident timeline and next-due projection and READAPI-001’s incident reads. Handoff acknowledgment remains separate from responder status, and recovery resolves the same remote incident.

### RL-7 — Incident reads keep the follow-up timeline

*Date:* 25 October 2026 · *Ruled by:* ct · *Governs:* READAPI-003 (from READAPI-001)

**ct scope ruling, 25 October 2026:** Incident reads retain FOLLOWUP-001’s authoritative next-due kind/time and timeline. Current DELIVERY-002 fallback escalation and ROUTING-002 notification/reminder behavior remain acceptance obligations; ONCALL-001 handoff scheduling remains an open dependency, not an exemption.

### RL-8 — Page speed stays partial

*Date:* 26 October 2026 · *Ruled by:* ct · *Governs:* PERF-001

26 October 2026 ct ruling: PERF-001 stays partial. The four assertion gaps of the 23 October downgrade (CLS budget, independently delayed connect and first-byte timings, a second country with separate denominators, an actual failed-load beacon visit) now have loaded assertions in `tests/pagespeed-support.mjs` and `tests/pagespeed-timing-support.mjs`, but the 22 October riders named in its Gap remain incomplete. Accepted clause totals remain 88 total; 45 done, 32 partial, 11 missing.

### RL-9 — ROUTING-001 UI configuration: reject with alternative

*Date:* 26 October 2026 · *Ruled by:* ct · *Governs:* ROUTING-001

26 October 2026 ct ROUTING-001 rulings (UI configuration: reject with alternative; scope: approve with riders; deployment: approve with riders; DST proof: gap retained). Status remains partial, the original clause and acceptance sentences are unchanged and none of these rulings accepts completion.

API and CLI configuration is an interim implementation of this clause. It does not discharge the original UI configuration acceptance. The console must preserve saved team selection, filters, route quiet hours and business-hour policy when editing other fields. Configuration and inspection controls for these fields remain required in the uip-gated UI round, with the two-team production and staging journey proven at 1440 and 390.

### RL-10 — ROUTING-001 scope: approve with riders

*Date:* 26 October 2026 · *Ruled by:* ct · *Governs:* ROUTING-001

Richer forensic provenance, a richer geographic hierarchy, portable detailed route history and configurable severity are separate work candidates rather than additional acceptance points for this clause. This does not remove its existing duties to select by truthful geographic region and incident origin, retain auditable route changes and apply the saved severity selection. Exact probe-ID filtering is not itself qualification of geographic-region routing. Existing archive, audit and destination-secret custody obligations remain unchanged.

### RL-11 — ROUTING-001 deployment: approve with riders

*Date:* 26 October 2026 · *Ruled by:* ct · *Governs:* ROUTING-001

The preserved R1 and R2 source at dcac817f0de0622e866398142982efd247329ef4 is unlanded and has no recorded Verify qualification. Resume it only in a coordinated round that releases the protected deployment specification and expiry-routing writer together, publishes the additive 0076 deployment entry and proves effective-route expiry and renewal delivery. This policy ruling authorizes no protected-file edit or release and changes no completion status.

### RL-12 — ROUTING-001 DST proof: gap retained

*Date:* 26 October 2026 · *Ruled by:* ct · *Governs:* ROUTING-001

Saved-route samples at supplied DST instants qualify selection calculations only. Present-time confirmation and fallback restart qualify their observed runtime paths only. Their combination does not qualify real-alert dispatch across a daylight-saving transition. ROUTING-001 retains that qualification gap until an accepted public-runtime proof or an exact-SHA real-clock receipt demonstrates primary and fallback behavior through the transition, restart and the first permitted send without duplication.

### RL-101 — DEPENDENCY-002: Third-party service catalog

**Date:** 2026-10-28  
**Ruled by:** ct  
**Governs:** DEPENDENCY-002  
**Outcome:** adopt with rider

**Question:** May following Auth0 disclose the explicitly supplied tenant domain only to Auth0's official status endpoint?

**Default proposed/adopted:** No owner data leaves the generic catalog; tenant-scoped feeds are currently refused and Fastly prose is not guessed into status.

**Clause outcome:** Permit an explicitly reviewed Auth0 follow to send only the named tenant domain to the fixed official Auth0 status endpoint, disclose that egress before confirmation, and keep unusable or ambiguous provider sources Unknown without inferred status.

**Why:** Auth0's official subscription instructions explicitly require a tenant domain in its feed URL. Pingdom public status reports need no tenant authentication; no common norm covers all providers, so authorization is provider-specific and cannot extend to secrets, arbitrary hosts or tenant enumeration.

**Placement:** DEPENDENCY-002 owns the narrow disclosed egress exception to the catalog's no-owner-data rule; Base egress validation still applies. Fastly parsing is engineering, not a policy excuse to omit it or invent operational status.

**Sources:** [Auth0 RSS/Atom subscription URLs require the tenant domain.](https://support.auth0.com/center/s/article/How-to-subscribe-to-service-status-updates); [Pingdom publishes selected check statuses without a viewer login.](https://documentation.solarwinds.com/en/success_center/pingdom/content/topics/public-status-page.htm).

**Main read:** `2046e21acdec5a7386e1d14b0f9fabb436e027b5`, `CONTRACT.md:520`. No status change; all unfinished acceptance and proof remain owed.

### RL-13 — Translate and refuse Playwright imports

*Date:* 28 October 2026 (recorded from the carried adopted default; original adoption date was not recorded) · *Ruled by:* ct (carried adopted default) · *Governs:* FLOW-002

Default ADOPTED: the ct-approved translate-and-refuse step.

This records the existing default and changes no acceptance point or status.

### RL-14 — Read-key issuance and combined selectors

*Date:* 28 October 2026 (recorded from the carried adopted default; original adoption date was not recorded) · *Ruled by:* ct (carried adopted default) · *Governs:* READAPI-001

Default ADOPTED: owner-only issuance and intersecting combined selectors.

This records the existing default and changes no acceptance point or status.

### RL-15 — CI credentials and typed evaluation

*Date:* 28 October 2026 (recorded from the carried adopted default; original adoption date was not recorded) · *Ruled by:* ct (carried adopted default) · *Governs:* CODE-001

Default ADOPTED: owner-only fresh-MFA credential creation and local typed evaluation; clause text unchanged.

This records the existing default and changes no acceptance point or status.

### RL-16 — MFA delivery order

*Date:* 28 October 2026 (recorded from the carried adopted default; original adoption date was not recorded) · *Ruled by:* ct (carried adopted default) · *Governs:* ACCESS-003

Default ADOPTED: API/CLI first slice.

This records the existing default and changes no acceptance point or status.
