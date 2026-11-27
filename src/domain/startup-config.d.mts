export interface ConfigurationRule { name: string; scopes: string[]; required: string; when?: (env: Record<string, unknown>) => boolean; valid: (value: unknown, env: Record<string, unknown>) => unknown }
export const configurationTable: readonly ConfigurationRule[];
export function requiredConfiguration(env: object, scope?: string): ConfigurationRule[];
export function validateConfiguration(env: object, options?: {scope?: string; suppliedOnly?: boolean}): void;
export function validateWorkerConfiguration(env: object): Promise<void>;
export function configurationResponse(env: object): Promise<Response | null>;
export const WORKER_ADMITTED: string;
export const WORKER_NOT_ADMITTED: string;
export function validateWorkerBindings(env: object): boolean;
