# Native agent conformance fixture contract

These modules drive the emitted Worker's existing native HTTP doors. They do
not create a separate Worker, replace application services, write D1 tables,
invent observations, or expose fixture HTTP routes.

Descriptor wiring:

```json
{
  "verification": {
    "owner": {
      "bindings": {"SESSION_SECRET": "sessionSecret"},
      "initializer": "tests/agent-conformance/owner.mjs"
    },
    "reviewers": [{
      "label": "member",
      "email": "synthetic-agent-member@example.invalid",
      "initializer": "tests/agent-conformance/reviewer.mjs"
    }],
    "fixtures": {"module": "tests/agent-conformance/fixtures.mjs"},
    "proof": {"module": "tests/agent-conformance/proof.mjs"}
  }
}
```

The installation must use a supported captured mail provider (Resend,
SendGrid or Cloudflare). Development mail does not provide the verifier's
reviewer mailbox. Owner initialization consumes the signed claim, enrolls a
real TOTP authenticator, completes `/setup`, and initializes the native member.
The member is invited through `/api/access/invitations`, confirms the accepted
mail link through `/auth/confirm`, and enrolls its own authenticator. Sessions
and authenticator custody remain in Node memory and are never fixture values.

`fixtures.mjs` default-exports `prepare(context)`, returning `{values,clients}`.
The initial unanswered-policy round returns empty objects. All later rounds
prepare fresh native records and remove prior test monitors using their native
erasure door before the verifier takes its no-effect witness. No local clients
are declared. Values are accessed with `{"$fixture":"NAME","pointer":"/FIELD"}`:

| Value | Fields and intended use |
| --- | --- |
| `monitor` | Native `{id,revision,definition}` for reads and grant targeting. |
| `update` | Independent enabled public HTTP monitor `{id,revision,definition}`. Change `url` and add a TLS fingerprint to exercise `live`, `external`, `security` together. |
| `pause` | Independent enabled monitor `{id,revision,definition}`. |
| `resume` | Independent disabled monitor `{id,revision,definition}`. |
| `check` | Independent enabled monitor `{id,revision,definition}` for manual queueing. |
| `maintenance` | Independent disabled monitor `{id,revision,definition}` for maintenance preview/apply. |
| `erase` | Independent monitor `{id,revision,definition,name}`; pass `name` as `confirmation`. |
| `route` | `{id,policy}`; policy is native monitor-scoped selected routing, with one real enabled destination and `expectedRevision:0`. Preview it and use that result's digest for update. |
| `window` | Valid future one-time UTC suppression window; pass it with `[maintenance.id]` to preview and apply. |
| `destination` | `{id}` of a real enabled default signed webhook destination. Native public metadata intentionally does not reveal its credential ID. |
| `member` | `{id,revision}` of the confirmed responder. Ordinary access update should use `role:"read-only",scopes:[]`, preserving its Base member session for the next round. |
| `owner` | `{id,revision}` from the owner's native access self door. |
| `grant` | `{id,operatorId}` naming the read monitor and confirmed member. `granted:true` is a real ordinary evidence-access widening; sponsor self-grant uses `{$sponsor:"id"}` instead. |
| `incident` | `{id,version}` created from independently evaluated native scheduled heartbeat failure. Re-read its native version after assignment before acknowledgment. |
| `runner` | `{id}` of the real native runner that produced the heartbeat evidence. Its secret is withheld. |
| `discovery` | `{id}` of a real queued owner-created discovery for metadata reads. No discovery outcome is fabricated. |
| `definition` | Complete public enabled HTTP creation input with TLS fingerprint; computes `live`, `external`, `security`. Its name uses the fixture cleanup prefix. |
| `definitionText` | Valid version-one native monitor definition document for the read-only recognition tool. |

The incident helper issues a real native heartbeat key, submits an authenticated
failure receipt, claims its scheduled slot with two newly issued and independently enrolled
native runners, executes the production `probeHeartbeat` against that claim's
immutable snapshot, and signs each vantage’s result through `/api/runner/results`. It
requires accepted evidence and reads the resulting real incident. No target
network traffic or invented successful observation is involved. Afterward the
monitor is paused through the ordinary native scheduling door.

`proof.mjs` default-exports the verifier's native proof callback. It uses the
hook's already authenticated person request, refreshes real MFA if needed, and
posts the exact current agent ID, tool and argument object to
`/agents/native-proof`. It returns only the native reference. The proof binds
the exact arguments after Base removes reserved idempotency/revision fields.

The three `*.dispatch` tools require an original trusted operation ID and
their native continuation records. Published rer 0.2.93 supplies
`exposure: 'invoke'`: they stay in the native registry for final worker
admission, are hidden from MCP and are absent from the public descriptor and
mandatory MCP journey, as ct ruled on 29 October at 14:12Z. Their existing
native continuation-identity, final-admission and MCP refusal assertions remain
in `tests/agent-door.mjs`. This does not claim the optional worker lifecycle
family. Record-subject security/access tools also cannot produce
sponsor self-escalation fixtures without an applicable declaration; the real
evidence grant tool can and retains its mandatory self-grant refusal fixture.

The owner initializer runs before the verifier chooses its random conformance
agent ID. Preparation has no agent-ID argument; after initial discovery it may
read the native `/agents/api/agents` inventory. The proof callback receives the
current agent ID explicitly. There is no fixture signer or privileged policy
writer for manufacturing agent-specific policy limits.

Fixture HTTP monitors select an explicitly enrolled private vantage. Their
requests stay queued until that runner polls; CORE does not claim worker
completion. Cleanup lists records through `/api/v1/monitors`, which never
kicks hosted work. Discovery identifiers are retained from completed native
responses and cancelled through their native door between phases.

The journey hooks compare independently observed scheduled history around
incident work. The native journey proves that exact-key manual replay queues
one effect, unobserved work stays Unknown, and both signed failed vantages
remain visible. Diagnostic audit reads print only operation names and error
codes from the disposable installation. No assertion is suppressed.

Post-mutation injection probes retain their adversarial instruction arguments
and the native stale-version and missing-record guards. Published rer 0.2.94
keeps each mutation's originally admitted arguments and exact idempotency key
(`conformance/injection.mjs`, called from `conformance/journey.mjs`), so a probe
retries the same operation after its original version or target is consumed.
Read-only prerequisites still refresh without creating another write effect.
The approved erasure retry uses Base's trusted completed effect facts only
after rechecking current workspace-owner authority; native proof and current
policy still apply. Its exact-key replay, Pause and proof refusals, and
fresh-key missing-target refusal are asserted in the native journey. This
adapts the seed classifier without claiming a general fix for Base's deferred
A1 limitation. Neither fixture code nor native authorization bypasses admission.

The descriptor corrects the initial overclaim that five record jobs widen their
own sponsor. Their published surface-only `sponsorEscalation:false` declaration
describes the native resolver; runtime authority checks are always on. The evidence-viewer grant keeps
`sponsorEscalation:true` and its mandatory self-grant refusal. Hooks compare
current native sponsor authority before and after each record job, and the
native journey proves that a fully authenticated owner still cannot edit its
own assignment. No Base assertion, policy check or native guard is edited.
