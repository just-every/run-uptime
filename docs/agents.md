## Current agent surface

This public catalogue describes the callable native monitoring tools. It contains no installation records or credentials. Reading it does not run a tool or contact a provider. Tool execution requires authenticated current authority and the company policy in force.

Declared capabilities: `tools`, `policy`, `pause`, `audit`, `idempotency`.
Undeclared capabilities: `events`, `resources`, `prompts`, `subscriptions`.

## Callable tools

These names come from the native action registry, excluding internal worker admissions. Classes below are declarations; the actual call computes its facts and classes from current native state. A listed tool is not permission to run it.

### Access

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.access.update` | Change a native member product role and service and team scopes | `access` | `uptime:operate` |

### Checks

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.checks.run` | Queue a real manual check without changing scheduled health | `external`, `live` | `uptime:operate` |

### Definitions

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.definitions.preview` | Recognize a native definition file without applying it | `standard` | `definitions:preview` |
| `uptime.definitions.read` | Read redacted native definitions | `standard` | `uptime:read` |

### Destinations

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.destinations.drill` | Queue a native recipient-confirmed channel drill | `external` | `uptime:operate` |
| `uptime.destinations.read` | Read destination metadata without endpoint secrets | `standard` | `uptime:read` |
| `uptime.destinations.test` | Queue an attributed native test send | `external` | `uptime:operate` |
| `uptime.destinations.update` | Update a native notification destination | `live`, `access` | `uptime:operate` |

### Discovery

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.discovery.read` | Read a native discovery outcome | `standard` | `uptime:read` |
| `uptime.discovery.start` | Start bounded native read-only website discovery | `external` | `uptime:operate` |

### Evidence

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.evidence.read` | Read authorized private failure snapshots | `sensitive` | `uptime:evidence` |
| `uptime.evidence.witness` | Read native monitoring change witness | `standard` | `uptime:read` |

### Grants

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.grants.read` | Read native effect and evidence grants | `standard` | `uptime:read` |
| `uptime.grants.update` | Change a native private-evidence viewer grant | `access`, `security` | `uptime:operate` |

### Incidents

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.incidents.acknowledge` | Acknowledge an incident without asserting recovery | `standard` | `uptime:operate` |
| `uptime.incidents.assign` | Assign an eligible native responder | `standard` | `uptime:operate` |
| `uptime.incidents.note` | Add an internal incident note | `standard` | `uptime:operate` |
| `uptime.incidents.read` | Read incident coordination | `standard` | `uptime:read` |

### Maintenance

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.maintenance.preview` | Preview an exact native maintenance selection | `standard` | `uptime:operate` |
| `uptime.maintenance.read` | Read a monitor maintenance calendar | `standard` | `uptime:read` |
| `uptime.maintenance.update` | Apply the exact previewed maintenance calendar | `live` | `uptime:operate` |

### Monitors

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.monitors.create` | Create a native monitor | `live`, `external`, `security` | `uptime:operate` |
| `uptime.monitors.history` | Read immutable check observations | `standard` | `uptime:read` |
| `uptime.monitors.list` | List visible monitors | `standard` | `uptime:read` |
| `uptime.monitors.pause` | Pause native monitor scheduling | `live` | `uptime:operate` |
| `uptime.monitors.read` | Read one monitor | `standard` | `uptime:read` |
| `uptime.monitors.resume` | Resume native monitor scheduling | `live` | `uptime:operate` |
| `uptime.monitors.revisions` | Read immutable monitor revisions | `standard` | `uptime:read` |
| `uptime.monitors.update` | Update a native monitor definition | `standard`, `live`, `external`, `security` | `uptime:operate` |

### Privacy

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.privacy.erase` | Erase a native monitor and dependent records | `destructive` | `uptime:operate` |

### Reports

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.reports.read` | Read monitor availability report | `standard` | `uptime:read` |

### Routes

| Tool | Job | Declared classes | Required scope |
| --- | --- | --- | --- |
| `uptime.routes.preview` | Preview a native alert route | `standard` | `uptime:operate` |
| `uptime.routes.read` | Read monitor alert routing | `standard` | `uptime:read` |
| `uptime.routes.update` | Apply an exact native alert-route preview | `live`, `external`, `access` | `uptime:operate` |

## Resource templates

Declared resource templates: none. Resources are undeclared and unavailable. The resource-template discovery inventory is empty. Internal templates retained in the implementation are not callable resources and are not advertised here. This does not establish complete resource acceptance.

## Qualification boundary

This catalogue covers the current callable inventory. It does not establish complete computed-class test attribution, generated discovery instructions, event types, capacity limits, error codes or specialist jobs. Prompts, events and subscriptions remain undeclared. Broader lifecycle, two-policy conformance, stranger-agent and console qualification remain separate work.

See [Monitoring API and CSV](/docs/read-api) and [Security](/docs/security) for the existing native API and authority boundaries.
