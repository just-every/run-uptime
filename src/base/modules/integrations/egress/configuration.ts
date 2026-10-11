import { validateDestination } from '../core/destination.ts';
import type { EgressDeclaration } from './declaration.ts';

export interface EgressRuntimeConfiguration {
  providerId: string;
  destinationId: string;
  destinationUrl: string;
  /** Values are loaded by the consumer from server-side secret custody. */
  secrets: Readonly<Record<string, string | undefined>>;
}

export interface ValidatedEgressConfiguration {
  providerId: string;
  destinationId: string;
  /** May contain a secret path/query; keep in server memory and never log it. */
  destinationUrl: string;
}

/**
 * Validate a trusted server-side egress configuration before creating a core
 * DeliveryProtocol. Core validates destinations again and the configured
 * TrustedTransport must enforce DNS pinning, verified TLS and no redirects at
 * connection time; this startup check is not a network-boundary substitute.
 */
export function validateEgressConfiguration(
  declaration: EgressDeclaration,
  configuration: EgressRuntimeConfiguration,
): ValidatedEgressConfiguration {
  if (!declaration || !configuration || typeof configuration !== 'object') {
    throw new Error('Invalid egress configuration');
  }
  if (configuration.providerId !== declaration.route.provider.id) throw new Error('Egress provider does not match its declaration');
  if (configuration.destinationId !== declaration.route.destination.id) throw new Error('Egress destination does not match its declaration');

  let destinationUrl: URL;
  try {
    destinationUrl = validateDestination(configuration.destinationUrl);
  } catch {
    // Keep URL contents (which may include provider secrets) out of diagnostics.
    throw new Error('Invalid public HTTPS egress destination');
  }

  if (!configuration.secrets || typeof configuration.secrets !== 'object' || Array.isArray(configuration.secrets)) {
    throw new Error('Egress secret configuration is missing');
  }
  for (const secret of declaration.route.custody) {
    const value = configuration.secrets[secret.name];
    if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) {
      throw new Error(`Missing or invalid egress secret: ${secret.name}`);
    }
  }

  return Object.freeze({
    providerId: declaration.route.provider.id,
    destinationId: declaration.route.destination.id,
    destinationUrl: destinationUrl.href,
  });
}
