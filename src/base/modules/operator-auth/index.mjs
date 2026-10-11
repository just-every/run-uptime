// Server-only entry. Never import this module into browser components/loaders.
export { createOperatorAuth } from './service.mjs';
export { createAuthHandler } from './routes.mjs';
export { AuthError } from './errors.mjs';
export { DEFAULT_ROLES, defaultRolePolicy, normalizeEmail, safeReturnTo, isActiveOperator } from './policy.mjs';
export { requireLoopback, isLoopbackHost, securityHeaders } from './http.mjs';
