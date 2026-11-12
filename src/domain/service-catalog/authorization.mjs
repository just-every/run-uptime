// RL-101 releases one tenant-domain disclosure, never a general URL or tenant search.
// The request always goes to Auth0; the tenant is data in its sole query parameter.
import {publicTarget} from '../public-target.mjs';
export const AUTH0_ENDPOINT = 'https://status.auth0.com/rss';
export const AUTH0_REVIEW_MS = 10 * 60_000;
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => plain(value) && Object.keys(value).sort().join() === keys.slice().sort().join();
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
// Auth0's tenant namespace, including regional tenant names. Custom domains and
// arbitrary hosts are not admitted by this narrow catalog exception.
const TENANT = new RegExp(`^${LABEL}(?:\\.(?:us|eu|au|jp|uk|ca))?\\.auth0\\.com$`);
export function auth0Tenant(value) {
  if (typeof value !== 'string' || value.length > 253 || !TENANT.test(value)) throw Error('Supply one Auth0 tenant domain, without a URL, credentials, query, wildcard or list.');
  return value;
}
export function auth0Disclosure(tenantDomain) {
  const tenant = auth0Tenant(tenantDomain), endpoint = publicTarget(AUTH0_ENDPOINT).href;
  return {provider: 'Auth0', endpoint, tenantDomain: tenant, method: 'GET',
    url: `${endpoint}?domain=${encodeURIComponent(tenant)}`,
    data: ['The named tenant domain in the domain query parameter', 'Request time and the runner source address'],
    purpose: 'One bounded status-source check. No credentials or other owner data are sent. No redirect is followed. An unqualified status remains Unknown; nothing is followed.'};
}
export function auth0Selection(input) {
  if (!plain(input) || Object.keys(input).some(key => !['entry', 'scope', 'tenantDomain', 'review', 'consent'].includes(key)) || input.entry !== 'auth0' || input.scope !== 'whole') throw Error('Invalid Auth0 catalog check');
  return {entry: 'auth0', scope: 'whole', tenantDomain: auth0Tenant(input.tenantDomain)};
}
const AUTH_KEYS = ['tenantDomain', 'endpoint', 'catalogVersion', 'reviewerId', 'reviewerVersion', 'reviewerRevision', 'reviewedAt', 'expiresAt', 'confirmedAt', 'consent', 'review'];
// Persisted job specs and runner results retain the same exact reviewed binding.
// Authentication of the review token is the native owner's admission duty;
// runners accept only that admitted spec and independently constrain its egress.
export function validateAuth0Spec(spec, version) {
  if (!exact(spec, ['entry', 'scope', 'tenantDomain', 'authorization']) || spec.entry !== 'auth0' || spec.scope !== 'whole') throw Error('Invalid reviewed Auth0 check');
  const tenant = auth0Tenant(spec.tenantDomain), a = spec.authorization;
  if (!exact(a, AUTH_KEYS) || a.tenantDomain !== tenant || a.endpoint !== AUTH0_ENDPOINT || a.catalogVersion !== version || a.consent !== true ||
      typeof a.reviewerId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(a.reviewerId) ||
      !Number.isSafeInteger(a.reviewerVersion) || a.reviewerVersion < 1 || !Number.isSafeInteger(a.reviewerRevision) || a.reviewerRevision < 0 ||
      !Number.isSafeInteger(a.reviewedAt) || !Number.isSafeInteger(a.expiresAt) || a.expiresAt !== a.reviewedAt + AUTH0_REVIEW_MS ||
      !Number.isSafeInteger(a.confirmedAt) || a.confirmedAt < a.reviewedAt || a.confirmedAt > a.expiresAt ||
      typeof a.review !== 'string' || a.review.length > 2048 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(a.review)) throw Error('Invalid Auth0 egress authorization');
  return auth0Disclosure(tenant);
}
