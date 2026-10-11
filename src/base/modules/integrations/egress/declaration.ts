export interface SeedExternalDeclaration {
  id: string;
  required: boolean;
  requiredWhen?: string;
  why: string;
  data: string[];
  adapters: string[];
}

export interface SeedEnvironmentDeclaration {
  name: string;
  required: boolean;
  requiredWhen?: string;
  secret: true;
  why: string;
}

export interface EgressSecretCustodyInput {
  /** Upper-case environment variable read only by server-side configuration. */
  name: string;
  /** What the secret authenticates or signs. Never put a value here. */
  purpose: string;
}

export type EgressDestinationInput =
  | { kind: 'provider'; id: string; description: string }
  | { kind: 'custom'; id: string; description: string };

export interface EgressDeclarationInput {
  /** Base seed.json externals[].id: a service or class of service, not a URL. */
  id: string;
  required: boolean;
  requiredWhen?: string;
  provider: { id: string; name: string };
  destination: EgressDestinationInput;
  /** Why an owned primitive cannot perform the provider's job. */
  why: string;
  /** Concrete product data items sent outside the deployment. */
  dataFields: readonly string[];
  /** Versioned seed.json extension IDs through which the service is replaceable. */
  adapters: readonly string[];
  /** Empty explicitly declares that this integration has no environment secrets. */
  custody: readonly EgressSecretCustodyInput[];
}

export interface EgressDeclaration {
  /** The only part to append to seed.json.externals. Matches Base SEED.schema.json. */
  external: SeedExternalDeclaration;
  /** Append these exact objects to seed.json.env. */
  env: SeedEnvironmentDeclaration[];
  /** Build-time/runtime wiring metadata; never a seed.json top-level field. */
  route: {
    provider: { id: string; name: string };
    destination: EgressDestinationInput;
    dataFields: string[];
    custody: Array<{ name: string; purpose: string; store: 'server-secret-store' }>;
  };
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const extensionIdPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.v[0-9]+$/;
const destinationIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/;
const environmentNamePattern = /^[A-Z][A-Z0-9_]*$/;

function nonEmptyText(value: unknown, name: string, maximum = 500): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
}

/**
 * Build a seed-compatible external declaration together with explicit provider,
 * destination, data-field and secret-custody metadata for consumer wiring.
 *
 * Base SEED.schema.json rejects unknown keys in an external declaration, so
 * provider and destination detail is represented in `why` and `route`, while
 * the manifest `external` object contains only fields the actual schema accepts.
 */
export function declareEgress(input: EgressDeclarationInput): EgressDeclaration {
  if (!input || typeof input !== 'object') throw new Error('Invalid egress declaration');
  if (!slugPattern.test(input.id)) throw new Error('Invalid external ID');
  if (typeof input.required !== 'boolean') throw new Error('Invalid external requirement');
  if (input.required) {
    if (input.requiredWhen !== undefined) throw new Error('A required external cannot have requiredWhen');
  } else {
    nonEmptyText(input.requiredWhen, 'external requiredWhen');
  }
  if (!input.provider || !slugPattern.test(input.provider.id)) throw new Error('Invalid egress provider ID');
  nonEmptyText(input.provider.name, 'egress provider name');
  if (!input.destination || !['provider', 'custom'].includes(input.destination.kind) ||
      !destinationIdPattern.test(input.destination.id)) throw new Error('Invalid egress destination');
  nonEmptyText(input.destination.description, 'egress destination description');
  nonEmptyText(input.why, 'external rationale');

  if (!Array.isArray(input.dataFields) || input.dataFields.length === 0 || input.dataFields.length > 100) {
    throw new Error('At least one outbound data field must be declared');
  }
  const dataFields = [...input.dataFields];
  dataFields.forEach((field, index) => nonEmptyText(field, `outbound data field ${index + 1}`));
  if (new Set(dataFields).size !== dataFields.length) throw new Error('Duplicate outbound data field');

  if (!Array.isArray(input.adapters) ||
      input.adapters.some(adapter => typeof adapter !== 'string' || !extensionIdPattern.test(adapter)) ||
      new Set(input.adapters).size !== input.adapters.length) {
    throw new Error('Invalid egress adapter IDs');
  }

  if (!Array.isArray(input.custody)) throw new Error('Egress secret custody must be declared');
  const custody = input.custody.map((secret, index) => {
    if (!secret || typeof secret !== 'object' || !environmentNamePattern.test(secret.name)) {
      throw new Error(`Invalid egress secret declaration ${index + 1}`);
    }
    nonEmptyText(secret.purpose, `egress secret purpose ${index + 1}`);
    return { name: secret.name, purpose: secret.purpose };
  });
  if (new Set(custody.map(secret => secret.name)).size !== custody.length) throw new Error('Duplicate egress secret declaration');

  const destinationKind = input.destination.kind === 'custom' ? 'custom destination' : 'provider destination';
  const external: SeedExternalDeclaration = {
    id: input.id,
    required: input.required,
    ...(input.requiredWhen === undefined ? {} : { requiredWhen: input.requiredWhen }),
    why: `${input.provider.name} (${input.provider.id}) sends to ${destinationKind} ${input.destination.id}: ${input.destination.description}. ${input.why}`,
    data: [...dataFields],
    adapters: [...input.adapters],
  };
  const env: SeedEnvironmentDeclaration[] = custody.map(secret => ({
    name: secret.name,
    required: input.required,
    ...(input.requiredWhen === undefined ? {} : { requiredWhen: input.requiredWhen }),
    secret: true,
    why: `${secret.purpose} for ${input.provider.name}; load from server-side secret storage and never expose to browser code or logs.`,
  }));

  return {
    external,
    env,
    route: {
      provider: { id: input.provider.id, name: input.provider.name },
      destination: { ...input.destination },
      dataFields: [...dataFields],
      custody: custody.map(secret => ({ ...secret, store: 'server-secret-store' as const })),
    },
  };
}
