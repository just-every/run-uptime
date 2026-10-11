# Egress declarations

`declareEgress()` makes the provider, provider-managed or custom destination, outbound data fields, replaceable adapter, and secret custody explicit. It returns two manifest fragments and runtime wiring metadata:

- Append only `declaration.external` to `seed.json → externals`.
- Append `declaration.env` to `seed.json → env`.
- Keep `declaration.route` as consumer wiring metadata; it is not a `seed.json` property.

Base's `SEED.schema.json` external object accepts only `id`, `required`, optional `requiredWhen`, `why`, `data`, and `adapters`. The provider and destination are stated in `why`; data fields map directly to `data`; and the secret environment variables map to the actual `env` definition. Do not copy the helper's route metadata into `seed.json` or add invented `provider`, `destination`, `custody`, or `dataFields` keys to an external object.

```ts
import { declareEgress, validateEgressConfiguration } from './egress/index.ts';

const declaration = declareEgress({
  id: 'customer-webhook',
  required: false,
  requiredWhen: 'CUSTOMER_WEBHOOK_ENABLED=true',
  provider: { id: 'customer-webhook', name: 'Customer webhook receiver' },
  destination: { kind: 'custom', id: 'customer-events', description: "the customer's configured event receiver" },
  why: 'A customer-owned receiver processes events outside the deployment.',
  dataFields: ['event name', 'delivery ID', 'approved event payload'],
  adapters: ['integrations.webhook.v1'],
  custody: [{ name: 'CUSTOMER_WEBHOOK_SIGNING_KEY', purpose: 'signs exact webhook request bytes' }],
});

const manifestExternal = declaration.external;
const manifestEnvironment = declaration.env;
const validated = validateEgressConfiguration(declaration, {
  providerId: 'customer-webhook',
  destinationId: 'customer-events',
  destinationUrl: trustedDestinationFromServerConfiguration,
  secrets: { CUSTOMER_WEBHOOK_SIGNING_KEY: signingKeyFromServerSecretStore },
});
```

Treat `validated.destinationUrl` as sensitive if a provider uses a secret URL. It is intended for a trusted core `DeliveryProtocol` and must not be logged or persisted in delivery rows. `validateEgressConfiguration()` reuses the core destination policy, rejects configuration that does not match its declaration, and checks required secret values without returning them. It is a configuration preflight only: consumer code must still authorize destination changes and use core `DeliveryService` with a `TrustedTransport` that pins validated public DNS at connect time, verifies TLS, and does not follow redirects. Plain `fetch()` remains unsupported by the integration contract.

Literal configuration and every DNS answer use the [same maintained public-address policy](../core/public-address.ts), described in the [core contract](../core/CONTRACT.md). Special-purpose and transition addresses reject even when globally reachable, including Azure's platform virtual address and ISATAP identifiers. A public answer cannot authorize another non-public answer in the same DNS response. Worker deployments must enforce this policy at their trusted egress connection boundary too.
