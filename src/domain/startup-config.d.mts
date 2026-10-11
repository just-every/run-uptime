export interface ConfigurationRule { name: string; scopes: string[]; required: string; when?: (env: Record<string, unknown>) => boolean; valid: (value: unknown, env: Record<string, unknown>) => unknown }
export const configurationTable: readonly ConfigurationRule[];
export function requiredConfiguration(env: object, scope?: string): ConfigurationRule[];
export function validateConfiguration(env: object, options?: {scope?: string; suppliedOnly?: boolean}): void;
export function configurationResponse(env: object): Response | null;
